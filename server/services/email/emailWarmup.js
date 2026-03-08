const { getCompanyDayBounds, getCompanyTimeZone, getDayStartInTimeZone } = require('./companyTimeWindow');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARMUP_DAYS = 14;
const DEFAULT_WARMUP_SCHEDULE = [
  { day: 1, cap: 25 },
  { day: 4, cap: 50 },
  { day: 8, cap: 100 },
  { day: 11, cap: 250 }
];

const cloneSchedule = (schedule) => schedule.map((entry) => ({ day: entry.day, cap: entry.cap }));

const getDefaultWarmupSchedule = () => cloneSchedule(DEFAULT_WARMUP_SCHEDULE);

const normalizeWarmupSchedule = (schedule) => {
  const source = Array.isArray(schedule) ? schedule : [];
  const normalized = source
    .map((entry) => ({
      day: Number(entry?.day),
      cap: Number(entry?.cap)
    }))
    .filter((entry) => Number.isFinite(entry.day) && entry.day > 0 && Number.isFinite(entry.cap) && entry.cap > 0)
    .sort((a, b) => a.day - b.day);
  return normalized.length ? normalized : getDefaultWarmupSchedule();
};

const getWarmupCapForDay = (dayIndex, schedule) => {
  if (!Number.isFinite(dayIndex) || dayIndex <= 0) return null;
  let cap = null;
  for (const entry of schedule) {
    if (dayIndex >= entry.day) {
      cap = entry.cap;
    } else {
      break;
    }
  }
  return cap;
};

const buildWarmupStartState = ({ startedAt = new Date(), schedule, daysTotal } = {}) => {
  const normalizedSchedule = normalizeWarmupSchedule(schedule);
  const totalDays = Number.isFinite(daysTotal) && daysTotal > 0 ? Math.floor(daysTotal) : DEFAULT_WARMUP_DAYS;
  const capOverrideToday = getWarmupCapForDay(1, normalizedSchedule);
  return {
    enabled: true,
    startedAt,
    endedAt: null,
    dayIndex: 1,
    daysTotal: totalDays,
    capOverrideToday,
    schedule: normalizedSchedule,
    lastComputedAt: startedAt
  };
};

const computeWarmupState = ({ company, now = new Date() } = {}) => {
  const warmup = company?.emailWarmup || {};
  const verifiedAt = company?.emailDomainVerifiedAt ? new Date(company.emailDomainVerifiedAt) : null;
  const startedAt = warmup.startedAt ? new Date(warmup.startedAt) : verifiedAt;
  const hasValidStart = startedAt && !Number.isNaN(startedAt.getTime());
  const enabled = warmup.enabled === true || (warmup.enabled !== false && hasValidStart);
  const schedule = normalizeWarmupSchedule(warmup.schedule);
  const daysTotal = Number.isFinite(warmup.daysTotal) && warmup.daysTotal > 0
    ? Math.floor(warmup.daysTotal)
    : DEFAULT_WARMUP_DAYS;
  const timeZone = getCompanyTimeZone(company, 'America/Chicago');
  const bounds = getCompanyDayBounds(company, now);

  let dayIndex = null;
  let capOverrideToday = null;
  let active = false;
  let endedAt = warmup.endedAt ? new Date(warmup.endedAt) : null;

  if (enabled && hasValidStart) {
    const warmupStartDay = getDayStartInTimeZone(startedAt, timeZone);
    const todayStart = getDayStartInTimeZone(now, timeZone);
    const diffDays = Math.floor((todayStart.getTime() - warmupStartDay.getTime()) / DAY_MS);
    dayIndex = Math.max(1, diffDays + 1);

    if (dayIndex > daysTotal) {
      active = false;
      if (!endedAt) {
        endedAt = new Date(warmupStartDay.getTime() + daysTotal * DAY_MS);
      }
    } else if (!endedAt) {
      active = true;
      capOverrideToday = getWarmupCapForDay(dayIndex, schedule);
    }
  }

  return {
    enabled,
    active,
    startedAt: hasValidStart ? startedAt : null,
    endedAt,
    dayIndex,
    daysTotal,
    capOverrideToday,
    schedule,
    lastComputedAt: now,
    timeZone,
    resetAt: bounds.startOfNextDay
  };
};

const buildWarmupUpdate = (existingWarmup, computed) => {
  if (!computed) return null;
  const warmup = existingWarmup || {};
  const update = {};

  const shouldSet = (field, value) => {
    if (value === undefined) return;
    const existingValue = warmup[field];
    const isDate = value instanceof Date;
    if (isDate) {
      const existingTime = existingValue ? new Date(existingValue).getTime() : null;
      if (existingTime !== value.getTime()) {
        update[`emailWarmup.${field}`] = value;
      }
      return;
    }
    if (Array.isArray(value)) {
      const existingJson = JSON.stringify(existingValue || []);
      const nextJson = JSON.stringify(value);
      if (existingJson !== nextJson) {
        update[`emailWarmup.${field}`] = value;
      }
      return;
    }
    if (existingValue !== value) {
      update[`emailWarmup.${field}`] = value;
    }
  };

  shouldSet('enabled', computed.enabled);
  shouldSet('startedAt', computed.startedAt);
  shouldSet('endedAt', computed.endedAt);
  shouldSet('dayIndex', computed.dayIndex);
  shouldSet('daysTotal', computed.daysTotal);
  shouldSet('capOverrideToday', computed.capOverrideToday);
  shouldSet('schedule', computed.schedule);
  shouldSet('lastComputedAt', computed.lastComputedAt);

  return Object.keys(update).length ? update : null;
};

module.exports = {
  DEFAULT_WARMUP_DAYS,
  DEFAULT_WARMUP_SCHEDULE,
  getDefaultWarmupSchedule,
  normalizeWarmupSchedule,
  getWarmupCapForDay,
  buildWarmupStartState,
  computeWarmupState,
  buildWarmupUpdate
};
