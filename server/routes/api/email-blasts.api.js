const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const Contact = require('../../models/Contact');
const Suppression = require('../../models/Suppression');
const EmailTemplate = require('../../models/EmailTemplate');
const EmailBlast = require('../../models/EmailBlast');
const EmailJob = require('../../models/EmailJob');
const { getEmailSettings, adjustToAllowedWindow, buildContactMergeData, getLocalDayBounds } = require('../../services/email/scheduler');
const { nextAllowedSendTime, getWindowBounds, formatLocalDateKey } = require('../../services/email/pacing');
const { normalizeEmail } = require('../../utils/normalizeEmail');

const router = express.Router();

const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];
const BLAST_CONFIRM_THRESHOLD = Number(process.env.BLAST_CONFIRM_THRESHOLD) || 200;

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const isValidEmail = (value) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

function buildContactFilter(filters, companyId) {
  const baseFilter = { company: companyId };

  if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
    baseFilter.communityIds = { $in: filters.communityIds.map((id) => toObjectId(id)).filter(Boolean) };
  }

  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    baseFilter.status = { $in: filters.statuses };
  }

  if (Array.isArray(filters.ownerIds) && filters.ownerIds.length) {
    baseFilter.ownerId = { $in: filters.ownerIds.map((id) => toObjectId(id)).filter(Boolean) };
  }

  const andClauses = [];

  if (filters.linkedLot === true) {
    andClauses.push({
      $or: [
        { lotId: { $ne: null } },
        { 'linkedLot.lotId': { $exists: true } }
      ]
    });
  }

  if (Array.isArray(filters.lenderIds) && filters.lenderIds.length) {
    const lenderIds = filters.lenderIds.map((id) => toObjectId(id)).filter(Boolean);
    andClauses.push({
      $or: [
        { lenderId: { $in: lenderIds } },
        { 'lenders.lender': { $in: lenderIds } }
      ]
    });
  }

  if (andClauses.length) {
    baseFilter.$and = andClauses;
  }

  if (Array.isArray(filters.tags) && filters.tags.length) {
    baseFilter.tags = { $in: filters.tags };
  }

  return baseFilter;
}

async function resolveBlastRecipients({ companyId, filters }) {
  const contactFilter = buildContactFilter(filters || {}, companyId);

  const contacts = await Contact.find(contactFilter)
    .select('firstName lastName email doNotEmail emailPaused status communityIds')
    .lean();

  // Server-side exclusions + dedupe happen here to avoid client-trusted lists.
  const suppressedEmails = await Suppression.find({ companyId })
    .select('email')
    .lean();
  const suppressedSet = new Set(
    suppressedEmails
      .map((entry) => normalizeEmail(entry.email))
      .filter(Boolean)
  );

  const seenEmails = new Set();
  const recipients = [];
  const excluded = {
    suppressed: 0,
    invalidEmail: 0,
    noEmail: 0,
    doNotEmail: 0,
    duplicates: 0,
    paused: 0
  };

  contacts.forEach((contact) => {
    const email = normalizeEmail(contact.email);
    if (!email) {
      excluded.noEmail += 1;
      return;
    }
    if (!isValidEmail(email)) {
      excluded.invalidEmail += 1;
      return;
    }
    if (contact.doNotEmail) {
      excluded.doNotEmail += 1;
      return;
    }
    if (contact.emailPaused) {
      excluded.paused += 1;
      return;
    }
    if (suppressedSet.has(email)) {
      excluded.suppressed += 1;
      return;
    }
    if (seenEmails.has(email)) {
      excluded.duplicates += 1;
      return;
    }
    seenEmails.add(email);
    recipients.push({ contact, email });
  });

  return {
    recipients,
    excluded,
    totalMatched: contacts.length
  };
}

function sortRecipientsStable(list) {
  return list.slice().sort((a, b) => String(a.email).localeCompare(String(b.email)));
}

async function countSentToday({ companyId, settings }) {
  const now = new Date();
  const { start, end } = getLocalDayBounds(now, settings.timezone || 'UTC');
  return EmailJob.countDocuments({
    companyId,
    status: EmailJob.STATUS.SENT,
    sentAt: { $gte: start, $lt: end }
  });
}

