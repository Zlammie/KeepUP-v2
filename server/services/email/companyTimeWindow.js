const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

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

function getDayStartInTimeZone(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  return makeDateInTimeZone(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 },
    timeZone
  );
}

function getCompanyTimeZone(company, fallback = 'America/Chicago') {
  if (company?.emailDailyCapTimezone) return String(company.emailDailyCapTimezone);
  if (company?.settings?.timezone) return String(company.settings.timezone);
  return fallback;
}

function getCompanyDayBounds(company, now = new Date(), fallbackTimeZone = 'America/Chicago') {
  const timeZone = getCompanyTimeZone(company, fallbackTimeZone);
  const parts = getZonedParts(now, timeZone);
  const start = makeDateInTimeZone(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 },
    timeZone
  );
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end, startOfNextDay: end, timeZone };
}

module.exports = {
  getCompanyDayBounds,
  getCompanyTimeZone,
  getDayStartInTimeZone
};
