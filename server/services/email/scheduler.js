const os = require('os');

const EmailJob = require('../../models/EmailJob');
const EmailSettings = require('../../models/EmailSettings');
const Suppression = require('../../models/Suppression');
const EmailTemplate = require('../../models/EmailTemplate');
const AutomationRule = require('../../models/AutomationRule');
const Contact = require('../../models/Contact');
const Realtor = require('../../models/Realtor');
const Company = require('../../models/Company');
const { renderTemplate } = require('./renderTemplate');
const provider = require('./provider');
const { normalizeEmail } = require('../../utils/normalizeEmail');

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PROCESSING_MS = Number(process.env.STALE_PROCESSING_MS) || 10 * 60 * 1000;
const MAX_EMAIL_ATTEMPTS = Number(process.env.MAX_EMAIL_ATTEMPTS) || 3;
const LOG_LEVEL = String(process.env.EMAIL_PROCESSOR_LOG_LEVEL || 'info').toLowerCase();
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function getWorkerId() {
  if (process.env.EMAIL_WORKER_ID) return String(process.env.EMAIL_WORKER_ID);
  return `${os.hostname()}:${process.pid}`;
}

function truncateError(value, max = 300) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= max) return str;
  return str.slice(0, max);
}

function shouldLog(level) {
  const normalized = String(level || 'info').toLowerCase();
  const order = { debug: 0, info: 1, warn: 2 };
  const current = order[LOG_LEVEL] ?? order.info;
  const requested = order[normalized] ?? order.info;
  return requested >= current;
}

function logJobEvent(level, message, meta) {
  if (!shouldLog(level)) return;
  const payload = meta && typeof meta === 'object' ? meta : undefined;
  if (level === 'warn') {
    console.warn(message, payload || '');
    return;
  }
  console.log(message, payload || '');
}

function parseTimeToMinutes(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const [hours, minutes] = trimmed.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return fallback;
  return hours * 60 + minutes;
}

function normalizeAllowedDays(days) {
  if (!Array.isArray(days)) return [];
  return days
    .map((d) => Number(d))
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekdayIndex: WEEKDAY_INDEX[map.weekday] ?? 0
  };
}

function getTimeZoneOffset(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return (utcGuess - date.getTime()) / 60000;
}

function makeDateInTimeZone({ year, month, day, hour, minute }, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset * 60000);
}

function moveToStartOfDay(date, timeZone, startMinutes) {
  const parts = getZonedParts(date, timeZone);
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  return makeDateInTimeZone({ year: parts.year, month: parts.month, day: parts.day, hour, minute }, timeZone);
}

function moveToNextAllowedDay(date, timeZone, allowedDays, startMinutes) {
  let candidate = new Date(date.getTime());
  for (let i = 0; i < 8; i += 1) {
    candidate = new Date(candidate.getTime() + DAY_MS);
    const parts = getZonedParts(candidate, timeZone);
    if (!allowedDays.length || allowedDays.includes(parts.weekdayIndex)) {
      return moveToStartOfDay(candidate, timeZone, startMinutes);
    }
  }
  return moveToStartOfDay(candidate, timeZone, startMinutes);
}

function getNormalizedSettings(settings = {}) {
  const timeZone = settings.timezone || 'UTC';
  const allowedDays = normalizeAllowedDays(settings.allowedDays);
  const startMinutes = parseTimeToMinutes(settings.allowedStartTime, 9 * 60);
  const endMinutes = parseTimeToMinutes(settings.allowedEndTime, 17 * 60);
  const quietHoursEnabled = settings.quietHoursEnabled !== false;
  return {
    timeZone,
    allowedDays,
    startMinutes,
    endMinutes,
    quietHoursEnabled
  };
}

function isWithinAllowedWindow(date, settings) {
  const normalized = getNormalizedSettings(settings);
  const parts = getZonedParts(date, normalized.timeZone);
  if (normalized.allowedDays.length && !normalized.allowedDays.includes(parts.weekdayIndex)) {
    return false;
  }
  if (!normalized.quietHoursEnabled) return true;
  if (normalized.startMinutes == null || normalized.endMinutes == null) return true;
  if (normalized.startMinutes > normalized.endMinutes) return true;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= normalized.startMinutes && minutes < normalized.endMinutes;
}

