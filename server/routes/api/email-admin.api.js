const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const EmailJob = require('../../models/EmailJob');
const { BLOCKED_REASONS } = require('../../services/email/blockedReasons');

const router = express.Router();

const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');

const normalizeReason = (value) => String(value || '').trim().toUpperCase();

router.post('/unblock', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const reason = normalizeReason(req.query?.reason || req.body?.reason);
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }
    if (!BLOCKED_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason' });
    }

    let companyId = req.user?.company;
    if (isSuper(req) && req.query?.companyId) {
      if (!isObjectId(req.query.companyId)) {
        return res.status(400).json({ error: 'Invalid companyId' });
      }
      companyId = new mongoose.Types.ObjectId(String(req.query.companyId));
    }

    if (!companyId || !isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }

    const result = await EmailJob.updateMany(
      {
        companyId,
        status: EmailJob.STATUS.QUEUED,
        lastError: reason
      },
      {
        $unset: { lastError: '' },
        $set: { nextAttemptAt: null }
      }
    );

    return res.json({
      ok: true,
      reason,
      companyId: String(companyId),
      modified: result?.modifiedCount || 0
    });
  } catch (err) {
    console.error('[email-unblock] failed', err);
    return res.status(500).json({ error: 'Failed to unblock jobs' });
  }
});

module.exports = router;
