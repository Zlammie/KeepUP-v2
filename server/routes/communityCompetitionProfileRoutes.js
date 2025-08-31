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

// GET /api/community-competition-profiles/:communityId/sales?month=YYYY-MM
router.get('/api/community-competition-profiles/:communityId/sales', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month } = req.query;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month=YYYY-MM is required' });
    }

    // Load community (raw lots, no populate)
    const community = await Community.findById(communityId)
      .select('lots createdAt')
      .lean();
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Helpers
    const ymStrToInt = (ym) => {
      if (typeof ym !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return null;
      const [y, m] = ym.split('-').map(Number);
      return y * 100 + m; // YYYYMM
    };
    const soldDateStrToYMInt = (s) => {
      if (!s || typeof s !== 'string') return null;
      const t = s.trim();

      // 1) YYYY-MM
      let m = t.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
      if (m) return Number(m[1]) * 100 + Number(m[2]);

      // 2) YYYY-MM-DD
      m = t.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{1,2}$/);
      if (m) return Number(m[1]) * 100 + Number(m[2]);

      // 3) MM/DD/YYYY
      m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return Number(m[3]) * 100 + Math.min(12, Math.max(1, Number(m[1])));

      // 4) Fallback Date.parse (e.g., "Jul 16 2025")
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return d.getFullYear() * 100 + (d.getMonth() + 1);

      return null;
    };
    const selectedYM = ymStrToInt(month);
    const soldStatuses = new Set(['closed', 'purchased', 'sold']); // extend if you use other labels

    const lots = Array.isArray(community.lots) ? community.lots : [];
    const results = [];
    const planIds = new Set();

    for (const l of lots) {
      if (!l) continue;

      // Determine "is sold": purchaser linked OR status in a sold bucket
      const status = String(l.status || '').toLowerCase().trim();
      const isSold = Boolean(l.purchaser) || soldStatuses.has(status);
      if (!isSold) continue;

      // Determine the SOLD month (prefer closeMonth, then closeDateTime)
      const soldYM =
        (typeof l.closeMonth === 'string' ? ymStrToInt(l.closeMonth) : null) ??
        soldDateStrToYMInt(l.closeDateTime);

      if (soldYM == null) continue;        // no sold month → skip
      if (selectedYM != null && soldYM !== selectedYM) continue; // show ONLY the selected month

      results.push(l);
      if (l.floorPlan) planIds.add(String(l.floorPlan));
    }

    // Fetch plan details once
    let planMap = {};
    if (planIds.size > 0) {
      const plans = await FloorPlan.find({ _id: { $in: Array.from(planIds) } })
        .select('name planNumber specs.squareFeet')
        .lean();
      planMap = Object.fromEntries(
        plans.map(p => [String(p._id), {
          _id: p._id,
          name: p.name,
          planNumber: p.planNumber,
          sqft: p?.specs?.squareFeet ?? null
        }])
      );
    }

    // Shape rows
    const sales = results.map(l => ({
      lotId: l._id,
      address: l.address || l.streetAddress || '',
      listDate: l.releaseDate || null,    // your schema stores release/list on lots.releaseDate
      floorPlan: l.floorPlan ? planMap[String(l.floorPlan)] || null : null,
      listPrice: l.listPrice ?? null,
      sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
      status: l.status || '',
      soldDate: l.closeDateTime || l.closeMonth || null,
      soldPrice: l.salesPrice ?? null
    }));

    // Sort by soldDate within the month (optional nice-to-have)
    sales.sort((a, b) => String(a.soldDate || '').localeCompare(String(b.soldDate || '')));

    res.json({ month, sales });
  } catch (err) {
    console.error('GET /sales error:', err);
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

// GET /api/community-competition-profiles/:communityId/prices?month=YYYY-MM
router.get('/api/community-competition-profiles/:communityId/prices', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month } = req.query;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month query param required as YYYY-MM' });
    }

    const exists = await Community.findById(communityId).select('_id').lean();
    if (!exists) return res.status(404).json({ error: 'Community not found' });

    const profile = await CommunityCompetitionProfile.findOne({ community: communityId }).lean();
    if (!profile || !Array.isArray(profile.monthlyPrices)) {
      return res.json({ month, prices: {} });
    }

    const entry = profile.monthlyPrices.find(mp => mp.month === month);
    // entry.prices might be a Map or a plain object (when lean)
    const out = entry?.prices
      ? (entry.prices instanceof Map ? Object.fromEntries(entry.prices) : entry.prices)
      : {};
    return res.json({ month, prices: out });
  } catch (err) {
    console.error('GET month prices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/community-competition-profiles/:communityId/qmi?month=YYYY-MM
router.get('/api/community-competition-profiles/:communityId/qmi', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month } = req.query;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month=YYYY-MM is required' });
    }

    // Load community (raw lots, no populate)
    const community = await Community.findById(communityId)
      .select('lots createdAt')
      .lean();
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Load per-month exclusions
    const profile = await CommunityCompetitionProfile.findOne({ community: communityId })
      .select('monthlyQMI')
      .lean();
    const excludedThisMonth = new Set(
      (profile?.monthlyQMI || [])
        .find(m => m.month === month)?.excludedLots
        ?.map(id => id.toString()) || []
    );

    // GET /api/community-competition-profiles/:communityId/sales-summary?month=YYYY-MM
router.get('/api/community-competition-profiles/:communityId/sales-summary', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month } = req.query;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month=YYYY-MM is required' });
    }

    // ensure the community exists (avoid orphan profiles)
    const exists = await Community.findById(communityId).select('_id').lean();
    if (!exists) return res.status(404).json({ error: 'Community not found' });

    const profile = await CommunityCompetitionProfile.findOne({ community: communityId })
      .select('monthlySalesSummary')
      .lean();

    const entry = (profile?.monthlySalesSummary || []).find(s => s.month === month);
    const out = entry ? { sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 }
                      : { sales: 0, cancels: 0, closings: 0 };

    return res.json({ month, ...out });
  } catch (err) {
    console.error('GET /sales-summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

    // Helpers
   // Helpers (replace your current ym() helper with this pair)
// Helpers (keep these near the top of the route)
const ymStrToInt = (ym /* "YYYY-MM" */) => {
  if (typeof ym !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return y * 100 + m; // YYYYMM
};

// releaseDate is a STRING in your schema. Parse into YYYYMM int.
const releaseStrToYMInt = (s) => {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();

  // 1) "YYYY-MM"
  let m = t.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);

  // 2) "YYYY-MM-DD"
  m = t.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{1,2}$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);

  // 3) "MM/DD/YYYY"
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = Math.min(12, Math.max(1, Number(m[1])));
    const yyyy = Number(m[3]);
    return yyyy * 100 + mm;
  }

  // 4) Fallback: Date.parse (handles "Jun 2025", "June 1, 2025", etc.)
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.getFullYear() * 100 + (d.getMonth() + 1);
  }

  return null; // unknown format
};

