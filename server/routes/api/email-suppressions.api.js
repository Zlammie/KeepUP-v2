const express = require('express');

const requireRole = require('../../middleware/requireRole');
const Suppression = require('../../models/Suppression');
const { applyUnsubscribeBehavior } = require('../../services/email/unsubscribe');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const items = await Suppression.find({ companyId: req.user.company })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ suppressions: items });
  } catch (err) {
    console.error('[email-suppressions] list failed', err);
    res.status(500).json({ error: 'Failed to load suppressions' });
  }
});

router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const reason = req.body?.reason || Suppression.REASONS.MANUAL;

    const suppression = await Suppression.findOneAndUpdate(
      { companyId: req.user.company, email },
      { $set: { reason } },
      { upsert: true, new: true }
    ).lean();

    await applyUnsubscribeBehavior({ companyId: req.user.company, email });

    res.status(201).json({ suppression });
  } catch (err) {
    console.error('[email-suppressions] create failed', err);
    res.status(500).json({ error: 'Failed to create suppression' });
  }
});

module.exports = router;
