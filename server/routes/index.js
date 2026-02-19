// routes/index.js
const express = require('express');
const router = express.Router();

// --- auth/admin ---
const authRoutes = require('./authRoutes');
const marketingRoutes = require('./marketingRoutes');
const publicBuildrootzRoutes = require('./publicBuildrootzRoutes');
const emailSendgridWebhookRoutes = require('./emailSendgridWebhookRoutes');
const emailUnsubscribeRoutes = require('./emailUnsubscribeRoutes');
const stripeWebhookRoutes = require('./stripeWebhookRoutes');

// --- API hub (everything under /api) ---
const api = require('./api');  // <- routes/api/index.js

// --- Page routes (all your res.render(...) stuff) ---
const pages = require('./pages');

// mount routers
router.use('/', authRoutes);
router.use('/', marketingRoutes);
router.use('/', emailUnsubscribeRoutes);
router.use('/api/public', publicBuildrootzRoutes);
router.use('/api/email/sendgrid', emailSendgridWebhookRoutes);
router.use('/api/stripe', stripeWebhookRoutes);

// API hub (protects its own routes with ensureAuth)
router.use('/api', api);

// EJS page routes
router.use(pages);

module.exports = router;