const selectedYM = ymStrToInt(month);

// more inclusive status checks
const isUC = (s) => s.includes('under') && s.includes('construction'); // "under construction"
const isFinished = (s) => s.includes('finished');

// --- Filter lots ---
const lots = Array.isArray(community.lots) ? community.lots : [];
const candidates = [];
const planIds = new Set();

for (const l of lots) {
  if (!l || excludedThisMonth.has(String(l._id))) continue;

  const s = String(l.status || '').toLowerCase().trim();

  // Must be UC or Finished (contains-based, case-insensitive)
  if (!(isUC(s) || isFinished(s))) continue;

  // Must NOT have a buyer / be closed/purchased
  if (l.purchaser) continue;                       // buyer linked ⇒ not QMI
  if (s === 'closed' || s === 'purchased') continue;

  // --- KEY: use lots.releaseDate (String) as the release month only ---
  const releaseYM = releaseStrToYMInt(l.releaseDate);  // e.g., "2025-06", "06/15/2025", "Jun 2025"
  if (releaseYM == null) continue; // if no release date, don't show yet

  // Show from release month forward
  if (selectedYM != null && selectedYM < releaseYM) continue;

  candidates.push(l);
  if (l.floorPlan) planIds.add(String(l.floorPlan));
}

let planMap = {};
if (planIds.size > 0) {
  const plans = await FloorPlan.find({ _id: { $in: Array.from(planIds) } })
    .select('name planNumber specs.squareFeet')
    .lean();

  planMap = Object.fromEntries(
    plans.map(p => [String(p._id), {
      _id: p._id,
      name: p.name,
      planNumber: p.planNumber,
      sqft: p?.specs?.squareFeet ?? null,
    }])
  );
}


    // Shape response
    const homes = candidates.map(l => ({
      lotId: l._id,
      address: l.address || l.streetAddress || '',
      listDate: l.listDate || null,
      floorPlan: l.floorPlan ? planMap[String(l.floorPlan)] || null : null,
      listPrice: l.listPrice ?? l.price ?? null, // may be string in your schema
      sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
      status: l.status || '',
    }));

    res.json({ month, homes });
  } catch (err) {
    console.error('GET /qmi error:', err);
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

// PUT /api/community-competition-profiles/:communityId/prices
// Body: { month:"YYYY-MM", plan:"<planId>", price:<number|null> }  (single)
//    or { month:"YYYY-MM", prices: { "<planId>": <number|null>, ... } } (bulk)
router.put('/api/community-competition-profiles/:communityId/prices', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month, plan, price, prices } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }

    const doc = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $setOnInsert: { community: communityId } },
      { new: true, upsert: true }
    );

    if (!Array.isArray(doc.monthlyPrices)) doc.monthlyPrices = [];
    let entry = doc.monthlyPrices.find(mp => mp.month === month);
    if (!entry) {
      entry = { month, prices: new Map() };
      doc.monthlyPrices.push(entry);
    }

    if (!(entry.prices instanceof Map)) {
      entry.prices = new Map(Object.entries(entry.prices || {}));
    }

    if (plan) {
      // single
      if (price == null || price === '') entry.prices.delete(String(plan));
      else {
        const n = Number(price);
        entry.prices.set(String(plan), Number.isFinite(n) ? n : 0);
      }
    } else if (prices && typeof prices === 'object') {
      // bulk
      for (const [pid, val] of Object.entries(prices)) {
        if (val == null || val === '') entry.prices.delete(String(pid));
        else {
          const n = Number(val);
          entry.prices.set(String(pid), Number.isFinite(n) ? n : 0);
        }
      }
    } else {
      return res.status(400).json({ error: 'Provide {plan, price} or {prices}' });
    }

    await doc.save();

    const out = Object.fromEntries(entry.prices);
    return res.json({ month, prices: out });
  } catch (err) {
    console.error('PUT month prices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Body: { month:"YYYY-MM", excludeLotId:"<lotSubdocId>" }  // hide for that month
//    or { month:"YYYY-MM", includeLotId:"<lotSubdocId>" }  // unhide for that month
router.put('/api/community-competition-profiles/:communityId/qmi', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month, excludeLotId, includeLotId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }
    if (!excludeLotId && !includeLotId) {
      return res.status(400).json({ error: 'Provide excludeLotId or includeLotId' });
    }

    const doc = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $setOnInsert: { community: communityId } },
      { new: true, upsert: true }
    );

    if (!Array.isArray(doc.monthlyQMI)) doc.monthlyQMI = [];
    let entry = doc.monthlyQMI.find(m => m.month === month);
    if (!entry) {
      entry = { month, excludedLots: [] };
      doc.monthlyQMI.push(entry);
    }

    const toId = (v) => (mongoose.Types.ObjectId.isValid(v) ? v : null);

    if (excludeLotId) {
      const id = toId(excludeLotId);
      if (id && !entry.excludedLots.some(x => x.equals(id))) {
        entry.excludedLots.push(id);
      }
    }
    if (includeLotId) {
      const id = toId(includeLotId);
      if (id) entry.excludedLots = entry.excludedLots.filter(x => !x.equals(id));
    }

    await doc.save();
    res.json({ month, excludedLots: entry.excludedLots.map(x => x.toString()) });
  } catch (err) {
    console.error('PUT QMI error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/community-competition-profiles/:communityId/sales-summary
// Body: { month:"YYYY-MM", sales?:<num>, cancels?:<num>, closings?:<num> }
router.put('/api/community-competition-profiles/:communityId/sales-summary', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month, sales, cancels, closings } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }

    const doc = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $setOnInsert: { community: communityId } },
      { new: true, upsert: true }
    );

    if (!Array.isArray(doc.monthlySalesSummary)) doc.monthlySalesSummary = [];

    let entry = doc.monthlySalesSummary.find(s => s.month === month);
    if (!entry) {
      entry = { month, sales: 0, cancels: 0, closings: 0 };
      doc.monthlySalesSummary.push(entry);
    }

    // apply partial updates if provided
    const toInt = (v) => (v === '' || v == null ? null : Number(v));
    const s = toInt(sales);
    const c = toInt(cancels);
    const cl = toInt(closings);

    if (s != null && Number.isFinite(s)) entry.sales = s;
    if (c != null && Number.isFinite(c)) entry.cancels = c;
    if (cl != null && Number.isFinite(cl)) entry.closings = cl;

    await doc.save();

    return res.json({
      month: entry.month,
      sales: entry.sales ?? 0,
      cancels: entry.cancels ?? 0,
      closings: entry.closings ?? 0
    });
  } catch (err) {
    console.error('PUT /sales-summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
