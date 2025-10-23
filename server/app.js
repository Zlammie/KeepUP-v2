// app.js
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

// If you're behind a proxy (Nginx/ALB), trust it so secure cookies & IPs work
if (isProd) app.set('trust proxy', 1);

// Request logging (honors LOG_LEVEL/REQUEST_LOG_FORMAT)
if (shouldLogRequests) {
  app.use(morgan(logFormat));
}

// CORS (honors CORS_ORIGIN; defaults open if unset)
const corsOptions = {
  origin: (origin, callback) => {
    if (!allowedOrigins.length) return callback(null, true);
    if (!origin) return callback(null, true);
    if (allowedOriginSet.has(origin)) return callback(null, true);
    const error = new Error('CORS origin denied');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// app.options('*', cors(corsOptions));

// Basic rate limiting (RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX)
if (enableRateLimiting) {
  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.method === 'OPTIONS' ||
      req.path === '/healthz' ||
      (cspReportUri && req.path === cspReportUri)
  });
  app.use(limiter);
}

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
  if (req.method === 'GET' && req.path === '/login' && req.session) {
    req.session._loginTouch = Date.now();
  }
  next();
});

const csurf = require('csurf');

// after session(), before routes
app.use(csurf());

// make token available to views (also touches the session on GET)
app.use((req, res, next) => {
  try { res.locals.csrfToken = req.csrfToken(); } catch (_) {}
  next();
});

// 4) Make logged-in user & nonce visible in EJS
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

app.use(currentUserLocals);

// 5) Static & views
app.use('/assets', express.static(path.join(__dirname, '../client/assets')));
app.set('views', path.join(__dirname, '../client/views'));
app.set('view engine', 'ejs');

if (!isProd) {
  app.set('view cache', false);
  app.locals.cache = false;
}


// 6) Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// 7) Routes
app.use(routes);

// 8) Health check
app.get('/healthz', (req, res) => res.json({ ok: true }));

// 9) 404 + error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