function buildPacingSchedule({ recipients, settings, startAt, dailyCap, sentTodayCount = 0 }) {
  const ordered = sortRecipientsStable(recipients);
  const times = new Array(ordered.length);
  if (!ordered.length) {
    return { ordered, times, pacingSummary: null };
  }

  const cap = Number(dailyCap || 0);
  const alignedStart = nextAllowedSendTime(startAt, settings);

  if (!cap || Number.isNaN(cap) || cap <= 0) {
    for (let i = 0; i < ordered.length; i += 1) {
      times[i] = alignedStart;
    }
    return {
      ordered,
      times,
      pacingSummary: {
        firstSendAt: alignedStart,
        lastSendAt: alignedStart,
        daysSpanned: 1,
        perDayPlanned: { [formatLocalDateKey(alignedStart, settings.timezone || 'UTC')]: ordered.length }
      }
    };
  }

  const now = new Date();
  const todayBounds = getLocalDayBounds(now, settings.timezone || 'UTC');
  const remainingToday =
    alignedStart >= todayBounds.start && alignedStart < todayBounds.end
      ? Math.max(0, cap - Number(sentTodayCount || 0))
      : cap;

  let remainingForDay = remainingToday;
  let cursor = alignedStart;
  let index = 0;
  const perDayCounts = new Map();

  while (index < ordered.length) {
    const window = getWindowBounds(cursor, settings);
    let dayStart = window.windowStart;
    if (cursor > dayStart) dayStart = cursor;

    const available = Math.min(remainingForDay, ordered.length - index);
    if (available <= 0) {
      cursor = nextAllowedSendTime(new Date(window.windowEnd.getTime() + 1000), settings);
      remainingForDay = cap;
      continue;
    }

    const spanMs = Math.max(1, window.windowEnd.getTime() - dayStart.getTime());
    const intervalMs = Math.floor(spanMs / available);

    for (let i = 0; i < available; i += 1) {
      let scheduled = new Date(dayStart.getTime() + intervalMs * i);
      if (scheduled >= window.windowEnd) {
        scheduled = new Date(window.windowEnd.getTime() - 60000);
      }
      if (scheduled < dayStart) scheduled = dayStart;

      times[index] = scheduled;
      const dayKey = formatLocalDateKey(scheduled, window.timeZone);
      perDayCounts.set(dayKey, (perDayCounts.get(dayKey) || 0) + 1);
      index += 1;
    }

    cursor = nextAllowedSendTime(new Date(window.windowEnd.getTime() + 1000), settings);
    remainingForDay = cap;
  }

  const firstSendAt = times[0];
  const lastSendAt = times[times.length - 1];
  const pacingSummary = {
    firstSendAt,
    lastSendAt,
    daysSpanned: perDayCounts.size,
    perDayPlanned: Object.fromEntries(perDayCounts.entries())
  };

  return { ordered, times, pacingSummary };
}

