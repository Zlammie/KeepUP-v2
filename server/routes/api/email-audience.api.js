const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const Contact = require('../../models/Contact');
const Suppression = require('../../models/Suppression');
const { normalizeEmail } = require('../../utils/normalizeEmail');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

router.post('/preview', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const filters = req.body?.filters || {};
    const baseFilter = { company: req.user.company };

    if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
      baseFilter.communityIds = { $in: filters.communityIds.map((id) => toObjectId(id)).filter(Boolean) };
    }

    if (Array.isArray(filters.statuses) && filters.statuses.length) {
      baseFilter.status = { $in: filters.statuses };
    }

    const andClauses = [];

    if (filters.linkedLot === true) {
      andClauses.push({
        $or: [
          { lotId: { $ne: null } },
          { 'linkedLot.lotId': { $exists: true } }
        ]
      });
    }


    if (andClauses.length) {
      baseFilter.$and = andClauses;
    }

    if (Array.isArray(filters.tags) && filters.tags.length) {
      baseFilter.tags = { $in: filters.tags };
    }

    const total = await Contact.countDocuments(baseFilter);

    const suppressedEmails = await Suppression.find({ companyId: req.user.company })
      .select('email')
      .lean();
    const suppressedSet = suppressedEmails
      .map((entry) => normalizeEmail(entry.email))
      .filter(Boolean);

    const eligibleFilter = {
      ...baseFilter,
      doNotEmail: { $ne: true },
      emailPaused: { $ne: true },
      email: { $type: 'string', $ne: '' }
    };
    if (suppressedSet.length) {
      eligibleFilter.email = { ...eligibleFilter.email, $nin: suppressedSet };
    }

    const eligible = await Contact.countDocuments(eligibleFilter);
    const excluded = Math.max(0, total - eligible);

    const sampleRecipients = await Contact.find(eligibleFilter)
      .select('firstName lastName email status')
      .limit(10)
      .lean();

    res.json({
      total,
      excluded,
      sampleRecipients
    });
  } catch (err) {
    console.error('[email-audience] preview failed', err);
    res.status(500).json({ error: 'Failed to build audience preview' });
  }
});

module.exports = router;
