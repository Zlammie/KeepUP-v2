const crypto = require('crypto');
const mongoose = require('mongoose');
const EmailEvent = require('../../models/EmailEvent');
const EmailJob = require('../../models/EmailJob');
const Company = require('../../models/Company');
const Suppression = require('../../models/Suppression');
const { normalizeEmail } = require('../../utils/normalizeEmail');
const {
  pauseCompanySending,
  evaluateBounceRateAndPause,
  BOUNCE_EVENT_TYPES
} = require('./deliverabilityProtection');

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const buildDedupeKey = ({ sgEventId, eventType, providerMessageId, email, eventAt, jobId }) => {
  if (sgEventId) return `sg:${sgEventId}`;
  const stamp = eventAt instanceof Date && !Number.isNaN(eventAt.getTime())
    ? eventAt.toISOString()
    : '';
  const fallback = [
    eventType || '',
    providerMessageId || '',
    email || '',
    jobId || '',
    stamp
  ].join('|');
  const hash = crypto.createHash('sha256').update(fallback).digest('hex');
  return `fallback:${hash}`;
};

const getUpsertedIndexes = (result) => {
  if (!result) return new Set();
  const raw = typeof result.getRawResponse === 'function' ? result.getRawResponse() : result;
  const upserted = raw?.upserted || result.upsertedIds || [];
  const indexes = new Set();

  if (Array.isArray(upserted)) {
    upserted.forEach((entry) => {
      if (entry && typeof entry.index === 'number') {
        indexes.add(entry.index);
      } else if (typeof entry === 'number') {
        indexes.add(entry);
      }
    });
  } else if (upserted && typeof upserted === 'object') {
    Object.values(upserted).forEach((entry) => {
      if (entry && typeof entry.index === 'number') {
        indexes.add(entry.index);
      }
    });
  }

  return indexes;
};

const extractCustomArgs = (event) => {
  if (event?.custom_args && typeof event.custom_args === 'object') return event.custom_args;
  if (event?.customArgs && typeof event.customArgs === 'object') return event.customArgs;
  return {};
};

const buildJobLookup = async ({ jobId, providerMessageId }) => {
  if (jobId && isId(jobId)) {
    const job = await EmailJob.findById(jobId).lean();
    if (job) return job;
  }
  if (providerMessageId) {
    return EmailJob.findOne({ providerMessageId: String(providerMessageId) }).lean();
  }
  return null;
};

const upsertSuppression = async ({ companyId, email, reason }) => {
  if (!companyId || !email) return;
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await Suppression.findOneAndUpdate(
    { companyId, email: normalized },
    { $set: { reason: reason || Suppression.REASONS.MANUAL } },
    { upsert: true, new: false }
  );
};

const markJobFromEvent = async ({ jobId, providerMessageId, eventType }) => {
  if (!jobId || !isId(jobId)) return;
  const errorCode = `SENDGRID_${String(eventType || '').toUpperCase() || 'EVENT'}`;
  const update = {
    $set: {
      lastError: errorCode,
      providerMessageId: providerMessageId || undefined
    }
  };
  const filter = {
    _id: jobId,
    status: { $in: [EmailJob.STATUS.SENT, EmailJob.STATUS.PROCESSING] }
  };
  if (eventType === 'spamreport' || eventType === 'bounce') {
    update.$set.status = EmailJob.STATUS.FAILED;
  }
  await EmailJob.updateOne(filter, update);
};

