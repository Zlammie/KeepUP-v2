const express = require('express');
const mongoose = require('mongoose');
const router  = express.Router();

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan'); // tenant-scoped
const Contact   = require('../models/Contact');   // tenant-scoped

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

// allow updates only to these nested lot keys (expand as needed)
const ALLOWED_LOT_FIELDS = new Set([
  'status', 'address', 'streetAddress', 'lot', 'block', 'phase', 'jobNumber',
  'listPrice', 'salesPrice', 'salesDate', 'releaseDate', 'listDate',
  'squareFeet', 'sqft', 'notes',
  'floorPlan',  // ObjectId -> FloorPlan (guarded)
  'purchaser'   // ObjectId -> Contact   (guarded)
]);

const sanitizeLotUpdates = (updates) => {
  const out = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (!ALLOWED_LOT_FIELDS.has(k)) continue;           // drop unknown keys
    if (k === 'listPrice' || k === 'salesPrice' || k === 'squareFeet' || k === 'sqft') {
      if (v === '' || v == null) out[k] = undefined;
      else out[k] = Number(v);
      continue;
    }
    out[k] = v;
  }
  return out;
};

async function assertCommunityInTenant(req, communityId, fields = '') {
  const filter = { _id: communityId, ...companyFilter(req) };
  const doc = await Community.findOne(filter).select(fields || '_id company').lean();
  if (!doc) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  return doc;
}

async function assertFloorPlanInTenant(req, floorPlanId) {
  if (!isObjectId(floorPlanId)) {
    const err = new Error('Invalid floorPlan id');
    err.status = 400;
    throw err;
  }
  const fp = await FloorPlan.findOne({ _id: floorPlanId, ...companyFilter(req) })
    .select('_id')
    .lean();
  if (!fp) {
    const err = new Error('FloorPlan not found');
    err.status = 404;
    throw err;
  }
}

async function assertContactInTenant(req, contactId) {
  if (!isObjectId(contactId)) {
    const err = new Error('Invalid purchaser id');
    err.status = 400;
    throw err;
  }
  const c = await Contact.findOne({ _id: contactId, ...companyFilter(req) })
    .select('_id')
    .lean();
  if (!c) {
    const err = new Error('Purchaser (Contact) not found');
    err.status = 404;
    throw err;
  }
}

// All routes require auth
router.use(ensureAuth);

/**
 * GET /communities/:communityId/lots
 * Read-only: list all lots for a community (tenant-scoped)
 */
router.get('/communities/:communityId/lots',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      const community = await Community
        .findOne({ _id: communityId, ...companyFilter(req) })
        .populate('lots.purchaser',  'firstName lastName')
        .populate('lots.floorPlan',  'name planNumber specs.squareFeet')
        .lean();

      if (!community) return res.status(404).json({ error: 'Community not found' });

      const lots = Array.isArray(community.lots) ? community.lots : [];
      if (!lots.length) return res.json([]);

      const purchaserIds = [...new Set(
        lots
          .map(lot => {
            const purchaser = lot?.purchaser;
            if (!purchaser) return null;
            if (typeof purchaser === 'object' && purchaser !== null) {
              if (purchaser._id) return purchaser._id.toString();
            }
            return purchaser?.toString ? purchaser.toString() : null;
          })
          .filter(Boolean)
      )];

      let closingByContactId = {};
      if (purchaserIds.length) {
        const contacts = await Contact.find({
          _id: { $in: purchaserIds },
          ...companyFilter(req)
        })
          .select('_id lenders.isPrimary lenders.closingDateTime lenders.closingStatus')
          .lean();

        closingByContactId = contacts.reduce((acc, contact) => {
          const lenders = Array.isArray(contact.lenders) ? contact.lenders : [];
          if (!lenders.length) return acc;
          const primary = lenders.find(entry => entry?.isPrimary) || lenders[0];
          if (!primary) return acc;
          acc[contact._id.toString()] = {
            closingDateTime: primary.closingDateTime || null,
            closingStatus: primary.closingStatus || null
          };
          return acc;
        }, {});
      }

      const enhancedLots = lots.map(lot => {
        const purchaser = lot?.purchaser;
        const purchaserId = purchaser && typeof purchaser === 'object' && purchaser !== null
          ? purchaser._id?.toString?.()
          : purchaser?.toString?.();

        if (!purchaserId) return lot;

        const closing = closingByContactId[purchaserId];
        if (!closing) return lot;

        if (!lot.closingDateTime && closing.closingDateTime) {
          lot.closingDateTime = closing.closingDateTime;
        }
        if (!lot.closeDateTime && closing.closingDateTime) {
          lot.closeDateTime = closing.closingDateTime;
        }
        if (!lot.closingStatus && closing.closingStatus) {
          lot.closingStatus = closing.closingStatus;
        }
        return lot;
      });

      return res.json(enhancedLots);
    } catch (err) {
      console.error('Error fetching lots:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * PUT /communities/:communityId/lots/:lotId
 * Update a single nested lot (USER+)
 * - tenant-scoped
 * - validates floorPlan/purchaser cross-tenant
 * - only whitelisted fields can be updated
 */
router.put('/communities/:communityId/lots/:lotId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId, lotId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(lotId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }

      // ensure community is in tenant
      await assertCommunityInTenant(req, communityId);

      // sanitize/validate updates
      const updates = sanitizeLotUpdates(req.body);

      // guard cross-tenant object references
      if (updates.floorPlan) await assertFloorPlanInTenant(req, updates.floorPlan);
      if (updates.purchaser) await assertContactInTenant(req, updates.purchaser);

      // build $set targeting the matching array element
      const $set = {};
      for (const [k, v] of Object.entries(updates)) {
        $set[`lots.$.${k}`] = v;
      }

      const updated = await Community.findOneAndUpdate(
        { _id: communityId, ...companyFilter(req), 'lots._id': lotId },
        { $set },
        { new: true, runValidators: true }
      )
        .populate('lots.purchaser', 'firstName lastName')
        .populate('lots.floorPlan', 'name planNumber specs.squareFeet');

      if (!updated) return res.status(404).json({ error: 'Community or Lot not found' });

      const updatedLot = updated.lots.id(lotId);
      return res.json(updatedLot);
    } catch (err) {
      console.error('Error updating nested lot:', err);
      const code = err.status || (err?.code === 11000 ? 409 : 500);
      return res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

module.exports = router;