function adjustToAllowedWindow(date, settings) {
  const normalized = getNormalizedSettings(settings);
  let candidate = new Date(date.getTime());

  for (let i = 0; i < 14; i += 1) {
    const parts = getZonedParts(candidate, normalized.timeZone);
    const dayAllowed =
      !normalized.allowedDays.length || normalized.allowedDays.includes(parts.weekdayIndex);

    if (!dayAllowed) {
      candidate = moveToNextAllowedDay(candidate, normalized.timeZone, normalized.allowedDays, normalized.startMinutes);
      continue;
    }

    if (!normalized.quietHoursEnabled || normalized.startMinutes == null || normalized.endMinutes == null) {
      return candidate;
    }

    if (normalized.startMinutes > normalized.endMinutes) return candidate;

    const minutes = parts.hour * 60 + parts.minute;
    if (minutes < normalized.startMinutes) {
      return moveToStartOfDay(candidate, normalized.timeZone, normalized.startMinutes);
    }
    if (minutes >= normalized.endMinutes) {
      candidate = moveToNextAllowedDay(candidate, normalized.timeZone, normalized.allowedDays, normalized.startMinutes);
      continue;
    }
    return candidate;
  }

  return candidate;
}

function getLocalDayBounds(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const start = makeDateInTimeZone(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 },
    timeZone
  );
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

async function getEmailSettings(companyId) {
  if (!companyId) throw new Error('companyId is required');
  let settings = await EmailSettings.findOne({ companyId }).lean();
  if (settings) return settings;

  const company = await Company.findById(companyId).select('settings.timezone').lean();
  const timezone = company?.settings?.timezone || 'America/Chicago';

  try {
    settings = await EmailSettings.create({ companyId, timezone });
    return settings.toObject();
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await EmailSettings.findOne({ companyId }).lean();
      if (existing) return existing;
    }
    throw err;
  }
}

function buildContactMergeData(contact) {
  if (!contact) return {};
  const firstName = contact.firstName || '';
  const lastName = contact.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const status = contact.status || '';

  return {
    firstName,
    lastName,
    fullName,
    email: contact.email || '',
    phone: contact.phone || '',
    status,
    contact: {
      firstName,
      lastName,
      fullName,
      email: contact.email || '',
      phone: contact.phone || '',
      status
    }
  };
}

async function isSuppressed(companyId, email, contact = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { suppressed: true, reason: 'missing_email' };
  if (contact?.doNotEmail) return { suppressed: true, reason: 'do_not_email' };

  const suppression = await Suppression.findOne({
    companyId,
    email: normalized
  }).lean();

  if (suppression) return { suppressed: true, reason: suppression.reason || 'suppressed' };
  return { suppressed: false };
}

async function enforceDailyCap(companyId, settings, scheduledFor) {
  const cap = Number(settings?.dailyCap);
  if (!cap || Number.isNaN(cap)) return scheduledFor;

  const { start, end } = getLocalDayBounds(scheduledFor, settings.timezone || 'UTC');
  const count = await EmailJob.countDocuments({
    companyId,
    scheduledFor: { $gte: start, $lt: end },
    status: { $in: [EmailJob.STATUS.QUEUED, EmailJob.STATUS.SENT] }
  });

  if (count < cap) return scheduledFor;

  const nextDay = new Date(end.getTime() + 1000);
  return adjustToAllowedWindow(nextDay, settings);
}

async function enqueueEmailJob({
  companyId,
  to,
  contactId = null,
  realtorId = null,
  lenderId = null,
  templateId,
  ruleId = null,
  scheduleId = null,
  scheduleStepId = null,
  campaignId = null,
  data = {},
  scheduledFor = null,
  delayMinutes = 0,
  providerName = 'mock',
  meta = {}
}) {
  if (!companyId) throw new Error('companyId is required');
  if (!templateId) throw new Error('templateId is required');

  const settings = await getEmailSettings(companyId);

  let targetDate = scheduledFor ? new Date(scheduledFor) : null;
  if (!targetDate || Number.isNaN(targetDate.getTime())) {
    targetDate = new Date(Date.now() + Math.max(0, delayMinutes) * 60000);
  }
  targetDate = adjustToAllowedWindow(targetDate, settings);
  targetDate = await enforceDailyCap(companyId, settings, targetDate);

  const email = normalizeEmail(to);
  if (email) {
    to = email;
  }
  if (!email && contactId) {
    const contact = await Contact.findOne({ _id: contactId, company: companyId })
      .select('email doNotEmail emailPaused')
      .lean();
    if (contact?.email) {
      to = normalizeEmail(contact.email);
    }
    const suppressionCheck = await isSuppressed(companyId, contact?.email, contact);
    if (suppressionCheck.suppressed) {
      return { skipped: true, reason: suppressionCheck.reason };
    }
  } else if (email) {
    const suppressionCheck = await isSuppressed(companyId, email);
    if (suppressionCheck.suppressed) {
      return { skipped: true, reason: suppressionCheck.reason };
    }
  }

  if (!to) return { skipped: true, reason: 'missing_email' };

  const job = await EmailJob.create({
    companyId,
    to,
    contactId,
    realtorId,
    lenderId,
    templateId,
    ruleId,
    scheduleId,
    scheduleStepId,
    campaignId,
    data,
    scheduledFor: targetDate,
    status: EmailJob.STATUS.QUEUED,
    provider: providerName || 'mock',
    meta
  });

  return { job: job.toObject() };
}

