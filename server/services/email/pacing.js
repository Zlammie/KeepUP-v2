const { adjustToAllowedWindow, getLocalDayBounds } = require('./scheduler');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTimeToMinutes(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const [hours, minutes] = trimmed.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return fallback;
  return hours * 60 + minutes;
}

function getNormalizedSettings(settings = {}) {
  const timeZone = settings.timezone || 'UTC';
  const startMinutes = parseTimeToMinutes(settings.allowedStartTime, 9 * 60);
  const endMinutes = parseTimeToMinutes(settings.allowedEndTime, 17 * 60);
  const quietHoursEnabled = settings.quietHoursEnabled !== false;
  return { timeZone, startMinutes, endMinutes, quietHoursEnabled };
}

function nextAllowedSendTime(baseDateTime, settings) {
  if (!baseDateTime) return new Date();
  return adjustToAllowedWindow(new Date(baseDateTime), settings);
}

function windowDurationMinutes(settings) {
  const normalized = getNormalizedSettings(settings);
  if (!normalized.quietHoursEnabled) return DAY_MS / 60000;
  if (normalized.startMinutes == null || normalized.endMinutes == null) return DAY_MS / 60000;
  if (normalized.startMinutes > normalized.endMinutes) return DAY_MS / 60000;
  return Math.max(1, normalized.endMinutes - normalized.startMinutes);
}

function getWindowBounds(date, settings) {
  const normalized = getNormalizedSettings(settings);
  const aligned = nextAllowedSendTime(date, settings);
  const dayBounds = getLocalDayBounds(aligned, normalized.timeZone);
  const hasWindow =
    normalized.quietHoursEnabled &&
    normalized.startMinutes != null &&
    normalized.endMinutes != null &&
    normalized.startMinutes <= normalized.endMinutes;

  const windowStart = hasWindow
    ? new Date(dayBounds.start.getTime() + normalized.startMinutes * 60000)
    : dayBounds.start;
  const windowEnd = hasWindow
    ? new Date(dayBounds.start.getTime() + normalized.endMinutes * 60000)
    : dayBounds.end;

  return {
    aligned,
    windowStart,
    windowEnd,
    timeZone: normalized.timeZone
  };
}

function formatLocalDateKey(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

module.exports = {
  nextAllowedSendTime,
  windowDurationMinutes,
  getWindowBounds,
  formatLocalDateKey
};
