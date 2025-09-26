// routes/communityCompetitionProfileRoutes.js (secured & tenant-scoped)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const Competition = require('../models/Competition');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const baseFilter = req => (isSuper(req) ? {} : { company: req.user.company });

const toArray = v => {
  if (Array.isArray(v)) return v.filter(Boolean).map(s => s.toString().trim()).filter(Boolean);
  if (typeof v === 'string') return v.split('\n').map(s => s.trim()).filter(Boolean);
  return [];
};

const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// parse close/release month → YYYYMM int (tolerant)
const ymStrToInt = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return y * 100 + m;
};
const dateLikeToYMInt = (s) => {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = t.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{1,2}$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Number(m[3]) * 100 + Math.min(12, Math.max(1, Number(m[1])));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear() * 100 + (d.getMonth() + 1);
};

// tenant guards for referenced parents
async function assertCommunityInTenant(req, communityId, fields='') {
  const filter = { _id: communityId, ...baseFilter(req) };
  const doc = await Community.findOne(filter).select(fields || '_id company').lean();
  if (!doc) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertCompetitionInTenant(req, competitionId, fields='') {
  const filter = { _id: competitionId, ...baseFilter(req) };
  const doc = await Competition.findOne(filter).select(fields || '_id').lean();
  if (!doc) {
    const err = new Error('Competition not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertPlansInTenant(req, planIds=[]) {
  if (!planIds.length) return;
  const filter = { _id: { $in: planIds }, ...baseFilter(req) };
  const found = await FloorPlan.countDocuments(filter);
  if (found !== planIds.length) {
    const err = new Error('One or more floor plans are not in your company');
    err.status = 400;
    throw err;
  }
}

// all routes require auth
router.use(ensureAuth);

/**
 * GET /api/community-competition-profiles/:communityId
 * Read profile (or default shape) — READONLY+
 */
router.get('/api/community-competition-profiles/:communityId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      await assertCommunityInTenant(req, communityId);

      let profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .populate([
          { path: 'topPlans.plan1', select: 'name planNumber specs.squareFeet' },
          { path: 'topPlans.plan2', select: 'name planNumber specs.squareFeet' },
          { path: 'topPlans.plan3', select: 'name planNumber specs.squareFeet' },
          { path: 'linkedCompetitions', select: 'communityName builderName city state' }
        ])
        .lean();

      if (!profile) {
        profile = {
          company: req.user.company, // helpful for the client
          community: communityId,
          promotion: '',
          prosCons: { pros: [], cons: [] },
          topPlans: { plan1: null, plan2: null, plan3: null }
        };
      }
      res.json(profile);
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/competitions/minimal
 * List competitors for link/unlink — READONLY+
 */
router.get('/api/competitions/minimal',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const comps = await Competition.find({ ...baseFilter(req) })
        .select('communityName builderName city state')
        .sort({ builderName: 1, communityName: 1 })
        .lean();
      res.json(comps);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST link one competitor
 */
router.post('/api/community-competition-profiles/:communityId/linked-competitions/:competitionId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      const community = await assertCommunityInTenant(req, communityId);
      await assertCompetitionInTenant(req, competitionId);

      const updated = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $addToSet: { linkedCompetitions: competitionId }, $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state');
      res.json({ linkedCompetitions: updated.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * DELETE unlink one competitor
 */
router.delete('/api/community-competition-profiles/:communityId/linked-competitions/:competitionId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      await assertCommunityInTenant(req, communityId);
      await assertCompetitionInTenant(req, competitionId);

      const updated = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: communityId, ...baseFilter(req) },
        { $pull: { linkedCompetitions: competitionId }, $setOnInsert: { company: req.user.company, community: communityId } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state');
      res.json({ linkedCompetitions: updated.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT bulk set linked competitors
 * Body: { competitionIds: ObjectId[] }
 */
router.put('/api/community-competition-profiles/:communityId/linked-competitions',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const ids = (req.body?.competitionIds || []).filter(isObjectId).map(id => new mongoose.Types.ObjectId(id));

      await assertCommunityInTenant(req, communityId);
      // verify all competitions are tenant-scoped
      if (ids.length) await assertPlansInTenant(req, []); // no-op here; left as pattern
      const compsCount = await Competition.countDocuments({ _id: { $in: ids }, ...baseFilter(req) });
      if (compsCount !== ids.length) return res.status(400).json({ error: 'One or more competitions are not in your company' });

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: communityId, ...baseFilter(req) },
        { $set: { linkedCompetitions: ids }, $setOnInsert: { company: req.user.company, community: communityId } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state');

      res.json({ linkedCompetitions: profile.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/prices?month=YYYY-MM
 */
router.get('/api/community-competition-profiles/:communityId/prices',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);
      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) }).lean();

      if (!profile || !Array.isArray(profile.monthlyPrices)) return res.json({ month, prices: {} });

      const entry = profile.monthlyPrices.find(mp => mp.month === month);
      const out = entry?.prices
        ? (entry.prices instanceof Map ? Object.fromEntries(entry.prices) : entry.prices)
        : {};
      res.json({ month, prices: out });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * PUT /api/community-competition-profiles/:communityId/prices
 * Body: { month, plan, price } OR { month, prices: { [planId]: price } }
 */
router.put('/api/community-competition-profiles/:communityId/prices',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, plan, price, prices } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      const community = await assertCommunityInTenant(req, communityId);

      // planId tenant guard (single or bulk)
      const planIds = plan ? [plan] : Object.keys(prices || {});
      if (planIds.length) await assertPlansInTenant(req, planIds);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
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

      const put = (pid, val) => {
        if (val == null || val === '') entry.prices.delete(String(pid));
        else {
          const n = Number(val);
          entry.prices.set(String(pid), Number.isFinite(n) ? n : 0);
        }
      };

      if (plan) put(plan, price);
      else if (prices && typeof prices === 'object') {
        for (const [pid, val] of Object.entries(prices)) put(pid, val);
      } else {
        return res.status(400).json({ error: 'Provide {plan, price} or {prices}' });
      }

      await doc.save();
      res.json({ month, prices: Object.fromEntries(entry.prices) });
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/qmi?month=YYYY-MM
 * Compute Quick-Move-In list for the month, honoring exclusions.
 */
router.get('/api/community-competition-profiles/:communityId/qmi',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('lots createdAt')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlyQMI')
        .lean();

      const excludedThisMonth = new Set(
        (profile?.monthlyQMI || []).find(m => m.month === month)?.excludedLots?.map(id => String(id)) || []
      );

      const selectedYM = ymStrToInt(month);
      const lots = Array.isArray(community.lots) ? community.lots : [];
      const candidates = [];
      const planIds = new Set();

      for (const l of lots) {
        if (!l || excludedThisMonth.has(String(l._id))) continue;

        const s = String(l.status || '').toLowerCase().trim();
        const ucOrFinished = (s.includes('under') && s.includes('construction')) || s.includes('finished');
        if (!ucOrFinished) continue;

        // not already sold/closed and no purchaser linked
        if (l.purchaser) continue;
        if (s === 'closed' || s === 'purchased' || s === 'sold') continue;

        // use releaseDate as the gate for month display
        const releaseYM = dateLikeToYMInt(l.releaseDate);
        if (releaseYM == null) continue;
        if (selectedYM != null && selectedYM < releaseYM) continue;

        candidates.push(l);
        if (l.floorPlan) planIds.add(String(l.floorPlan));
      }

      let planMap = {};
      if (planIds.size) {
        const plans = await FloorPlan.find({ _id: { $in: [...planIds] }, ...baseFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
        planMap = Object.fromEntries(
          plans.map(p => [String(p._id), {
            _id: p._id, name: p.name, planNumber: p.planNumber, sqft: p?.specs?.squareFeet ?? null
          }])
        );
      }

      const homes = candidates.map(l => ({
        lotId: l._id,
        address: l.address || l.streetAddress || '',
        listDate: l.listDate || l.releaseDate || null,
        floorPlan: l.floorPlan ? (planMap[String(l.floorPlan)] || null) : null,
        listPrice: l.listPrice ?? l.price ?? null,
        sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
        status: l.status || ''
      }));

      res.json({ month, homes });
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT /api/community-competition-profiles/:communityId/qmi
 * Body: { month, excludeLotId } OR { month, includeLotId }
 */
router.put('/api/community-competition-profiles/:communityId/qmi',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, excludeLotId, includeLotId } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });
      if (!excludeLotId && !includeLotId) return res.status(400).json({ error: 'Provide excludeLotId or includeLotId' });

      const community = await assertCommunityInTenant(req, communityId);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlyQMI)) doc.monthlyQMI = [];
      let entry = doc.monthlyQMI.find(m => m.month === month);
      if (!entry) {
        entry = { month, excludedLots: [] };
        doc.monthlyQMI.push(entry);
      }

      const toId = v => (isObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

      if (excludeLotId) {
        const id = toId(excludeLotId);
        if (id && !entry.excludedLots.some(x => x.equals(id))) entry.excludedLots.push(id);
      }
      if (includeLotId) {
        const id = toId(includeLotId);
        if (id) entry.excludedLots = entry.excludedLots.filter(x => !x.equals(id));
      }

      await doc.save();
      res.json({ month, excludedLots: entry.excludedLots.map(x => x.toString()) });
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/sales?month=YYYY-MM
 * Return sold/closed lots within that month
 */
router.get('/api/community-competition-profiles/:communityId/sales',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('lots createdAt')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const selectedYM = ymStrToInt(month);
      const soldStatuses = new Set(['closed', 'purchased', 'sold']);
      const results = [];
      const planIds = new Set();

      for (const l of (community.lots || [])) {
        const s = String(l?.status || '').toLowerCase().trim();
        const isSold = Boolean(l?.purchaser) || soldStatuses.has(s);
        if (!isSold) continue;

        const soldYM = (typeof l.closeMonth === 'string' ? ymStrToInt(l.closeMonth) : null) ?? dateLikeToYMInt(l.closeDateTime);
        if (soldYM == null) continue;
        if (selectedYM != null && soldYM !== selectedYM) continue;

        results.push(l);
        if (l.floorPlan) planIds.add(String(l.floorPlan));
      }

      let planMap = {};
      if (planIds.size) {
        const plans = await FloorPlan.find({ _id: { $in: [...planIds] }, ...baseFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
        planMap = Object.fromEntries(
          plans.map(p => [String(p._id), {
            _id: p._id, name: p.name, planNumber: p.planNumber, sqft: p?.specs?.squareFeet ?? null
          }])
        );
      }

      const sales = results.map(l => ({
        lotId: l._id,
        address: l.address || l.streetAddress || '',
        listDate: l.releaseDate || null,
        floorPlan: l.floorPlan ? (planMap[String(l.floorPlan)] || null) : null,
        listPrice: l.listPrice ?? null,
        sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
        status: l.status || '',
        soldDate: l.closeDateTime || l.closeMonth || null,
        soldPrice: l.salesPrice ?? null
      })).sort((a, b) => String(a.soldDate || '').localeCompare(String(b.soldDate || '')));

      res.json({ month, sales });
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/communities/:communityId/floorplans
 * Plans available to a community (tenant-scoped)
 */
router.get('/api/communities/:communityId/floorplans',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      await assertCommunityInTenant(req, communityId);

      // Prefer explicit relation on FloorPlan
      let plans = await FloorPlan.find({ communities: communityId, ...baseFilter(req) })
        .select('_id name planNumber specs.squareFeet specs.beds specs.baths specs.garage')
        .sort({ name: 1 })
        .lean();

      if (!plans.length) {
        const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
          .populate('lots.floorPlan', 'name planNumber specs.squareFeet specs.beds specs.baths specs.garage company')
          .lean();

        const uniq = new Map();
        for (const lot of (community?.lots || [])) {
          const fp = lot.floorPlan;
          if (fp && fp._id && (!fp.company || isSuper(req) || String(fp.company) === String(req.user.company))) {
            uniq.set(String(fp._id), fp);
          }
        }
        plans = [...uniq.values()].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      }

      res.json(plans);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * GET lot counts / stats — READONLY+
 */
router.get('/api/communities/:communityId/lot-count',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const comm = await Community.findOne({ _id: communityId, ...baseFilter(req) }).select('totalLots lots').lean();
      if (!comm) return res.status(404).json({ error: 'Community not found' });
      const totalLots = typeof comm.totalLots === 'number' ? comm.totalLots : (Array.isArray(comm.lots) ? comm.lots.length : 0);
      res.json({ totalLots });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/api/communities/:communityId/lot-stats',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('totalLots lots.purchaser lots')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const lots = Array.isArray(community.lots) ? community.lots : [];
      const total = typeof community.totalLots === 'number' ? community.totalLots : lots.length;
      const sold = lots.filter(l => !!l && !!l.purchaser).length;
      const remaining = Math.max(0, total - sold);

      res.json({ total, sold, remaining, quickMoveInLots: 0 });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * GET/PUT monthly sales summary — READONLY+/USER+
 */
router.get('/api/community-competition-profiles/:communityId/sales-summary',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlySalesSummary')
        .lean();

      const entry = (profile?.monthlySalesSummary || []).find(s => s.month === month);
      const out = entry ? { sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 }
                        : { sales: 0, cancels: 0, closings: 0 };
      res.json({ month, ...out });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/api/community-competition-profiles/:communityId/sales-summary',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, sales, cancels, closings } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      const community = await assertCommunityInTenant(req, communityId);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlySalesSummary)) doc.monthlySalesSummary = [];
      let entry = doc.monthlySalesSummary.find(s => s.month === month);
      if (!entry) {
        entry = { month, sales: 0, cancels: 0, closings: 0 };
        doc.monthlySalesSummary.push(entry);
      }

      const toInt = v => (v === '' || v == null ? null : Number(v));
      const S = toInt(sales), C = toInt(cancels), CL = toInt(closings);
      if (Number.isFinite(S)) entry.sales = S;
      if (Number.isFinite(C)) entry.cancels = C;
      if (Number.isFinite(CL)) entry.closings = CL;

      await doc.save();
      res.json({ month: entry.month, sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 });
    } catch (err) {
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT profile basics (promotion, pros/cons, topPlans)
 * Body: { promotion, prosCons: { pros, cons }, topPlans?: { plan1, plan2, plan3 } }
 */
router.put('/api/community-competition-profiles/:communityId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const community = await assertCommunityInTenant(req, communityId);

      const promotion = String(req.body?.promotion ?? '');
      const pros = toArray(req.body?.prosCons?.pros ?? []);
      const cons = toArray(req.body?.prosCons?.cons ?? []);
      const topPlansIn = req.body?.topPlans || {};

      // normalize top plan ids; ensure they belong to tenant
      const normalizeId = v => (v && typeof v === 'object' && v._id ? v._id : v);
      const planIds = ['plan1','plan2','plan3']
        .map(k => normalizeId(topPlansIn[k]))
        .filter(Boolean);

      await assertPlansInTenant(req, planIds);

      const update = {
        promotion,
        prosCons: { pros, cons },
        ...(req.body.topPlans ? {
          topPlans: {
            plan1: isObjectId(topPlansIn.plan1) ? topPlansIn.plan1 : null,
            plan2: isObjectId(topPlansIn.plan2) ? topPlansIn.plan2 : null,
            plan3: isObjectId(topPlansIn.plan3) ? topPlansIn.plan3 : null
          }
        } : {})
      };

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $set: update, $setOnInsert: { company: community.company, community: community._id } },
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
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

module.exports = router;