router.post('/preview', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const filters = payload.filters || {};
    const sendMode = payload.sendMode === 'scheduled' ? 'scheduled' : 'now';
    const scheduledForRaw = payload.scheduledFor ? new Date(payload.scheduledFor) : null;

    const { recipients, excluded, totalMatched } = await resolveBlastRecipients({
      companyId: req.user.company,
      filters
    });

    const finalToSend = recipients.length;
    const excludedTotal =
      excluded.suppressed +
      excluded.invalidEmail +
      excluded.noEmail +
      excluded.doNotEmail +
      excluded.duplicates +
      excluded.paused;

    const sampleRecipients = recipients.slice(0, 10).map(({ contact, email }) => ({
      contactId: contact._id,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || email,
      email
    }));

    const settings = await getEmailSettings(req.user.company);
    let pacing = null;
    const dailyCap = Number(settings?.dailyCap || 0);
    if (dailyCap > 0 && recipients.length) {
      const sentTodayCount = await countSentToday({ companyId: req.user.company, settings });
      let startAt = new Date();
      if (sendMode === 'scheduled' && scheduledForRaw && !Number.isNaN(scheduledForRaw.getTime())) {
        startAt = scheduledForRaw;
      }
      const plan = buildPacingSchedule({
        recipients,
        settings,
        startAt,
        dailyCap,
        sentTodayCount
      });
      pacing = plan.pacingSummary;
    }

    res.json({
      totalMatched,
      excludedSuppressed: excluded.suppressed,
      excludedInvalidEmail: excluded.invalidEmail,
      excludedNoEmail: excluded.noEmail,
      excludedDoNotEmail: excluded.doNotEmail,
      excludedDuplicates: excluded.duplicates,
      excludedPaused: excluded.paused,
      excludedTotal,
      finalToSend,
      sampleRecipients,
      warnings: finalToSend >= BLAST_CONFIRM_THRESHOLD ? [`Confirm send for ${finalToSend} recipients.`] : [],
      estimatedFirstSendAt: pacing?.firstSendAt || null,
      estimatedLastSendAt: pacing?.lastSendAt || null,
      estimatedDaysSpanned: pacing?.daysSpanned || null
    });
  } catch (err) {
    console.error('[email-blasts] preview failed', err);
    res.status(500).json({ error: 'Failed to preview blast recipients' });
  }
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const templateId = toObjectId(payload.templateId);
    const filters = payload.filters || {};
    const sendMode = payload.sendMode === 'scheduled' ? 'scheduled' : 'now';
    const scheduledForRaw = payload.scheduledFor ? new Date(payload.scheduledFor) : null;
    const requestId = typeof payload.requestId === 'string' ? payload.requestId.trim() : '';

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!templateId) return res.status(400).json({ error: 'Template is required' });
    if (requestId && (requestId.length < 8 || requestId.length > 80)) {
      return res.status(400).json({ error: 'requestId must be 8-80 characters' });
    }

    if (requestId) {
      const existing = await EmailBlast.findOne({
        companyId: req.user.company,
        requestId
      }).lean();
      if (existing) {
        const finalToSend = existing.audience?.snapshotCount
          ? Math.max(0, existing.audience.snapshotCount - (existing.audience.excludedCount || 0))
          : 0;
        return res.json({
          ok: true,
          idempotent: true,
          blastId: existing._id,
          finalToSend,
          message: 'Duplicate request; returning existing blast.'
        });
      }
    }

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (template.isActive === false) {
      return res.status(400).json({ error: 'Template is inactive' });
    }

    const { recipients, excluded, totalMatched } = await resolveBlastRecipients({
      companyId: req.user.company,
      filters
    });

    const finalToSend = recipients.length;
    const excludedTotal =
      excluded.suppressed +
      excluded.invalidEmail +
      excluded.noEmail +
      excluded.doNotEmail +
      excluded.duplicates +
      excluded.paused;

    if (finalToSend >= BLAST_CONFIRM_THRESHOLD) {
      const expected = `SEND ${finalToSend}`;
      if (String(payload.confirmationText || '').trim() !== expected) {
        return res.status(400).json({ error: `Confirmation required: type "${expected}"` });
      }
    }

    const settings = await getEmailSettings(req.user.company);
    let scheduledFor = null;
    if (sendMode === 'scheduled') {
      if (!scheduledForRaw || Number.isNaN(scheduledForRaw.getTime())) {
        return res.status(400).json({ error: 'scheduledFor is required for scheduled sends' });
      }
      scheduledFor = adjustToAllowedWindow(scheduledForRaw, settings);
    } else {
      scheduledFor = nextAllowedSendTime(new Date(), settings);
    }

    const dailyCap = Number(settings?.dailyCap || 0);
    const sentTodayCount = dailyCap > 0
      ? await countSentToday({ companyId: req.user.company, settings })
      : 0;

    const pacingPlan = buildPacingSchedule({
      recipients,
      settings,
      startAt: scheduledFor,
      dailyCap,
      sentTodayCount
    });

    let blast = null;
    try {
      blast = await EmailBlast.create({
        companyId: req.user.company,
        name,
        templateId,
        createdBy: req.user?._id || null,
        requestId: requestId || null,
        status: EmailBlast.STATUS.SCHEDULED,
        audience: {
          type: 'contacts',
          filters,
          snapshotCount: totalMatched,
          excludedCount: excludedTotal
        },
        schedule: {
          sendMode,
          scheduledFor: pacingPlan.pacingSummary?.firstSendAt || scheduledFor
        },
        settingsSnapshot: {
          timezone: settings.timezone || null,
          dailyCap: settings.dailyCap ?? null,
          rateLimitPerMinute: settings.rateLimitPerMinute ?? null
        },
        pacingSummary: pacingPlan.pacingSummary || null
      });
    } catch (err) {
      if (err?.code === 11000 && requestId) {
        const existing = await EmailBlast.findOne({
          companyId: req.user.company,
          requestId
        }).lean();
        if (existing) {
          const finalToSend = existing.audience?.snapshotCount
            ? Math.max(0, existing.audience.snapshotCount - (existing.audience.excludedCount || 0))
            : 0;
          return res.json({
            ok: true,
            idempotent: true,
            blastId: existing._id,
            finalToSend,
            message: 'Duplicate request; returning existing blast.'
          });
        }
      }
      throw err;
    }

    // Build job payloads with server-side dedupe and exclusions applied.
    const jobs = pacingPlan.ordered.map(({ contact, email }, index) => ({
      companyId: req.user.company,
      to: normalizeEmail(email),
      contactId: contact._id,
      templateId,
      blastId: blast._id,
      data: buildContactMergeData(contact),
      scheduledFor: pacingPlan.times[index] || scheduledFor,
      status: EmailJob.STATUS.QUEUED,
      provider: 'mock',
      meta: {
        blastName: name
      }
    }));

    if (jobs.length) {
      try {
        await EmailJob.insertMany(jobs, { ordered: false });
      } catch (err) {
        // Keep minimal safety: mark blast canceled if job insert fails.
        await EmailBlast.updateOne(
          { _id: blast._id, companyId: req.user.company },
          { $set: { status: EmailBlast.STATUS.CANCELED } }
        );
        throw err;
      }
    }

    res.json({
      ok: true,
      blastId: blast._id,
      finalToSend,
      excludedBreakdown: excluded,
      pacingSummary: pacingPlan.pacingSummary || null
    });
  } catch (err) {
    console.error('[email-blasts] create failed', err);
    res.status(500).json({ error: err.message || 'Failed to create blast' });
  }
});

