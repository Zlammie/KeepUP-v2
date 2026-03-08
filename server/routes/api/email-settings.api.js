const express = require('express');

const requireRole = require('../../middleware/requireRole');
const EmailSettings = require('../../models/EmailSettings');
const { getEmailSettings } = require('../../services/email/scheduler');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];

  router.get('/', requireRole(...READ_ROLES), async (req, res) => {
    try {
      const settings = await getEmailSettings(req.user.company);
      res.json({ settings });
    } catch (err) {
    console.error('[email-settings] fetch failed', err);
    res.status(500).json({ error: err.message || 'Failed to load settings' });
    }
  });

router.put('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const updates = {};

    if (typeof payload.timezone === 'string' && payload.timezone.trim()) {
      updates.timezone = payload.timezone.trim();
    }
    if (Array.isArray(payload.allowedDays)) {
      updates.allowedDays = payload.allowedDays.map((d) => Number(d)).filter((d) => Number.isFinite(d));
    }
    if (typeof payload.allowedStartTime === 'string') updates.allowedStartTime = payload.allowedStartTime;
    if (typeof payload.allowedEndTime === 'string') updates.allowedEndTime = payload.allowedEndTime;
    if (typeof payload.quietHoursEnabled === 'boolean') updates.quietHoursEnabled = payload.quietHoursEnabled;
    if (payload.dailyCap != null) updates.dailyCap = Number(payload.dailyCap) || 0;
    if (payload.perUserCap != null) updates.perUserCap = Number(payload.perUserCap) || null;
    if (payload.rateLimitPerMinute != null) updates.rateLimitPerMinute = Number(payload.rateLimitPerMinute) || 0;
    if (typeof payload.unsubscribeBehavior === 'string') {
      updates.unsubscribeBehavior = payload.unsubscribeBehavior;
    }

    const settings = await EmailSettings.findOneAndUpdate(
      { companyId: req.user.company },
      { $set: updates },
      { new: true, upsert: true }
    ).lean();

    res.json({ settings });
  } catch (err) {
    console.error('[email-settings] update failed', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
