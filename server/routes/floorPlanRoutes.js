const express = require('express');
const mongoose = require('mongoose');
const router  = express.Router();

const FloorPlan = require('../models/FloorPlan');
const Community = require('../models/Community');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

async function assertCommunitiesInTenant(req, ids = []) {
  if (!ids || !ids.length) return;
  const filter = { _id: { $in: ids } , ...companyFilter(req) };
  const count = await Community.countDocuments(filter);
  if (count !== ids.length) {
    const err = new Error('One or more communities are not in your company');
    err.status = 400;
    throw err;
  }
}

// all routes require auth
router.use(ensureAuth);

/**
 * GET /api/floorplans?q=2007
 * Read: READONLY+
 */
router.get('/',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const filter = {
        ...companyFilter(req),
        ...(q ? { $or: [
          { planNumber: { $regex: q, $options: 'i' } },
          { name:       { $regex: q, $options: 'i' } },
        ] } : {})
      };

      const plans = await FloorPlan
        .find(filter)
        .populate({ path: 'communities', select: 'name city state company' })
        .lean();

      res.json(plans);
    } catch (err) {
      console.error('Error fetching floor plans:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * GET /api/floorplans/:id
 * Read: READONLY+
 */
router.get('/:id',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const plan = await FloorPlan
        .findOne({ _id: id, ...companyFilter(req) })
        .populate({ path: 'communities', select: 'name city state company' })
        .lean();

      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
      res.json(plan);
    } catch (err) {
      console.error('Error fetching floor plan:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST /api/floorplans
 * Create: USER+
 * Body: { planNumber, name, specs, communities? }
 * - stamps company server-side
 * - validates community ids belong to same tenant
 */
router.post('/',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { planNumber, name, specs = {}, communities = [] } = req.body;
      if (!planNumber || !name) return res.status(400).json({ error: 'planNumber and name are required' });

      // ensure linked communities are in caller's company
      const communityIds = communities.filter(isObjectId);
      await assertCommunitiesInTenant(req, communityIds);

      // stamp company (non-super cannot spoof)
      const body = {
        planNumber: String(planNumber).trim(),
        name: String(name).trim(),
        specs,
        communities: communityIds,
        company: isSuper(req) ? (req.body.company || req.user.company) : req.user.company
      };

      const newPlan = await FloorPlan.create(body);
      res.status(201).json(newPlan);
    } catch (err) {
      console.error('Error creating floor plan:', err);
      const code = err?.code === 11000 ? 409 : 400; // duplicate key → 409
      res.status(code).json({ error: err.message || 'Failed to create floor plan' });
    }
  }
);

/**
 * PUT /api/floorplans/:id
 * Update: USER+
 * - blocks cross-tenant moves
 * - validates communities belong to same tenant when provided
 */
router.put('/:id',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const updates = { ...req.body };
      delete updates.company; // never allow company to change

      if (Array.isArray(updates.communities)) {
        const communityIds = updates.communities.filter(isObjectId);
        await assertCommunitiesInTenant(req, communityIds);
        updates.communities = communityIds;
      }

      const plan = await FloorPlan.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        updates,
        { new: true, runValidators: true }
      );

      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
      res.json(plan);
    } catch (err) {
      console.error('Error updating floor plan:', err);
      const code = err?.code === 11000 ? 409 : 400;
      res.status(code).json({ error: err.message || 'Failed to update floor plan' });
    }
  }
);

/**
 * DELETE /api/floorplans/:id
 * Delete: MANAGER+
 */
router.delete('/:id',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const plan = await FloorPlan.findOneAndDelete({ _id: id, ...companyFilter(req) });
      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });

      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting floor plan:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
