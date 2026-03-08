const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const { enqueueScheduleEmailsForContact } = require('../../services/email/schedules');

const router = express.Router();

const WRITE_ROLES = ['USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

router.post('/apply', requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const contactId = toObjectId(req.body?.contactId);
    const scheduleId = toObjectId(req.body?.scheduleId);

    if (!contactId || !scheduleId) {
      return res.status(400).json({ error: 'contactId and scheduleId are required' });
    }

    const result = await enqueueScheduleEmailsForContact({
      companyId: req.user.company,
      contactId,
      scheduleId
    });

    res.json(result);
  } catch (err) {
    console.error('[email-schedules] apply failed', err);
    res.status(500).json({ error: err.message || 'Failed to apply schedule' });
  }
});

module.exports = router;