async function claimNextDueJob({ now = new Date(), workerId = getWorkerId() } = {}) {
  const filter = {
    status: EmailJob.STATUS.QUEUED,
    scheduledFor: { $lte: now },
    $or: [
      { nextAttemptAt: { $exists: false } },
      { nextAttemptAt: null },
      { nextAttemptAt: { $lte: now } }
    ]
  };

  return EmailJob.findOneAndUpdate(
    filter,
    {
      $set: {
        status: EmailJob.STATUS.PROCESSING,
        processingAt: now,
        processingBy: workerId
      },
      $inc: { attempts: 1 }
    },
    { sort: { scheduledFor: 1, createdAt: 1 }, new: true }
  ).lean();
}

async function requeueStaleJobs({ now = new Date(), staleMs = STALE_PROCESSING_MS } = {}) {
  if (!staleMs || staleMs <= 0) return { requeued: 0 };
  const cutoff = new Date(now.getTime() - staleMs);
  const retryAt = new Date(now.getTime() + 60 * 1000);

  const result = await EmailJob.updateMany(
    {
      status: EmailJob.STATUS.PROCESSING,
      processingAt: { $lte: cutoff }
    },
    {
      $set: {
        status: EmailJob.STATUS.QUEUED,
        nextAttemptAt: retryAt,
        lastError: 'STALE_PROCESSING'
      },
      $unset: { processingAt: '', processingBy: '' }
    }
  );

  return { requeued: result.modifiedCount || 0 };
}

function buildProcessingFilter(jobId, workerId) {
  return {
    _id: jobId,
    status: EmailJob.STATUS.PROCESSING,
    processingBy: workerId
  };
}

async function markJobQueued(jobId, workerId, { scheduledFor, nextAttemptAt, lastError } = {}) {
  const updates = {
    status: EmailJob.STATUS.QUEUED,
    lastError: lastError || null,
    nextAttemptAt: nextAttemptAt || null
  };
  if (scheduledFor) updates.scheduledFor = scheduledFor;
  return EmailJob.updateOne(
    buildProcessingFilter(jobId, workerId),
    { $set: updates, $unset: { processingAt: '', processingBy: '' } }
  );
}

async function markJobSkipped(jobId, workerId, reason) {
  return EmailJob.updateOne(
    buildProcessingFilter(jobId, workerId),
    {
      $set: {
        status: EmailJob.STATUS.SKIPPED,
        lastError: reason || 'SKIPPED',
        nextAttemptAt: null
      },
      $unset: { processingAt: '', processingBy: '' }
    }
  );
}

async function markJobCanceled(jobId, workerId, reason) {
  return EmailJob.updateOne(
    buildProcessingFilter(jobId, workerId),
    {
      $set: {
        status: EmailJob.STATUS.CANCELED,
        lastError: reason || 'CANCELED',
        nextAttemptAt: null
      },
      $unset: { processingAt: '', processingBy: '' }
    }
  );
}

async function markJobFailed(jobId, workerId, reason) {
  return EmailJob.updateOne(
    buildProcessingFilter(jobId, workerId),
    {
      $set: {
        status: EmailJob.STATUS.FAILED,
        lastError: reason || 'FAILED',
        nextAttemptAt: null
      },
      $unset: { processingAt: '', processingBy: '' }
    }
  );
}

async function markJobSent(jobId, workerId, { providerMessageId, sentAt } = {}) {
  return EmailJob.updateOne(
    buildProcessingFilter(jobId, workerId),
    {
      $set: {
        status: EmailJob.STATUS.SENT,
        providerMessageId: providerMessageId || null,
        lastError: null,
        sentAt: sentAt || new Date(),
        nextAttemptAt: null
      },
      $unset: { processingAt: '', processingBy: '' }
    }
  );
}

