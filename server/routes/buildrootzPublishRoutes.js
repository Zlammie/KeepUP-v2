const express = require('express');
const mongoose = require('mongoose');
const ensureAuth = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const { publishHome, unpublishHome, syncHome } = require('../services/buildrootzPublisher');

// Legacy direct publish endpoints.
// Listing-details workflow now uses /listing-details/publish + brzPublishingService inventory bundle flow.

const router = express.Router();
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));
const WRITE_ROLES = ['USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

router.use(ensureAuth);

router.post('/homes/:id/publish', requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid home id' });
    const companyId = req.user?.company;
    if (!companyId) return res.status(400).json({ error: 'Missing company scope' });

    const result = await publishHome(id, companyId, req.user?._id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[buildrootz] publish route error', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Publish failed',
      code: err.code,
      mappingUrl: err.mappingUrl
    });
  }
});

router.post('/homes/:id/unpublish', requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid home id' });
    const companyId = req.user?.company;
    if (!companyId) return res.status(400).json({ error: 'Missing company scope' });

    const result = await unpublishHome(id, companyId, req.user?._id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[buildrootz] unpublish route error', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Unpublish failed',
      code: err.code,
      mappingUrl: err.mappingUrl
    });
  }
});

router.post('/homes/:id/sync', requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid home id' });
    const companyId = req.user?.company;
    if (!companyId) return res.status(400).json({ error: 'Missing company scope' });

    const result = await syncHome(id, companyId, req.user?._id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[buildrootz] sync route error', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Sync failed',
      code: err.code,
      mappingUrl: err.mappingUrl
    });
  }
});

module.exports = router;
