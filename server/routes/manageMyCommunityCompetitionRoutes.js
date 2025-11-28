// server/routes/manageMyCommunityCompetitionRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const ensureAuth = require('../middleware/ensureAuth');

const Community = require('../models/Community');
const Competition = require('../models/Competition');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const FloorPlan = require('../models/FloorPlan');

const router = express.Router();
router.use(ensureAuth);

const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = (req) => (isSuper(req) ? {} : { company: req.user.company });

// ------------------------ helpers ------------------------
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

const toYM = (val) => {
  if (!val) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) return val;       // "YYYY-MM"
  const d = new Date(val);
  return Number.isNaN(d.getTime())
    ? null
    : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

const parseMonth = (val) => {
  if (!val || typeof val !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(val.trim());
  if (!m) return null;
  const y = +m[1], mm = +m[2];
  if (y < 2000 || mm < 1 || mm > 12) return null;
  return `${y}-${String(mm).padStart(2,'0')}`;
};

const toNum = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, $]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const looksSold = (lot) =>
  lot?.generalStatus === 'Sold' ||
  lot?.generalStatus === 'Closed' ||
  !!lot?.purchaser ||
  !!lot?.salesDate;

const releaseMonthMatches = (releaseStr, ym) => {
  if (!ym || !releaseStr) return false;
  // allow 'YYYY-MM' or full date strings
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(releaseStr)) return releaseStr === ym;
  const d = new Date(releaseStr);
  return Number.isNaN(d.getTime()) ? false : monthKey(d) === ym;
};

function deriveLotStats(community) {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  const total = (typeof community.totalLots === 'number') ? community.totalLots : lots.length;
  const sold = lots.filter(looksSold).length;
  const remaining = Math.max(0, total - sold);
  const quickMoveInLots = 0; // tune if you track it
  return { total, sold, remaining, quickMoveInLots };
}

// “home-like” normalization for Community-embedded inventory/sales
const arr = (v) => Array.isArray(v) ? v : [];

const normalizeHome = (x) => {
  const floorPlanId = x?.floorPlan ? String(x.floorPlan) : null;
  const plan = x?.floorPlanName || x?.planName || x?.plan || '';
  const sqft =
    tonum(x?.sqft) ?? tonum(x?.sqFt) ?? tonum(x?.squareFeet) ?? tonum(x?.squareFootage) ??
    tonum(x?.livingArea) ?? tonum(x?.size) ?? tonum(x?.totalSqft) ?? tonum(x?.totalSF);
  const listPrice =
    tonum(x?.listPrice) ?? tonum(x?.askingPrice) ?? tonum(x?.askPrice) ?? tonum(x?.price);
  const soldPrice =
    tonum(x?.soldPrice) ?? tonum(x?.salesPrice) ?? tonum(x?.salePrice) ?? tonum(x?.contractPrice) ?? tonum(x?.price);
  const releaseDate = x?.releaseDate || x?.availableDate || x?.release || null;
  const soldDate = x?.soldDate || null;
  const address = x?.address || x?.lotAddress || x?.street || '';
  const status = x?.status || x?.state || null;
  return { floorPlanId, plan, sqft, listPrice, soldPrice, releaseDate, soldDate, address, status };
};

const monthMatches = (dateLike, monthKey) => {
  if (!dateLike || !monthKey) return false;
  const d = new Date(String(dateLike));
  if (Number.isNaN(d.getTime())) return false;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === monthKey;
};

// pick candidate arrays for inventory/sales from the Community doc
function inventoryFromCommunity(community) {
  return [
    ...arr(community.inventory),
    ...arr(community.quickMoveIns),
    ...arr(community.qmi),
    ...arr(community.homes).filter(h => !h?.purchaser && !h?.soldDate),
    ...arr(community.lots).filter(l => !l?.purchaser && !l?.soldDate),
  ].map(normalizeHome);
}

function salesFromCommunity(community) {
  return [
    ...arr(community.sales),
    ...arr(community.soldHomes),
    ...arr(community.closings),
    ...arr(community.homes).filter(h => !!h?.purchaser || !!h?.soldDate),
    ...arr(community.lots).filter(l => !!l?.purchaser || !!l?.soldDate),
  ].map(normalizeHome);
}

