// routes/index.js
const express = require('express');
const router = express.Router();

// --- auth/admin ---
const authRoutes = require('./authRoutes');
const marketingRoutes = require('./marketingRoutes');

// --- API hub (everything under /api) ---
const api = require('./api');  // <- routes/api/index.js

// --- Page routes (all your res.render(...) stuff) ---
const pages = require('./pages');

// mount routers
router.use('/', authRoutes);
router.use('/', marketingRoutes);

// API hub (protects its own routes with ensureAuth)
router.use('/api', api);

// EJS page routes
router.use(pages);

module.exports = router;