router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blasts = await EmailBlast.find({ companyId: req.user.company })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('templateId', 'name')
      .lean();

    const shaped = blasts.map((blast) => ({
      _id: blast._id,
      name: blast.name,
      status: blast.status,
      createdAt: blast.createdAt,
      scheduledFor: blast.schedule?.scheduledFor || null,
      templateName: blast.templateId?.name || null,
      finalToSend: blast.audience?.snapshotCount
        ? Math.max(0, blast.audience.snapshotCount - (blast.audience.excludedCount || 0))
        : 0
    }));

    res.json({ blasts: shaped });
  } catch (err) {
    console.error('[email-blasts] list failed', err);
    res.status(500).json({ error: 'Failed to load blasts' });
  }
});

router.get('/:blastId', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blastId = toObjectId(req.params.blastId);
    if (!blastId) return res.status(400).json({ error: 'Invalid blast id' });

    const blast = await EmailBlast.findOne({ _id: blastId, companyId: req.user.company })
      .populate('templateId', 'name')
      .lean();
    if (!blast) return res.status(404).json({ error: 'Blast not found' });

    const now = new Date();
    const baseFilter = { companyId: req.user.company, blastId };
    const finalToSend = blast.audience?.snapshotCount
      ? Math.max(0, blast.audience.snapshotCount - (blast.audience.excludedCount || 0))
      : 0;
    const confirmationRequired = finalToSend >= BLAST_CONFIRM_THRESHOLD;

    const [
      totalJobs,
      queued,
      processing,
      sent,
      failed,
      skipped,
      canceled,
      dueNow,
      retrying,
      recentSent,
      recentFailed,
      recentSkipped
    ] = await Promise.all([
      EmailJob.countDocuments(baseFilter),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.QUEUED }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.PROCESSING }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.SENT }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.FAILED }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.SKIPPED }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.CANCELED }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.QUEUED,
        scheduledFor: { $lte: now },
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } }
        ]
      }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.QUEUED,
        nextAttemptAt: { $gt: now }
      }),
      EmailJob.find({ ...baseFilter, status: EmailJob.STATUS.SENT })
        .sort({ sentAt: -1, updatedAt: -1 })
        .limit(5)
        .select('to sentAt providerMessageId')
        .lean(),
      EmailJob.find({ ...baseFilter, status: EmailJob.STATUS.FAILED })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('to updatedAt lastError attempts')
        .lean(),
      EmailJob.find({ ...baseFilter, status: EmailJob.STATUS.SKIPPED })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('to updatedAt lastError')
        .lean()
    ]);

    res.json({
      blast: {
        _id: blast._id,
        name: blast.name,
        status: blast.status,
        templateId: blast.templateId?._id || blast.templateId,
        templateName: blast.templateId?.name || null,
        createdBy: blast.createdBy || null,
        createdAt: blast.createdAt,
        updatedAt: blast.updatedAt,
        sendMode: blast.schedule?.sendMode || 'now',
        scheduledFor: blast.schedule?.scheduledFor || null,
        audience: blast.audience || { type: 'contacts', filters: {}, snapshotCount: 0, excludedCount: 0 },
        confirmationRequired,
        pacingSummary: blast.pacingSummary || null
      },
      counts: {
        totalJobs,
        queued,
        processing,
        sent,
        failed,
        skipped,
        canceled,
        dueNow,
        retrying
      },
      recent: {
        sent: recentSent || [],
        failed: recentFailed || [],
        skipped: recentSkipped || []
      }
    });
  } catch (err) {
    console.error('[email-blasts] get failed', err);
    res.status(500).json({ error: 'Failed to load blast' });
  }
});

router.post('/:blastId/cancel', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blastId = toObjectId(req.params.blastId);
    if (!blastId) return res.status(400).json({ error: 'Invalid blast id' });

    const blast = await EmailBlast.findOne({
      _id: blastId,
      companyId: req.user.company
    });
    if (!blast) return res.status(404).json({ error: 'Blast not found' });

    blast.status = EmailBlast.STATUS.CANCELED;
    await blast.save();

    await EmailJob.updateMany(
      {
        companyId: req.user.company,
        blastId,
        status: EmailJob.STATUS.QUEUED
      },
      { $set: { status: EmailJob.STATUS.CANCELED, lastError: 'BLAST_CANCELED' } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[email-blasts] cancel failed', err);
    res.status(500).json({ error: 'Failed to cancel blast' });
  }
});

module.exports = router;
