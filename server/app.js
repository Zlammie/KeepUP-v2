// app.js
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');

const buildSession = require('./config/session');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const currentUserLocals = require('./middleware/currentUserLocals');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// If you're behind a proxy (Nginx/ALB), trust it so secure cookies & IPs work
if (isProd) app.set('trust proxy', 1);

// 1) Per-request CSP nonce for inline scripts in EJS
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// 2) Helmet with explicit CSP (nonce-based) + jsDelivr allowed for Chart.js
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Allow your own scripts + this request's nonce + Chart.js CDN
        "script-src": [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://cdn.jsdelivr.net"
        ],
        // Some browsers differentiate element vs attr; include both
        "script-src-elem": [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://cdn.jsdelivr.net"
        ],
        // Block inline event handlers like onclick=... (use addEventListener instead)
        "script-src-attr": ["'none'"],

        // Inline styles are common with EJS/Bootstrap; keep allowed
        "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],

        // Let images/fonts load from your host + data URLs
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],

        // XHR/fetch destinations
        "connect-src": ["'self'", "https://cdn.jsdelivr.net"],

        // Tighten other vectors
        "object-src": ["'none'"],
        "frame-ancestors": ["'self'"]
      }
    },

    // If you use cross-origin assets that break under COEP/COOP, disable these
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
  })
);

// 3) Sessions
app.use(
  buildSession({
    mongoUrl: process.env.MONGO_URI,
    secret: process.env.SESSION_SECRET,
    isProd
  })
);

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

// 7) Routes
app.use(routes);

// 8) Health check
app.get('/healthz', (req, res) => res.json({ ok: true }));

// 9) 404 + error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