async function attachPlanNames(items) {
  const missing = items.filter(i => !i.plan && i.floorPlanId);
  const ids = [...new Set(missing.map(i => i.floorPlanId))];
  if (!ids.length) return items;
  // Try both: plans that reference community and plans referenced directly by id
  const plans = await FloorPlan.find({ _id: { $in: ids } }).select('name').lean();
  const byId = Object.fromEntries(plans.map(p => [String(p._id), p.name || '']));
  for (const it of items) {
    if (!it.plan && it.floorPlanId) it.plan = byId[it.floorPlanId] || it.plan || '';
  }
  return items;
}

// ------------------------ endpoints used by "Manage" page ------------------------

/** Community helpers */
router.get('/communities/:communityId/lot-stats', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findById(communityId).lean();
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lots   = Array.isArray(community?.lots) ? community.lots : [];
    const total  = typeof community.totalLots === 'number' ? community.totalLots : lots.length;
    const sold   = lots.filter(looksSold).length;
    const remaining = Math.max(0, total - sold);
    const quickMoveInLots = lots.filter(l =>
      (l?.listDate || l?.releaseDate || l?.availableDate) && !looksSold(l)
    ).length;

    res.json({ total, sold, remaining, quickMoveInLots });
  } catch (err) {
    console.error('[lot-stats]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Floorplans for dropdown (tries community field; falls back to plans referenced in data)
router.get('/communities/:communityId/floorplans', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findOne({ _id: communityId, ...companyFilter(req) })
      .select('lots homes inventory quickMoveIns qmi')
      .lean();
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // prefer FloorPlan documents that have a community reference
    let plans = await FloorPlan.find({ communities: community._id, ...companyFilter(req) })
      .select('name planNumber specs.squareFeet')
      .lean();

    if (!plans.length) {
      // fallback: collect plan ids from community data
      const ids = new Set();
      for (const col of [community?.lots, community?.homes, community?.inventory, community?.quickMoveIns, community?.qmi]) {
        for (const h of arr(col)) if (h?.floorPlan) ids.add(String(h.floorPlan));
      }
      if (ids.size) {
        plans = await FloorPlan.find({ _id: { $in: [...ids] }, ...companyFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
      }
    }
    res.json(plans || []);
  } catch (err) {
    console.error('[floorplans]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Small competition list (for linking)
router.get('/competitions/minimal', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const find = q
      ? { $or: [
          { communityName: { $regex: q, $options: 'i' } },
          { builderName:   { $regex: q, $options: 'i' } },
          { city:          { $regex: q, $options: 'i' } },
          { state:         { $regex: q, $options: 'i' } },
        ] }
      : {};
    const rows = await Competition.find(find)
      .select('communityName builderName city state market communityRef isInternal')
      .limit(50)
      .lean();
    res.json(rows);
  } catch (err) {
    console.error('[competitions/minimal]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Profile CRUD + linked competitions */
router.get('/community-competition-profiles/:communityId', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    let profile = await CommunityCompetitionProfile
      .findOne({ community: communityId })
      .populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal communityRef')
      .lean();

    if (!profile) {
      const created = await CommunityCompetitionProfile.create({
        community: communityId,
        promotion: '',
        topPlans: { plan1: '', plan2: '', plan3: '' },
        prosCons: { pros: [], cons: [] },
        lotCounts: { total: null, sold: null, remaining: null, quickMoveInLots: null },
        notes: '',
        linkedCompetitions: [],
        monthlyQmiExclusions: {} // optional map of YYYY-MM -> [lotId]
      });
      profile = await CommunityCompetitionProfile.findById(created._id)
        .populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal communityRef')
        .lean();
    }

    const lotCounts = deriveLotStats(community);
    res.json({ community, profile: { ...(profile || {}), lotCounts } });
  } catch (err) {
    console.error('[profile:get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/community-competition-profiles/:communityId', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const incoming = req.body || {};
    // recompute lotCounts on each save, but do not trust client-sent values
    const computed = deriveLotStats(community);

    const update = { ...incoming, lotCounts: { ...(incoming.lotCounts || {}), ...computed } };
    delete update.lotCounts.total; // prevent client overriding computed fields
    delete update.lotCounts.sold;
    delete update.lotCounts.remaining;
    delete update.lotCounts.quickMoveInLots;

    const saved = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $set: update },
      { new: true, upsert: true }
    ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal communityRef');

    res.json({ profile: saved });
  } catch (err) {
    console.error('[profile:put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/community-competition-profiles/:communityId/linked-competitions', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { competitionIds = [] } = req.body || {};
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const cleanIds = competitionIds
      .map(String)
      .filter(isId)
      .map((id) => new mongoose.Types.ObjectId(id));

    const saved = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $set: { linkedCompetitions: cleanIds } },
      { new: true, upsert: true }
    ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal communityRef');

    res.json({ profile: saved });
  } catch (err) {
    console.error('[linked-competitions:put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Prices (month) */
router.get('/community-competition-profiles/:communityId/prices', async (req, res) => {
  try {
    const { communityId } = req.params;
    const month = parseMonth(req.query.month);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
    if (!month) return res.json({ month: null, prices: {} });

    const profile = await CommunityCompetitionProfile.findOne({ community: communityId }).lean();
    const rec = profile?.monthlyPrices?.find(mp => mp?.month === month);
    const prices = rec?.prices
      ? (rec.prices instanceof Map ? Object.fromEntries(rec.prices) : rec.prices)
      : {};
    res.json({ month, prices });
  } catch (err) {
    console.error('[prices:get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/community-competition-profiles/:communityId/prices', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month: rawMonth, plan, price } = req.body || {};
    const month = parseMonth(rawMonth);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
    if (!month || !plan)   return res.status(400).json({ error: 'month and plan are required' });

    const prof = await CommunityCompetitionProfile.findOne({ community: communityId });
    if (!prof) return res.status(404).json({ error: 'Profile not found' });

    prof.monthlyPrices = prof.monthlyPrices || [];
    let entry = prof.monthlyPrices.find(mp => mp.month === month);

    // Create the month record if missing
    if (!entry) {
      prof.monthlyPrices.push({ month, prices: {} });
      entry = prof.monthlyPrices[prof.monthlyPrices.length - 1];
    }

    // Normalize to something we can .set() on
    const isMongooseMap = (m) => m && typeof m.get === 'function' && typeof m.set === 'function';
    if (!isMongooseMap(entry.prices)) {
      // Convert plain object -> native Map so Mongoose casts back to Map on save
      entry.prices = new Map(Object.entries(entry.prices || {}));
    }

    // Write the value (delete if null/empty)
    const n = (price === null || price === '' || Number.isNaN(Number(price))) ? null : Number(price);
    if (n === null) {
      entry.prices.delete(String(plan));
    } else {
      entry.prices.set(String(plan), n);
    }

    // Tell Mongoose the nested array changed (belt-and-suspenders)
    prof.markModified('monthlyPrices');

    await prof.save();

    // Respond with a plain object of prices for the client
    const out = isMongooseMap(entry.prices)
      ? Object.fromEntries(entry.prices)
      : (entry.prices || {});

    res.json({ month, prices: out });
  } catch (err) {
    console.error('[prices:put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Inventory (QMI) for month from Community */
router.get('/community-competition-profiles/:communityId/qmi', async (req, res) => {
  try {
    const { communityId } = req.params;
    const month = parseMonth(req.query.month); // "YYYY-MM"
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findById(communityId).lean();
    if (!community) return res.json([]);

  // YM helpers reused by QMI/Sales
    const toYM = (val) => {
      if (!val) return null;
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) return val;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };
    const cmpYM = (a,b) => (a===b ? 0 : (a < b ? -1 : 1));

    let lots = Array.isArray(community.lots) ? community.lots.slice() : [];

    // Keep lots that are not yet sold AS OF the requested month,
    // and whose release month is <= requested month.
    if (month) {
      lots = lots.filter(l => {
        const releaseYM = toYM(l?.listDate || l?.releaseDate || l?.availableDate);
        if (!releaseYM) return false;                 // must have a release/list date to place on timeline
        if (cmpYM(releaseYM, month) === 1) return false; // released after this month

        const soldFlag = looksSold(l);
       
        // If sold, hide from sold month and later
        if (soldFlag) {
          const soldYM = toYM(l?.salesDate);
          if (!soldYM) return false; // flagged sold but no date — safest is to hide
          return cmpYM(soldYM, month) === 1; // still show ONLY if sold after this month
        }

        // not sold ⇒ show
        return true;
      });
    } else {
      // No month: require a release/list date AND not Sold/Closed
     // No month: require a release/list date AND not sold (status OR purchaser/date)
      lots = lots.filter(l => {
        const hasRelease = !!(l?.listDate || l?.releaseDate || l?.availableDate);
        return hasRelease && !looksSold(l);
      });
    }

    // Per-month exclusions
    if (month) {
      const prof = await CommunityCompetitionProfile.findOne({ community: communityId }).lean();
      const excluded = new Set((prof?.monthlyQmiExclusions?.[month] || []).map(String));
      lots = lots.filter(l => !excluded.has(String(l?._id)));
    }

    // Enrich floor plan names/numbers and backfill sqft from plan specs if needed
    const planIds = [...new Set(lots.map(l => l?.floorPlan).filter(Boolean).map(String))];
    let planById = {};
    if (planIds.length) {
      const plans = await FloorPlan.find({ _id: { $in: planIds } })
        .select('name planNumber specs.squareFeet').lean();
      planById = Object.fromEntries(plans.map(p => [String(p._id), p]));
    }

    const toNum = (v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const n = Number(String(v).replace(/[, $]/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const items = lots.map(l => {
      const fp = l?.floorPlan ? planById[String(l.floorPlan)] : null;
      const sqft =
        toNum(l?.sqft) ??
        toNum(l?.sqFt) ??
        toNum(l?.squareFeet) ??
        toNum(fp?.specs?.squareFeet) ??
        null;
      const listDate = l?.listDate || l?.releaseDate || l?.availableDate || null;
      const expectedCompletionDate =
        l?.expectedCompletionDate ||
        l?.expectedCompletion ||
        l?.projectedCompletionDate ||
        l?.estimatedCompletionDate ||
        l?.completionDate ||
        null;

      return {
        lotId:     l?._id || null,
        address:   l?.address || '',
        // Provide both: 'floorPlan' object (preferred by your table) and 'plan' fallback
        floorPlan: fp ? { _id: String(fp._id), name: fp.name || '', planNumber: fp.planNumber || '' } : undefined,
        plan:      l?.floorPlanName || l?.planName || (fp?.name || ''),
        sqft,
        listPrice: toNum(l?.listPrice),
        listDate,                                   // <-- table expects this name
        releaseDate: listDate,                      // (harmless alias if some code still reads releaseDate)
        status:    l?.generalStatus || l?.status || null,
        expectedCompletionDate
      };
    });

    res.json(items);
  } catch (err) {
    console.error('[qmi:get timeline]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// mark a lot as excluded for a month (optional UX)
router.put('/community-competition-profiles/:communityId/qmi', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month: rawMonth, excludeLotId } = req.body || {};
    const month = parseMonth(rawMonth);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
    if (!month || !excludeLotId) return res.status(400).json({ error: 'month and excludeLotId are required' });

    const prof = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $setOnInsert: { monthlyQmiExclusions: {} } },
      { new: true, upsert: true }
    );
    prof.monthlyQmiExclusions = prof.monthlyQmiExclusions || {};
    const list = new Set((prof.monthlyQmiExclusions[month] || []).map(String));
    list.add(String(excludeLotId));
    prof.monthlyQmiExclusions[month] = [...list];
    await prof.save();
    res.json({ ok: true, month, excluded: prof.monthlyQmiExclusions[month] });
  } catch (err) {
    console.error('[qmi:put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Sold homes for a month from Community */
router.get('/community-competition-profiles/:communityId/sales', async (req, res) => {
  try {
    const { communityId } = req.params;
    const month = parseMonth(req.query.month);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const community = await Community.findById(communityId).lean();
    if (!community) return res.json([]);

    const toYM = (val) => {
      if (!val) return null;
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) return val;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null
        : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };
    const lotsAll = Array.isArray(community.lots) ? community.lots : [];
    let lots = lotsAll.filter(l =>
      l?.generalStatus === 'Sold' || l?.generalStatus === 'Closed' || !!l?.purchaser || !!l?.salesDate
    );

    if (month) {
      lots = lots.filter(l => {
        const soldYM = toYM(l?.salesDate);
        return soldYM && soldYM === month; // only the month it was sold
      });
    }

    // Enrich plans
    const planIds = [...new Set(lots.map(l => l?.floorPlan).filter(Boolean).map(String))];
    let planById = {};
    if (planIds.length) {
      const plans = await FloorPlan.find({ _id: { $in: planIds } })
        .select('name planNumber specs.squareFeet').lean();
      planById = Object.fromEntries(plans.map(p => [String(p._id), p]));
    }

    const toNum = (v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const n = Number(String(v).replace(/[, $]/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const items = lots.map(l => {
      const fp = l?.floorPlan ? planById[String(l.floorPlan)] : null;
      const sqft =
        toNum(l?.sqft) ??
        toNum(l?.sqFt) ??
        toNum(l?.squareFeet) ??
        toNum(fp?.specs?.squareFeet) ??
        null;
      const listDate = l?.listDate || l?.releaseDate || l?.availableDate || null;

      return {
        address:   l?.address || '',
        floorPlan: fp ? { _id: String(fp._id), name: fp.name || '', planNumber: fp.planNumber || '' } : undefined,
        plan:      l?.floorPlanName || l?.planName || (fp?.name || ''),
        sqft,
        listDate,                                   // shown in the table
        listPrice: toNum(l?.listPrice),             // optional column in your table
        soldDate:  l?.salesDate || null,
        soldPrice: toNum(l?.salesPrice),
        status:    l?.generalStatus || l?.status || null
      };
    });

    res.json(items);
  } catch (err) {
    console.error('[sales:get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/** Sales summary (get + put) */
router.get('/community-competition-profiles/:communityId/sales-summary', async (req, res) => {
  try {
    const { communityId } = req.params;
    const month = parseMonth(req.query.month);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

    const profile = await CommunityCompetitionProfile.findOne({ community: communityId }).lean();
    if (profile?.monthlySalesSummary?.length && month) {
      const rec = profile.monthlySalesSummary.find(r => r?.month === month);
      return res.json({
        month,
        sales:   Number(rec?.sales   || 0),
        cancels: Number(rec?.cancels || 0),
        closings:Number(rec?.closings|| 0)
      });
    }

     // derive from community.lots if not present (use salesDate & looksSold)
      if (month) {
        const c = await Community.findById(communityId).lean();
        const lots = Array.isArray(c?.lots) ? c.lots : [];
        const count = lots.filter(l => {
          if (!looksSold(l)) return false;
          const ym = toYM(l?.salesDate);
          return ym === month;
        }).length;
        return res.json({ month, sales: count, cancels: 0, closings: count });
      }

    res.json({ month: null, sales: 0, cancels: 0, closings: 0 });
  } catch (err) {
    console.error('[sales-summary:get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.put('/community-competition-profiles/:communityId/sales-summary', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { month: rawMonth, sales, cancels, closings } = req.body || {};
    const month = parseMonth(rawMonth);
    if (!isId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
    if (!month) return res.status(400).json({ error: 'month is required' });

    const prof = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $setOnInsert: { monthlySalesSummary: [] } },
      { new: true, upsert: true }
    );

    prof.monthlySalesSummary = prof.monthlySalesSummary || [];
    let entry = prof.monthlySalesSummary.find(r => r.month === month);
    if (!entry) {
      entry = { month, sales: 0, cancels: 0, closings: 0 };
      prof.monthlySalesSummary.push(entry);
    }
    entry.sales    = Number(sales    ?? 0);
    entry.cancels  = Number(cancels  ?? 0);
    entry.closings = Number(closings ?? 0);

    await prof.save();
    res.json({ month, sales: entry.sales, cancels: entry.cancels, closings: entry.closings });
  } catch (err) {
    console.error('[sales-summary:put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