async function processDueEmailJobs({
  limit = Number(process.env.MAX_JOBS_PER_TICK) || 25,
  staleMs = STALE_PROCESSING_MS,
  workerId = getWorkerId()
} = {}) {
  const now = new Date();
  const staleResult = await requeueStaleJobs({ now, staleMs });
  if (staleResult.requeued > 0) {
    logJobEvent('warn', '[email] stale jobs requeued', { count: staleResult.requeued });
  }

  const settingsCache = new Map();
  const suppressionCache = new Map();
  let processed = 0;

  for (let i = 0; i < limit; i += 1) {
    const job = await claimNextDueJob({ now: new Date(), workerId });
    if (!job) break;
    logJobEvent('info', '[email] job claimed', {
      jobId: job._id,
      scheduledFor: job.scheduledFor
    });

    const companyKey = String(job.companyId);
    let settings = settingsCache.get(companyKey);
    if (!settings) {
      settings = await getEmailSettings(job.companyId);
      settingsCache.set(companyKey, settings);
    }

    let contact = null;
    if (job.contactId) {
      contact = await Contact.findOne({ _id: job.contactId, company: job.companyId })
        .select('firstName lastName email phone status doNotEmail emailPaused communityIds')
        .lean();
    }

    let realtor = null;
    if (job.realtorId && (job.recipientType === 'realtor' || !contact)) {
      realtor = await Realtor.findOne({ _id: job.realtorId, company: job.companyId })
        .select('firstName lastName email emailPaused')
        .lean();
    }

    const recipient = normalizeEmail(job.to || contact?.email || realtor?.email);
    if (!recipient) {
      await markJobFailed(job._id, workerId, 'Missing recipient');
      logJobEvent('warn', '[email] job failed (missing recipient)', { jobId: job._id });
      continue;
    }

    const suppressionKey = `${companyKey}:${recipient}`;
    let suppressionResult = suppressionCache.get(suppressionKey);
    if (!suppressionResult) {
      suppressionResult = await isSuppressed(job.companyId, recipient, contact);
      suppressionCache.set(suppressionKey, suppressionResult);
    }
    if (suppressionResult.suppressed) {
      await markJobSkipped(job._id, workerId, 'SUPPRESSED');
      logJobEvent('info', '[email] job skipped', { jobId: job._id, reason: 'SUPPRESSED' });
      continue;
    }

    if (contact?.emailPaused) {
      await markJobSkipped(job._id, workerId, 'CONTACT_PAUSED');
      logJobEvent('info', '[email] job skipped', { jobId: job._id, reason: 'CONTACT_PAUSED' });
      continue;
    }

    if (realtor?.emailPaused) {
      await markJobSkipped(job._id, workerId, 'REALTOR_PAUSED');
      logJobEvent('info', '[email] job skipped', { jobId: job._id, reason: 'REALTOR_PAUSED' });
      continue;
    }

    if (job.meta?.stopOnStatuses && contact?.status) {
      const stopStatuses = Array.isArray(job.meta.stopOnStatuses)
        ? job.meta.stopOnStatuses.map((s) => String(s).toLowerCase().trim())
        : [];
      const currentStatus = String(contact.status || '').toLowerCase().trim();
      if (stopStatuses.includes(currentStatus)) {
        await markJobSkipped(job._id, workerId, 'STOPPED_BY_SCHEDULE');
        logJobEvent('info', '[email] job skipped', { jobId: job._id, reason: 'STOPPED_BY_SCHEDULE' });
        continue;
      }
    }

    let rule = null;
    if (job.ruleId) {
      rule = await AutomationRule.findOne({ _id: job.ruleId, companyId: job.companyId }).lean();
      if (!rule || rule.isEnabled === false) {
        await markJobCanceled(job._id, workerId, 'RULE_DISABLED');
        logJobEvent('info', '[email] job canceled', { jobId: job._id, reason: 'RULE_DISABLED' });
        continue;
      }
      if (rule.action?.mustStillMatchAtSend) {
        const toStatus = String(rule.trigger?.config?.toStatus || '').toLowerCase().trim();
        const currentStatus = String(contact?.status || '').toLowerCase().trim();
        if (toStatus && currentStatus !== toStatus) {
          await markJobSkipped(job._id, workerId, 'STALE_STATUS');
          logJobEvent('info', '[email] job skipped', { jobId: job._id, reason: 'STALE_STATUS' });
          continue;
        }
      }
    }

    const template = await EmailTemplate.findOne({
      _id: job.templateId,
      companyId: job.companyId
    }).lean();
    if (!template || template.isActive === false) {
      await markJobFailed(job._id, workerId, 'Template inactive or missing');
      logJobEvent('warn', '[email] job failed (template missing)', { jobId: job._id });
      continue;
    }

    const mergeData = {
      ...buildContactMergeData(contact),
      ...(job.data || {})
    };
    const rendered = renderTemplate(
      { subject: template.subject, html: template.html, text: template.text },
      mergeData
    );

    const jobNow = new Date();

    if (!isWithinAllowedWindow(jobNow, settings)) {
      const nextTime = adjustToAllowedWindow(jobNow, settings);
      await markJobQueued(job._id, workerId, {
        scheduledFor: nextTime,
        lastError: 'OUTSIDE_SEND_WINDOW'
      });
      logJobEvent('info', '[email] job rescheduled', {
        jobId: job._id,
        reason: 'OUTSIDE_SEND_WINDOW',
        scheduledFor: nextTime
      });
      continue;
    }

    const dailyCap = Number(settings?.dailyCap || 0);
    if (dailyCap > 0) {
      const { start, end } = getLocalDayBounds(jobNow, settings.timezone || 'UTC');
      const sentCount = await EmailJob.countDocuments({
        companyId: job.companyId,
        status: EmailJob.STATUS.SENT,
        sentAt: { $gte: start, $lt: end }
      });
      if (sentCount >= dailyCap) {
        const nextDay = new Date(end.getTime() + 1000);
        const nextTime = adjustToAllowedWindow(nextDay, settings);
        await markJobQueued(job._id, workerId, {
          scheduledFor: nextTime,
          lastError: 'DAILY_CAP'
        });
        logJobEvent('info', '[email] job rescheduled', {
          jobId: job._id,
          reason: 'DAILY_CAP',
          scheduledFor: nextTime
        });
        continue;
      }
    }

    const rateLimit = Number(settings?.rateLimitPerMinute || 0);
    if (rateLimit > 0) {
      const oneMinuteAgo = new Date(jobNow.getTime() - 60 * 1000);
      const recentSent = await EmailJob.countDocuments({
        companyId: job.companyId,
        status: EmailJob.STATUS.SENT,
        sentAt: { $gte: oneMinuteAgo }
      });
      if (recentSent >= rateLimit) {
        const retryAt = new Date(jobNow.getTime() + 60 * 1000);
        await markJobQueued(job._id, workerId, {
          nextAttemptAt: retryAt,
          lastError: 'RATE_LIMIT'
        });
        logJobEvent('info', '[email] job rescheduled', {
          jobId: job._id,
          reason: 'RATE_LIMIT',
          nextAttemptAt: retryAt
        });
        continue;
      }
    }

    try {
      const result = await provider.sendEmail(
        {
          to: recipient,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text
        },
        job.provider
      );

      await markJobSent(job._id, workerId, {
        providerMessageId: result?.messageId || null,
        sentAt: new Date()
      });
      logJobEvent('info', '[email] job sent', {
        jobId: job._id,
        provider: job.provider,
        messageId: result?.messageId || null
      });
      processed += 1;
    } catch (err) {
      const attempts = Number(job.attempts || 1);
      if (attempts < MAX_EMAIL_ATTEMPTS) {
        const backoffMinutes = Math.pow(2, Math.max(attempts - 1, 0));
        const nextAttemptAt = new Date(jobNow.getTime() + backoffMinutes * 60 * 1000);
        await markJobQueued(job._id, workerId, {
          nextAttemptAt,
          lastError: truncateError(err?.message || 'Provider send failed')
        });
        logJobEvent('warn', '[email] job send failed, retry scheduled', {
          jobId: job._id,
          attempts,
          nextAttemptAt
        });
      } else {
        await markJobFailed(job._id, workerId, truncateError(err?.message || 'Provider send failed'));
        logJobEvent('warn', '[email] job send failed (max attempts)', {
          jobId: job._id,
          attempts
        });
      }
    }
  }

  return { processed };
}

module.exports = {
  enqueueEmailJob,
  processDueEmailJobs,
  claimNextDueJob,
  requeueStaleJobs,
  getEmailSettings,
  adjustToAllowedWindow,
  isWithinAllowedWindow,
  buildContactMergeData,
  getLocalDayBounds
};
