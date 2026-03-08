const EmailJob = require('../../models/EmailJob');
const { getCompanyDayBounds } = require('./companyTimeWindow');
const { computeWarmupState } = require('./emailWarmup');

const DEFAULT_DAILY_CAP = 500;

function getCompanyDailyCap(company) {
  const enabled = company?.emailDailyCapEnabled !== false;
  const rawCap = company?.emailDailyCap;
  const cap = Number.isFinite(rawCap) ? Number(rawCap) : DEFAULT_DAILY_CAP;
  if (!enabled || !cap || cap < 0) {
    return { enabled, cap: 0 };
  }
  return { enabled: true, cap: Math.floor(cap) };
}

function getEffectiveDailyCap({ company, now = new Date() } = {}) {
  const base = getCompanyDailyCap(company || {});
  const warmup = computeWarmupState({ company, now });
  if (warmup.active && warmup.capOverrideToday) {
    const warmupCap = Number(warmup.capOverrideToday);
    // During warm-up, enforce the stricter of the base cap and warm-up cap.
    const effectiveCap = base.enabled && base.cap
      ? Math.min(base.cap, warmupCap)
      : warmupCap;
    return {
      enabled: true,
      baseCap: base.cap,
      effectiveCap,
      warmup
    };
  }
  return {
    enabled: base.enabled,
    baseCap: base.cap,
    effectiveCap: base.cap,
    warmup
  };
}

async function getSentCountToday(companyId, start, end) {
  if (!companyId) return 0;
  return EmailJob.countDocuments({
    companyId,
    status: EmailJob.STATUS.SENT,
    sentAt: { $gte: start, $lt: end }
  });
}

async function checkDailyCap({ company, companyId, now = new Date(), fallbackTimeZone = 'America/Chicago' }) {
  const config = getEffectiveDailyCap({ company, now });
  if (!config.enabled || !config.effectiveCap) {
    return {
      blocked: false,
      cap: config.effectiveCap,
      baseCap: config.baseCap,
      sentCount: 0,
      bounds: null,
      warmup: config.warmup
    };
  }
  const bounds = getCompanyDayBounds(company, now, fallbackTimeZone);
  const sentCount = await getSentCountToday(companyId, bounds.start, bounds.end);
  return {
    blocked: sentCount >= config.effectiveCap,
    cap: config.effectiveCap,
    baseCap: config.baseCap,
    sentCount,
    bounds,
    warmup: config.warmup
  };
}

module.exports = {
  DEFAULT_DAILY_CAP,
  getCompanyDailyCap,
  getEffectiveDailyCap,
  getSentCountToday,
  checkDailyCap
};
