// server/app.js
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const buildSession = require('./config/session');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const currentUserLocals = require('./middleware/currentUserLocals');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);
const FALSE_SET = new Set(['0', 'false', 'no', 'off']);
const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };

const parseBoolean = (value, defaultValue = false) => {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_SET.has(normalized)) return true;
  if (FALSE_SET.has(normalized)) return false;
  return defaultValue;
};

const toInt = (value, fallback) => {
  if (value == null) return fallback;
  const parsed = parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
const allowedOriginSet = new Set(allowedOrigins);
const logLevel = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
const currentLogLevel = LEVEL_ORDER[logLevel] ?? LEVEL_ORDER.info;
const canLog = (level) => currentLogLevel >= (LEVEL_ORDER[level] ?? LEVEL_ORDER.info);
const shouldLogRequests = canLog('info');
const logFormat = process.env.REQUEST_LOG_FORMAT || 'combined';

const enableCsp = parseBoolean(process.env.ENABLE_CSP, true);
const cspReportOnly = parseBoolean(process.env.CSP_REPORT_ONLY, false);
const cspReportUri = (process.env.CSP_REPORT_URI || '').trim() || null;

const rateLimitWindowMs = Math.max(0, toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000));
const rateLimitMax = Math.max(0, toInt(process.env.RATE_LIMIT_MAX, 200));
const enableRateLimiting = rateLimitWindowMs > 0 && rateLimitMax > 0;

// Trust the first two proxies (e.g., Cloudflare + ALB) so secure cookies & client IPs work
if (isProd) app.set('trust proxy', 2);

// Request logging (honors LOG_LEVEL/REQUEST_LOG_FORMAT)
if (shouldLogRequests) {
  app.use(morgan(logFormat));
}

// CORS (honors CORS_ORIGIN; defaults open if unset)
const corsOptions = {
  origin: (origin, callback) => {
    // 1) Allow requests with no Origin header (curl, same-origin form posts)
    if (!origin) return callback(null, true);

    // 2) If no allow-list configured, allow all
    if (!allowedOrigins.length) return callback(null, true);

    // 3) Allow exact matches in the env allow-list
    if (allowedOriginSet.has(origin)) return callback(null, true);

    // 4) Also allow when the origin equals BASE_URL's origin (defensive)
    try {
      if (process.env.BASE_URL && new URL(process.env.BASE_URL).origin === origin) {
        return callback(null, true);
      }
    } catch (_) {
      // ignore parse errors
    }

    // 5) IMPORTANT: don't throw an error (which 403s the request).
    // Returning `false` disables CORS for this request, but still lets it proceed.
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// app.options('*', cors(corsOptions));

// Basic rate limiting (RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX)
const rateLimitKeyFn = (req) => {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp;
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.length) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;
  return req.ip;
};

if (enableRateLimiting) {
  const apiLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyFn,
    skip: (req) =>
      req.method === 'OPTIONS' ||
      req.path === '/healthz' ||
      (cspReportUri && req.path === cspReportUri)
  });
  app.use('/api', apiLimiter);
}

// Optional: soften auth endpoints so brute force is curtailed but users don't get 429s on pages
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyFn,
});
app.use(['/login', '/logout'], authLimiter);

// 1) Per-request CSP nonce for inline scripts in EJS
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

const helmetOptions = {
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
};

if (enableCsp) {
  const connectSrc = new Set(["'self'", 'https://cdn.jsdelivr.net']);
  allowedOrigins.forEach((origin) => connectSrc.add(origin));
  if (process.env.BASE_URL) {
    try {
      connectSrc.add(new URL(process.env.BASE_URL).origin);
    } catch (_) {
      connectSrc.add(process.env.BASE_URL);
    }
  }

  const cspDirectives = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      (req, res) => `'nonce-${res.locals.cspNonce}'`,
      'https://cdn.jsdelivr.net'
    ],
    "script-src-elem": [
      "'self'",
      (req, res) => `'nonce-${res.locals.cspNonce}'`,
      'https://cdn.jsdelivr.net'
    ],
    "script-src-attr": ["'none'"],
    "style-src": ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
    "img-src": ["'self'", 'data:', 'blob:'],
    "font-src": ["'self'", 'data:'],
    "connect-src": Array.from(connectSrc),
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"]
  };

  if (cspReportUri) {
    cspDirectives['report-uri'] = [cspReportUri];
  }

  helmetOptions.contentSecurityPolicy = {
    useDefaults: true,
    directives: cspDirectives,
    reportOnly: cspReportOnly
  };
} else {
  helmetOptions.contentSecurityPolicy = false;
}

// 2) Helmet with environment-driven CSP controls
app.use(helmet(helmetOptions));

// 3) Sessions
app.use(
  buildSession({
    mongoUrl: process.env.MONGO_URI,
    secret: process.env.SESSION_SECRET,
    isProd,
    cookieName: process.env.SESSION_COOKIE_NAME,
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN,
    sameSite: process.env.COOKIE_SAMESITE,
    secure: process.env.COOKIE_SECURE,
    ttlDays: process.env.SESSION_TTL_DAYS
  })
);

app.use((req, res, next) => {
  // touch the login route so express-session emits Set-Cookie even on GET /login
  if (req.method === 'GET' && req.path === '/login' && req.session) {
    req.session._loginTouch = Date.now();
  }
  next();
});

// 4) Body parsing (must run before routes so POST bodies populate req.body)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 5) Make logged-in user & nonce visible in EJS
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

app.use(currentUserLocals);

// 6) Static & views
app.use('/assets', express.static(path.join(__dirname, '../client/assets')));
app.set('views', path.join(__dirname, '../client/views'));
app.set('view engine', 'ejs');

if (!isProd) {
  app.set('view cache', false);
  app.locals.cache = false;
}

if (enableCsp && cspReportUri) {
  app.post(
    cspReportUri,
    express.json({ type: ['application/csp-report', 'application/json'], limit: '20kb' }),
    (req, res) => {
      if (canLog('warn') && req.body) {
        console.warn('CSP violation reported', req.body);
      }
      res.status(204).end();
    }
  );
}

app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/login' && req.body) {
    // alias common names to "email"
    if (!req.body.email) {
      const id =
        (req.body.username ??
         req.body.identifier ??
         req.body.user ??
         req.body.login ??
         '').toString().trim().toLowerCase();
      if (id) req.body.email = id;
    }
    // alias common names to "password"
    if (!req.body.password) {
      const pw = (req.body.pass ?? req.body.pwd ?? '').toString();
      if (pw) req.body.password = pw;
    }
  }
  next();
});

// 7) Routes
app.use(routes);

// 8) Health check
app.get('/healthz', (req, res) => res.json({ ok: true }));

// 9) 404 + error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
