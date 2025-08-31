const express = require('express');
const router = express.Router();
const Community = require('../models/Community'); // your existing community.js
const Competition = require('../models/Competition'); // existing competitor model
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const FloorPlan = require('../models/FloorPlan');

// helper: derive stats from Community.lots
// helper: derive stats from Community.lots
function deriveLotStats(community) {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  const total = (typeof community.totalLots === 'number')
    ? community.totalLots
    : lots.length;

  // SOLD = has a linked contact
  const sold = lots.filter(l => !!l && !!l.purchaser).length;

  const remaining = total - sold;

  // (we'll compute QMI properly elsewhere)
  const quickMoveInLots = 0;

  return { total, sold, remaining, quickMoveInLots };
}

 
  



// GET: minimal list for dropdown (name + id + optional address/hoa)
router.get('/api/communities/select-options', async (req, res) => {
  try {
    // Adjust fields to match your Community schema
    const communities = await Community.find({})
      .select('name address hoa') // add fields you want
      .sort({ name: 1 })
      .lean();

    res.json(communities);
  } catch (err) {
    console.error('GET /api/communities/select-options error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET: upsert-read for a community’s profile (creates empty profile if missing)
router.get('/api/my-community-competition/:communityId', async (req, res) => {
  const { communityId } = req.params;
  const community = await Community.findById(communityId);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  let profile = await CommunityCompetitionProfile
    .findOne({ community: communityId })
    .populate('linkedCompetitions', 'name builder market')
    .lean();

  if (!profile) {
    profile = await CommunityCompetitionProfile.create({
      community: communityId,
      promotion: '',
      topPlans: { plan1: '', plan2: '', plan3: '' },
      prosCons: { pros: [], cons: [] },
      lotCounts: { total: null, sold: null, remaining: null, quickMoveInLots: null },
      notes: '',
      linkedCompetitions: []
    });
    profile = await CommunityCompetitionProfile.findById(profile._id)
      .populate('linkedCompetitions', 'name builder market')
      .lean();
  }

  const computed = deriveLotStats(community);
  const mergedProfile = { ...profile, lotCounts: { ...(profile.lotCounts || {}), ...computed } };
  res.json({ community, profile: mergedProfile });
});

router.get('/api/communities/:id/lot-stats', async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    res.json(deriveLotStats(community));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET: chart-ready sales series for a community profile
router.get('/api/community-profiles/:communityId/sales', async (req, res) => {
  try {
    const { communityId } = req.params;
    // allow the client to request a window (default 12 months, max 36)
    const months = Math.max(1, Math.min(36, Number(req.query.months) || 12));

    // One profile per Community (as per your schema)
    const profile = await CommunityCompetitionProfile
      .findOne({ community: communityId })
      .lean();

    // If missing, return an empty shape Chart.js can consume
    if (!profile) {
      return res.json({
        labels: [],
        series: { sales: [], cancels: [], net: [], closings: [] }
      });
    }

    // Build fast lookup by "YYYY-MM"
    const byMonth = new Map();
    for (const m of (profile.monthlySalesSummary || [])) {
      // monthlySalesSummary item shape: { month: 'YYYY-MM', sales, cancels, closings }
      byMonth.set(m.month, {
        sales: Number(m.sales || 0),
        cancels: Number(m.cancels || 0),
        closings: Number(m.closings || 0),
      });
    }

    // helpers
    const fmtKey = (yr, mIdx) => `${yr}-${String(mIdx + 1).padStart(2, '0')}`; // YYYY-MM
    const human = (yr, mIdx) =>
      new Date(yr, mIdx, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }); // "Aug 2025"

    // Build rolling window ending in current month
    const end = new Date();
    let y = end.getFullYear();
    let m = end.getMonth(); // 0..11

    const buf = [];
    for (let i = 0; i < months; i++) {
      const key = fmtKey(y, m);
      const rec = byMonth.get(key) || { sales: 0, cancels: 0, closings: 0 };
      buf.push({
        label: human(y, m),
        sales: rec.sales,
        cancels: rec.cancels,
        net: rec.sales - rec.cancels,
        closings: rec.closings
      });

      // move to previous month
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }

    // reverse to chronological order
    buf.reverse();

    const labels = buf.map(b => b.label);
    const series = {
      sales:    buf.map(b => b.sales),
      cancels:  buf.map(b => b.cancels),
      net:      buf.map(b => b.net),
      closings: buf.map(b => b.closings),
    };

    res.json({ labels, series });
  } catch (err) {
    console.error('Sales endpoint error:', err);
    res.status(500).json({ error: 'Failed to load sales summary' });
  }
});

// GET: month-over-month base prices for each floor plan in this community
router.get('/api/community-profiles/:communityId/base-prices', async (req, res) => {
  try {
    const { communityId } = req.params;
    const months = Math.max(1, Math.min(36, Number(req.query.months) || 12));

    const profile = await CommunityCompetitionProfile
      .findOne({ community: communityId })
      .lean();

    if (!profile) return res.json({ labels: [], datasets: [] });

    // quick helpers
    const fmtKey = (yr, mIdx) => `${yr}-${String(mIdx + 1).padStart(2, '0')}`; // YYYY-MM
    const human  = (yr, mIdx) => new Date(yr, mIdx, 1)
      .toLocaleString('en-US', { month: 'short', year: 'numeric' }); // "Aug 2025"

    // 1) Build the rolling month window (ending current month)
    const end = new Date();
    let y = end.getFullYear(), m = end.getMonth();
    const monthKeys = [];
    const labels = [];
    for (let i = 0; i < months; i++) {
      monthKeys.unshift(fmtKey(y, m));     // prepend for chronological order
      labels.unshift(human(y, m));
      m -= 1; if (m < 0) { m = 11; y -= 1; }
    }

    // 2) Build lookup: monthKey -> Map(planId -> price)
    const priceByMonth = new Map(); // key: "YYYY-MM" -> Map<String, Number>
    for (const mp of (profile.monthlyPrices || [])) {
      // only keep entries within the requested window
      if (monthKeys.includes(mp.month)) {
        // Ensure we treat both real Maps and plain objects consistently
        const map = mp.prices instanceof Map ? mp.prices : new Map(Object.entries(mp.prices || {}));
        priceByMonth.set(mp.month, map);
      }
    }

    // 3) Collect the union of planIds present in the window
    const allPlanIds = new Set();
    for (const key of monthKeys) {
      const map = priceByMonth.get(key);
      if (map) for (const pid of map.keys()) allPlanIds.add(String(pid));
    }

    // 4) Optionally try to resolve plan names (safe dynamic require so router still loads if file not present)
    let nameById = {};
    try {
      const FloorPlan = require('../models/FloorPlan');
      const plans = await FloorPlan.find({ _id: { $in: [...allPlanIds] } })
        .select('name') // adjust if your field is different (e.g. title)
        .lean();
      nameById = Object.fromEntries(plans.map(p => [String(p._id), p.name || String(p._id)]));
    } catch (e) {
      // If FloorPlan model path differs or isn't available yet, fall back to ID
      nameById = Object.fromEntries([...allPlanIds].map(id => [id, id.slice(0, 6)]));
    }

    // 5) Build datasets: one per planId, aligned to monthKeys
    const datasets = [...allPlanIds].map(planId => {
      const data = monthKeys.map(k => {
        const map = priceByMonth.get(k);
        if (!map) return null;
        const v = map.get(planId) ?? (map.has(planId) ? map.get(planId) : undefined);
        return typeof v === 'number' ? v : null;
      });
      return {
        label: nameById[planId] || planId,
        planId,
        data,
        type: 'line',
        spanGaps: true, // allow connecting across single nulls if you like
      };
    });

    res.json({ labels, datasets });
  } catch (err) {
    console.error('Base-prices endpoint error:', err);
    res.status(500).json({ error: 'Failed to load base prices' });
  }
});

// GET: QMI vs SOLD scatter (x = sqft, y = $/sqft)
router.get('/api/communities/:communityId/qmi-solds-scatter', async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findById(communityId).lean();
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lots = Array.isArray(community.lots) ? community.lots : [];

    // --- FloorPlan sqft (your schema stores it at specs.squareFeet) ---
    const planIds = [...new Set(lots.map(l => l?.floorPlan).filter(Boolean).map(String))];
    const plans = planIds.length
      ? await FloorPlan.find({ _id: { $in: planIds } })
          .select('name specs.squareFeet') // ⬅️ use the real field
          .lean()
      : [];
    const planById = Object.fromEntries(
      plans.map(p => [String(p._id), {
        name: p.name || '',
        sqftRaw: p?.specs?.squareFeet
      }])
    );

    // --- Optional: base-price fallback from profile.monthlyPrices (latest month wins) ---
    const profile = await CommunityCompetitionProfile
      .findOne({ community: communityId })
      .select('monthlyPrices')
      .lean();

    let latestPlanPrice = new Map(); // Map(planId -> price Number)
    if (profile?.monthlyPrices?.length) {
      // monthlyPrices items look like: { month: "YYYY-MM", prices: { [planId]: Number } }
      // pick the latest by month key
      const latest = profile.monthlyPrices.reduce((a,b) => (a && a.month > b.month) ? a : b, null);
      const obj = latest?.prices || {};
      // Normalize to Map of Number
      latestPlanPrice = new Map(Object.entries(obj).map(([pid, v]) => [String(pid), (typeof v === 'number' ? v : Number(v)) || null]));
    }

    // --- helpers ---
    const num = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const cleaned = String(v).toLowerCase()
        .replace(/[, $]/g, '')
        .replace(/\s*(sf|sqft|sq\.?\s*ft\.?)\s*/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const getSqft = (l) => {
      // any lot-level fields if you add them later
      for (const c of [l?.sqft, l?.sqFt, l?.squareFeet, l?.squareFootage, l?.livingArea, l?.size, l?.totalSqft, l?.totalSF]) {
        const n = num(c); if (n && n > 0) return n;
      }
      const meta = l?.floorPlan ? planById[String(l.floorPlan)] : null;
      const n = num(meta?.sqftRaw);
      return (n && n > 0) ? n : null;
    };

    const getPlanName = (l) => {
      if (l?.floorPlanName || l?.planName || l?.plan) return l.floorPlanName || l.planName || l.plan;
      const meta = l?.floorPlan ? planById[String(l.floorPlan)] : null;
      return meta?.name || '';
    };

    // SOLD = has linked contact; QMI = has release date and no linked contact
    const isSold = (l) => !!l?.purchaser;
    const hasReleaseDate = (l) => {
      const v = l?.releaseDate ?? l?.release ?? l?.availableDate ?? null;
      if (!v) return false;
      const d = new Date(String(v));
      return !Number.isNaN(d.getTime());
    };

    // Prices (strings in your lot schema → parse to Number)
    const getSoldPrice = (l) => {
      for (const c of [l?.salesPrice, l?.soldPrice, l?.salePrice, l?.contractPrice, l?.finalPrice, l?.price]) {
        const n = num(c); if (n && n > 0) return n;
      }
      return null;
    };

    const getQmiPrice = (l) => {
      // 1) prefer explicit list price on the lot
      for (const c of [l?.listPrice, l?.askingPrice, l?.askPrice, l?.price]) {
        const n = num(c); if (n && n > 0) return n;
      }
      // 2) fallback to latest base price for this plan (if any)
      const pid = l?.floorPlan ? String(l.floorPlan) : null;
      if (pid && latestPlanPrice.has(pid)) {
        const n = latestPlanPrice.get(pid);
        if (n && n > 0) return n;
      }
      // 3) nothing to plot
      return null;
    };

    // --- build datasets ---
    const qmi = [];
    const sold = [];
    let skippedNoSqft = 0, skippedNoPrice = 0;

    for (const lot of lots) {
      if (!lot) continue;

      const sqft = getSqft(lot);
      if (!sqft) { skippedNoSqft++; continue; }

        if (isSold(lot)) {
        const price = getSoldPrice(lot) ?? getQmiPrice(lot);
        if (!price) continue;
        sold.push({
          x: sqft,
          y: price,                 // ⬅️ use raw price
          price,
          address: lot.address || '',
          plan: getPlanName(lot)
        });
      } else if (hasReleaseDate(lot)) {
        const price = getQmiPrice(lot);
        if (!price) continue;
        qmi.push({
          x: sqft,
          y: price,                 // ⬅️ use raw price
          price,
          address: lot.address || '',
          plan: getPlanName(lot)
        });
      }
    }

    console.log('[qmi-solds-scatter]', {
      communityId,
      lots: lots.length,
      plans: planIds.length,
      qmi: qmi.length,
      sold: sold.length,
      skippedNoSqft,
      skippedNoPrice,
      usedBaseFallback: [...latestPlanPrice.keys()].length
    });

    return res.json({ qmi, sold });
  } catch (err) {
    console.error('QMI/SOLD scatter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// PUT: update the profile fields (autosave-friendly)
router.put('/api/my-community-competition/:communityId', async (req, res) => {
  const { communityId } = req.params;
  const incoming = req.body;

  const community = await Community.findById(communityId);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const computed = deriveLotStats(community);

  // strip any client-sent computed fields
  const safeLotCounts = { ...(incoming.lotCounts || {}) };
  delete safeLotCounts.total;
  delete safeLotCounts.sold;
  delete safeLotCounts.remaining;
  delete safeLotCounts.quickMoveInLots;

  const update = { ...incoming, lotCounts: { ...safeLotCounts, ...computed } };

  const profile = await CommunityCompetitionProfile.findOneAndUpdate(
    { community: communityId },
    { $set: update },
    { new: true, upsert: true }
  ).populate('linkedCompetitions', 'name builder market');

  res.json(profile);
});


// PUT: set linked competitions list (replace or patch)
router.put('/api/my-community-competition/:communityId/linked-competitions', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { competitionIds } = req.body; // e.g. [ "66a..", "66b.." ]

    const profile = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $set: { linkedCompetitions: competitionIds } },
      { new: true, upsert: true }
    ).populate('linkedCompetitions', 'name builder market');

    res.json(profile);
  } catch (err) {
    console.error('PUT linked-competitions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Optional: search endpoint to pick competitors from your existing list
router.get('/api/competitions/search', async (req, res) => {
  try {
    const { q } = req.query;
    const filter = q
      ? { name: new RegExp(q, 'i') } // or builder/market fields as needed
      : {};
    const results = await Competition.find(filter).select('name builder market').limit(25).lean();
    res.json(results);
  } catch (err) {
    console.error('GET competitions search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET combined QMI vs SOLD scatter (x = sqft, y = price)
router.get('/api/community-competition-profiles/:communityId/qmi-solds-scatter', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month } = req.query; // "YYYY-MM"

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month=YYYY-MM is required' });
    }

    // Call your existing endpoints internally
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const [salesRes, qmiRes] = await Promise.all([
      fetch(`${baseUrl}/api/community-competition-profiles/${communityId}/sales?month=${month}`).then(r => r.json()),
      fetch(`${baseUrl}/api/community-competition-profiles/${communityId}/qmi?month=${month}`).then(r => r.json())
    ]);

    // Shape scatter points: x = sqft, y = price
    const sold = (salesRes.sales || []).map(l => {
      const sqft  = Number(l.sqft) || null;
      const price = Number(l.soldPrice) || null;
      if (!sqft || !price) return null;
      return { x: sqft, y: price, ppsf: price / sqft, address: l.address, plan: l.floorPlan?.name || '' };
    }).filter(Boolean);

    const qmi = (qmiRes.homes || []).map(l => {
      const sqft  = Number(l.sqft) || null;
      const price = Number(l.listPrice) || null;
      if (!sqft || !price) return null;
      return { x: sqft, y: price, ppsf: price / sqft, address: l.address, plan: l.floorPlan?.name || '' };
    }).filter(Boolean);

    return res.json({ qmi, sold });
  } catch (err) {
    console.error('GET /qmi-solds-scatter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
