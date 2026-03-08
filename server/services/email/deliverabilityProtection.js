const Company = require('../../models/Company');
const EmailJob = require('../../models/EmailJob');
const EmailEvent = require('../../models/EmailEvent');
const { getCompanyDayBounds } = require('./companyTimeWindow');
const { getSentCountToday } = require('./companyDailyCap');
const { sendAdminAlert } = require('./adminAlerts');

const BOUNCE_EVENT_TYPES = ['bounce', 'blocked', 'dropped'];

async function pauseCompanySending({ companyId, company = null, reason, meta = {}, triggeredBy = 'system' }) {
  const doc = company || await Company.findById(companyId);
  if (!doc) return { paused: false, reason: 'company_not_found' };
  if (doc.emailSendingPaused) {
    return { paused: false, alreadyPaused: true, company: doc };
  }

  doc.emailSendingPaused = true;
  doc.emailSendingPausedAt = new Date();
  doc.emailSendingPausedBy = triggeredBy;
  doc.emailSendingPausedReason = reason || 'manual';
  doc.emailSendingPausedMeta = meta || {};
  await doc.save();

  sendAdminAlert({
    subject: `KeepUp: Sending paused for ${doc.name || 'company'}`,
    html: `<p>Company: ${doc.name || doc._id}</p><p>Reason: ${doc.emailSendingPausedReason}</p>`,
    text: `Company: ${doc.name || doc._id}\nReason: ${doc.emailSendingPausedReason}`
  }).catch(() => {});

  await EmailJob.updateMany(
    {
      companyId: doc._id,
      status: EmailJob.STATUS.QUEUED,
      lastError: { $ne: 'COMPANY_SENDING_PAUSED' }
    },
    { $set: { lastError: 'COMPANY_SENDING_PAUSED', nextAttemptAt: null } }
  );

  return { paused: true, company: doc };
}

async function evaluateBounceRateAndPause({
  companyId,
  company = null,
  now = new Date(),
  extraBounceCount = 0
}) {
  const doc = company || await Company.findById(companyId);
  if (!doc) return { paused: false, reason: 'company_not_found' };
  if (doc.emailSendingPaused) return { paused: false, alreadyPaused: true, company: doc };
  if (doc.emailAutoPauseOnBounceRate === false) return { paused: false, reason: 'disabled', company: doc };

  const threshold = Number.isFinite(doc.emailBounceRateThreshold)
    ? Number(doc.emailBounceRateThreshold)
    : 0.05;
  const minSent = Number.isFinite(doc.emailBounceMinSentForEvaluation)
    ? Number(doc.emailBounceMinSentForEvaluation)
    : 50;
  if (!threshold || threshold <= 0) {
    return { paused: false, reason: 'threshold_disabled', company: doc };
  }

  const bounds = getCompanyDayBounds(doc, now);
  const sentToday = await getSentCountToday(doc._id, bounds.start, bounds.end);
  if (sentToday < minSent) {
    return { paused: false, reason: 'below_min_sent', sentToday, company: doc };
  }

  const bounceCount = await EmailEvent.countDocuments({
    companyId: doc._id,
    event: { $in: BOUNCE_EVENT_TYPES },
    eventAt: { $gte: bounds.start, $lt: bounds.end }
  });
  const bouncesToday = bounceCount + Math.max(0, Number(extraBounceCount || 0));
  const bounceRate = sentToday ? bouncesToday / sentToday : 0;

  if (bounceRate >= threshold) {
    const meta = {
      sentToday,
      bouncesToday,
      bounceRate,
      threshold,
      windowStart: bounds.start,
      windowEnd: bounds.end
    };
    const pauseResult = await pauseCompanySending({
      companyId: doc._id,
      company: doc,
      reason: 'bounce_rate',
      meta,
      triggeredBy: 'system'
    });
    return { paused: pauseResult.paused, company: pauseResult.company, meta };
  }

  return { paused: false, sentToday, bouncesToday, bounceRate, company: doc };
}

module.exports = {
  pauseCompanySending,
  evaluateBounceRateAndPause,
  BOUNCE_EVENT_TYPES
};