async function processSendgridEvents(events = []) {
  if (!Array.isArray(events) || !events.length) {
    return { processed: 0, deduped: 0 };
  }

  const prepared = [];
  const dedupeSeen = new Set();
  const spamreportByCompany = new Map();
  const bounceCountByCompany = new Map();
  const companyCache = new Map();

  const getCompanyDoc = async (companyId) => {
    const key = String(companyId || '');
    if (!key) return null;
    if (companyCache.has(key)) return companyCache.get(key);
    const doc = await Company.findById(companyId);
    companyCache.set(key, doc || null);
    return doc;
  };

  for (const event of events) {
    const eventType = String(event?.event || '').trim().toLowerCase();
    if (!eventType) continue;

    const email = normalizeEmail(event?.email);
    const customArgs = extractCustomArgs(event);
    const providerMessageId = event?.sg_message_id || event?.smtp_id || event?.['smtp-id'] || null;
    const sgEventId = event?.sg_event_id || null;
    const eventAt = Number.isFinite(Number(event?.timestamp))
      ? new Date(Number(event.timestamp) * 1000)
      : null;

    const jobId = customArgs?.jobId || null;
    const job = await buildJobLookup({ jobId, providerMessageId });
    const resolvedJobId = job?._id ? String(job._id) : (isId(jobId) ? String(jobId) : null);
    const companyId = customArgs?.companyId || job?.companyId || null;
    const companyIdValue = companyId && isId(companyId) ? String(companyId) : null;

    const dedupeKey = buildDedupeKey({
      sgEventId,
      eventType,
      providerMessageId,
      email,
      eventAt,
      jobId: resolvedJobId || jobId || null
    });

    if (dedupeSeen.has(dedupeKey)) continue;
    dedupeSeen.add(dedupeKey);

    prepared.push({
      eventType,
      email,
      companyIdValue,
      providerMessageId,
      resolvedJobId,
      sgEventId,
      eventAt,
      customArgs,
      dedupeKey,
      raw: event
    });
  }

  if (!prepared.length) {
    return { processed: 0, deduped: 0 };
  }

  const ops = prepared.map((entry) => ({
    updateOne: {
      filter: { provider: 'sendgrid', dedupeKey: entry.dedupeKey },
      update: {
        $setOnInsert: {
          provider: 'sendgrid',
          event: entry.eventType,
          email: entry.email,
          companyId: entry.companyIdValue ? entry.companyIdValue : null,
          jobId: entry.resolvedJobId && isId(entry.resolvedJobId) ? entry.resolvedJobId : null,
          blastId: entry.customArgs?.blastId && isId(entry.customArgs.blastId) ? entry.customArgs.blastId : null,
          ruleId: entry.customArgs?.ruleId && isId(entry.customArgs.ruleId) ? entry.customArgs.ruleId : null,
          recipientId: entry.customArgs?.recipientId && isId(entry.customArgs.recipientId)
            ? entry.customArgs.recipientId
            : null,
          recipientType: entry.customArgs?.recipientType || null,
          providerMessageId: entry.providerMessageId,
          sgEventId: entry.sgEventId,
          eventAt: entry.eventAt,
          dedupeKey: entry.dedupeKey,
          reason: entry.raw?.reason || null,
          status: entry.raw?.status || null,
          response: entry.raw?.response || null,
          customArgs: entry.customArgs,
          raw: entry.raw
        }
      },
      upsert: true
    }
  }));

  let upsertedIndexes = new Set();
  const result = await EmailEvent.bulkWrite(ops, { ordered: false });
  upsertedIndexes = getUpsertedIndexes(result);

  let processed = 0;
  for (let i = 0; i < prepared.length; i += 1) {
    if (!upsertedIndexes.has(i)) continue;
    processed += 1;
    const entry = prepared[i];

    if (entry.eventType === 'spamreport') {
      await upsertSuppression({
        companyId: entry.companyIdValue,
        email: entry.email,
        reason: Suppression.REASONS.SPAMREPORT
      });
      await markJobFromEvent({
        jobId: entry.resolvedJobId,
        providerMessageId: entry.providerMessageId,
        eventType: entry.eventType
      });
      if (entry.companyIdValue) {
        if (!spamreportByCompany.has(entry.companyIdValue)) {
          spamreportByCompany.set(entry.companyIdValue, {
            recipientEmail: entry.email || null,
            sgMessageId: entry.providerMessageId || null,
            sgEventId: entry.sgEventId,
            jobId: entry.resolvedJobId || null,
            eventTimestamp: entry.eventAt || new Date()
          });
        }
      }
    } else if (entry.eventType === 'bounce') {
      await upsertSuppression({
        companyId: entry.companyIdValue,
        email: entry.email,
        reason: Suppression.REASONS.BOUNCE
      });
      await markJobFromEvent({
        jobId: entry.resolvedJobId,
        providerMessageId: entry.providerMessageId,
        eventType: entry.eventType
      });
    } else if (entry.eventType === 'dropped' || entry.eventType === 'blocked') {
      await markJobFromEvent({
        jobId: entry.resolvedJobId,
        providerMessageId: entry.providerMessageId,
        eventType: entry.eventType
      });
    }

    if (entry.companyIdValue && BOUNCE_EVENT_TYPES.includes(entry.eventType)) {
      bounceCountByCompany.set(
        entry.companyIdValue,
        (bounceCountByCompany.get(entry.companyIdValue) || 0) + 1
      );
    }
  }

  for (const [companyKey, meta] of spamreportByCompany.entries()) {
    const company = await getCompanyDoc(companyKey);
    if (!company) continue;
    if (company.emailAutoPauseOnSpamReport === false) continue;
    await pauseCompanySending({
      companyId: company._id,
      company,
      reason: 'spamreport',
      meta,
      triggeredBy: 'system'
    });
  }

  for (const [companyKey, extraBounceCount] of bounceCountByCompany.entries()) {
    const company = await getCompanyDoc(companyKey);
    if (!company) continue;
    if (company.emailAutoPauseOnBounceRate === false) continue;
    await evaluateBounceRateAndPause({
      companyId: company._id,
      company,
      now: new Date(),
      extraBounceCount: 0
    });
  }

  const deduped = prepared.length - processed;
  return { processed, deduped };
}

module.exports = {
  processSendgridEvents,
  buildDedupeKey
};
