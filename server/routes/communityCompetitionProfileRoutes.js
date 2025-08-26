// server/routes/communityCompetitionProfileRoutes.js
const express = require('express');
const mongoose = require('mongoose');

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');

const router = express.Router();

// helpers
function toArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(s => s.toString().trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * GET profile for a communityId
 * Returns just the profile doc (no community wrapper) with a default shape if not present yet.
 */
router.get('/api/community-competition-profiles/:communityId', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    // ensure community exists
    const exists = await Community.findById(communityId).select('_id').lean();
    if (!exists) return res.status(404).json({ error: 'Community not found' });

    // populate topPlans.* if a profile exists
    let profile = await CommunityCompetitionProfile.findOne({ community: communityId })
      .populate([
        { path: 'topPlans.plan1', select: 'name planNumber specs.squareFeet' },
        { path: 'topPlans.plan2', select: 'name planNumber specs.squareFeet' },
        { path: 'topPlans.plan3', select: 'name planNumber specs.squareFeet' },
      ])
      .lean();

    // return a default shape if none exists yet
    if (!profile) {
      profile = {
        community: communityId,
        promotion: '',
        prosCons: { pros: [], cons: [] },
        topPlans: { plan1: null, plan2: null, plan3: null },
      };
    }

    res.json(profile);
  } catch (err) {
    console.error('GET /community-competition-profiles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/api/communities/:communityId/floorplans', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    // 1) Prefer FloorPlan → communities link
    let plans = await FloorPlan.find({ communities: communityId })
      .select('_id name planNumber specs.squareFeet specs.beds specs.baths specs.garage')
      .sort({ name: 1 })
      .lean();

    // 2) Fallback: dedupe from Community.lots.floorPlan
    if (!plans.length) {
      const community = await Community.findById(communityId)
        .populate('lots.floorPlan', 'name planNumber specs.squareFeet specs.beds specs.baths specs.garage')
        .lean();

      const uniq = new Map();
      for (const lot of (community?.lots || [])) {
        const fp = lot.floorPlan;
        if (fp && fp._id) uniq.set(fp._id.toString(), fp);
      }
      plans = Array.from(uniq.values()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    }

    res.json(plans);
  } catch (err) {
    console.error('GET /communities/:id/floorplans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Total lot count for a community
router.get('/api/communities/:communityId/lot-count', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    // Pull what we need; prefer a maintained totalLots field, otherwise fall back to subdoc count
    const comm = await Community.findById(communityId).select('totalLots lots').lean();
    if (!comm) return res.status(404).json({ error: 'Community not found' });

    const totalLots =
      typeof comm.totalLots === 'number'
        ? comm.totalLots
        : (Array.isArray(comm.lots) ? comm.lots.length : 0);

    res.json({ totalLots });
  } catch (err) {
    console.error('GET /api/communities/:communityId/lot-count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Aggregate lot stats for a community ---
// total = totalLots (if present) else lots.length
// sold  = count of lots that have a linked Contact (purchaser)
// remaining = total - sold
// quickMoveInLots = 0 for now (wire later)
router.get('/api/communities/:communityId/lot-stats', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    // We only need purchaser + totalLots to compute stats
    const community = await Community.findById(communityId)
      .select('totalLots lots.purchaser lots') // adjust if your ref field is named differently
      .lean();

    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lots = Array.isArray(community.lots) ? community.lots : [];
    const total = (typeof community.totalLots === 'number')
      ? community.totalLots
      : lots.length;

    // IMPORTANT: 'purchaser' is assumed to be the ObjectId of Contact on each lot.
    // If your field name differs (e.g., 'buyerContact' or 'contact'), change the line below.
    const sold = lots.filter(l => !!l && !!l.purchaser).length;

    const remaining = Math.max(0, total - sold);

    return res.json({
      total,
      sold,
      remaining,
      quickMoveInLots: 0, // TODO: compute later when you define the rule
    });
  } catch (err) {
    console.error('GET /api/communities/:communityId/lot-stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * PUT (upsert) profile fields (promotion + pros/cons for now).
 * Accepts:
 *  {
 *    promotion: string,
 *    prosCons: { pros: string[]|string, cons: string[]|string }
 *  }
 * Returns the updated profile.
 */
router.put('/api/community-competition-profiles/:communityId', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    const exists = await Community.findById(communityId).select('_id').lean();
    if (!exists) return res.status(404).json({ error: 'Community not found' });

    const promotion = (req.body?.promotion ?? '').toString();
    const pros = toArray(req.body?.prosCons?.pros ?? []);
    const cons = toArray(req.body?.prosCons?.cons ?? []);

    const normalizeId = (v) => {
      if (!v) return null;
      if (typeof v === 'object' && v._id) v = v._id;   // accept populated object
      return mongoose.Types.ObjectId.isValid(v) ? v : null;
    };

    const topPlansIn = req.body?.topPlans || {};

    const update = {
      promotion,
      prosCons: { pros, cons },
      // only set topPlans if present in the body
      ...(req.body.topPlans ? {
        topPlans: {
          plan1: normalizeId(topPlansIn.plan1),
          plan2: normalizeId(topPlansIn.plan2),
          plan3: normalizeId(topPlansIn.plan3),
        }
      } : {})
    };

    const profile = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $set: update, $setOnInsert: { community: communityId } },
      { new: true, upsert: true }
    )
    .populate([
      { path: 'topPlans.plan1', select: 'name planNumber specs.squareFeet' },
      { path: 'topPlans.plan2', select: 'name planNumber specs.squareFeet' },
      { path: 'topPlans.plan3', select: 'name planNumber specs.squareFeet' },
    ])
    .lean();

    res.json(profile);
  } catch (err) {
    console.error('PUT /community-competition-profiles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
