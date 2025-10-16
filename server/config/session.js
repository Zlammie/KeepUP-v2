const session = require('express-session');
const MongoStore = require('connect-mongo');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);

function toBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_SET.has(normalized)) return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
  return fallback;
}

function normalizeSameSite(value, fallback = 'lax') {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['lax', 'strict', 'none'].includes(normalized) ? normalized : fallback;
}

module.exports = function buildSession({
  mongoUrl,
  secret,
  isProd,
  cookieName,
  cookieDomain,
  sameSite,
  secure,
  ttlDays
}) {
  const resolvedName = cookieName || process.env.SESSION_COOKIE_NAME || 'sid';
  const resolvedSameSite = normalizeSameSite(sameSite || process.env.COOKIE_SAMESITE, 'lax');
  const resolvedSecure = toBool(
    secure ?? process.env.COOKIE_SECURE,
    isProd
  );
  const resolvedTtlDays = Number(ttlDays ?? process.env.SESSION_TTL_DAYS) || 7;
  const maxAge = Math.max(1, resolvedTtlDays) * DAY_MS;

  const store = MongoStore.create({
    mongoUrl,
    ttl: Math.round(maxAge / 1000)
  });

  const cookie = {
    httpOnly: true,
    sameSite: resolvedSameSite,
    secure: resolvedSecure,
    maxAge
  };

  if (cookieDomain || process.env.SESSION_COOKIE_DOMAIN) {
    cookie.domain = cookieDomain || process.env.SESSION_COOKIE_DOMAIN;
  }

  // SameSite=None requires Secure; guard against misconfiguration.
  if (cookie.sameSite === 'none' && !cookie.secure) {
    cookie.secure = true;
  }

  return session({
    name: resolvedName,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store,
    cookie
  });
};
