/* routes/myCommunityCompetitionRoutes.js (tenant-scoped, role-gated, complete) */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const Community = require('../models/Community');
const Company = require('../models/Company');
const Competition = require('../models/Competition');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const FloorPlan = require('../models/FloorPlan');           // our plans
const FloorPlanComp = require('../models/floorPlanComp');   // competitor plans
const QuickMoveIn = require('../models/quickMoveIn');
const SalesRecord = require('../models/salesRecord');
const PriceRecord = require('../models/PriceRecord');

// ───────────────────────── helpers ─────────────────────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const baseFilter = req => (isSuper(req) ? {} : { company: req.user.company });
const READ_ROLES = ['READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const WRITE_ROLES = ['USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];

const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const toArray = v => (Array.isArray(v) ? v : (typeof v === 'string' ? v.split('\n') : []))
  .map(s => String(s).trim()).filter(Boolean);

const strOrEmpty = v => (v == null ? '' : String(v).trim());
const numOrNull = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normalizeAmenities = (input) => {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const entry of input) {
    const category = strOrEmpty(entry?.category);
    const rawItems = Array.isArray(entry?.items) ? entry.items : [];
    const items = [...new Set(rawItems.map(item => strOrEmpty(item)).filter(Boolean))];
    if (!category || !items.length) continue;
    out.push({ category, items });
  }
  return out;
};

// YM helpers for QMI/sales logic
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

// tenant guards
async function assertCommunity(req, id, selectFields = '') {
  const base = ['_id', 'company'];
  const extra = String(selectFields || '').trim();
  const sel = (extra ? base.concat(extra.split(/\s+/)) : base).join(' ');
  const doc = await Community.findOne({ _id: id, ...baseFilter(req) })
    .select(sel)
    .lean();
  if (!doc) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertCompetition(req, id) {
  const doc = await Competition.findOne({ _id: id, ...baseFilter(req) }).select('_id company').lean();
  if (!doc) {
    const err = new Error('Competition not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertFloorPlanComp(req, id) {
  const doc = await FloorPlanComp.findOne({ _id: id, ...baseFilter(req) }).select('_id competition').lean();
  if (!doc) {
    const err = new Error('FloorPlanComp not found');
    err.status = 404;
    throw err;
  }
  return doc;
}

// all routes require auth
router.use(ensureAuth);

// ───────────────────────── Profile ─────────────────────────

/** GET my profile for a community (create if missing) */
router.get('/my-community-competition/:communityId',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      const community = await assertCommunity(req, communityId, 'company name communityName builder builderName city state address zip totalLots lots communityAmenities hoaFee hoaFrequency tax schoolISD elementarySchool middleSchool highSchool');

      let profile = await CommunityCompetitionProfile.findOne({ community: community._id, ...baseFilter(req) })
        .populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal')
        .populate('topPlans.plan1', 'name planNumber specs.squareFeet')
        .populate('topPlans.plan2', 'name planNumber specs.squareFeet')
        .populate('topPlans.plan3', 'name planNumber specs.squareFeet')
        .lean();

      if (!profile) {
        profile = await CommunityCompetitionProfile.create({
          company: community.company,
          community: community._id,
          promotion: '',
          prosCons: { pros: [], cons: [] },
          topPlans: { plan1: null, plan2: null, plan3: null },
          notes: '',
          linkedCompetitions: []
        });
        profile = await CommunityCompetitionProfile.findById(profile._id)
          .populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal')
          .lean();
      }

      const lots = Array.isArray(community.lots) ? community.lots : [];
      const totalLots = Number.isFinite(community.totalLots) ? community.totalLots : lots.length;
      const soldLots = lots.filter(l => l && (l.purchaser || String(l.status || '').toLowerCase().includes('sold'))).length;
      const quickMoveInLots = lots.filter(l => String(l.generalStatus || '').toLowerCase().includes('spec')).length;
      const remainingLots = Math.max(0, totalLots - soldLots);

      profile = profile ? { ...profile } : {};

      let companyName = '';
      const companyRef = community?.company;
      if (companyRef && typeof companyRef === 'object' && companyRef.name) {
        companyName = companyRef.name;
      } else if (companyRef) {
        const companyId = typeof companyRef === 'object' && companyRef._id ? companyRef._id : companyRef;
        const companyDoc = await Company.findById(companyId).select('name').lean();
        if (companyDoc?.name) companyName = companyDoc.name;
      }

      profile.lotCounts = {
        total: totalLots,
        sold: soldLots,
        remaining: remainingLots,
        quickMoveInLots
      };

      const { lots: _lots, ...communityPayload } = community;
      communityPayload.companyName = companyName || '';

      res.json({ community: communityPayload, profile });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/** PUT profile (promotion, pros/cons, notes, topPlans) */
router.put('/my-community-competition/:communityId',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      // ⬇️ Add this (we need company + ids for upsert/scoping)
      const community = await assertCommunity(req, communityId); 

      const body = req.body || {};
      const feeTypesRaw = Array.isArray(body.feeTypes) ? body.feeTypes : [];
      const normalizedFees = feeTypesRaw
        .map(v => String(v).trim())
        .filter(v => ['MUD','PID','None'].includes(v));
      const rawGarage = String(body.garageType ?? '').trim();
      const garageType = rawGarage === 'Front' || rawGarage === 'Rear' ? rawGarage : undefined;

      const update = {
        promotion: strOrEmpty(body.promotion),
        notes: strOrEmpty(body.notes),
        salesPerson: strOrEmpty(body.salesPerson),
        salesPersonPhone: strOrEmpty(body.salesPersonPhone),
        salesPersonEmail: strOrEmpty(body.salesPersonEmail),
        address: strOrEmpty(body.address),
        city: strOrEmpty(body.city),
        zip: strOrEmpty(body.zip),
        modelPlan: strOrEmpty(body.modelPlan),
        lotSize: strOrEmpty(body.lotSize),
        garageType,
        // ⬇️ Schools (these were fine, they just weren't making it to the doc due to scoping)
        schoolISD: strOrEmpty(body.schoolISD),
        elementarySchool: strOrEmpty(body.elementarySchool),
        middleSchool: strOrEmpty(body.middleSchool),
        highSchool: strOrEmpty(body.highSchool),
        hoaFee: numOrNull(body.hoaFee),
        hoaFrequency: strOrEmpty(body.hoaFrequency),
        tax: numOrNull(body.tax),
        feeTypes: normalizedFees,
        mudFee: normalizedFees.includes('MUD') ? numOrNull(body.mudFee) : null,
        pidFee: normalizedFees.includes('PID') ? numOrNull(body.pidFee) : null,
        pidFeeFrequency: normalizedFees.includes('PID') ? strOrEmpty(body.pidFeeFrequency) : '',
        earnestAmount: numOrNull(body.earnestAmount),
        realtorCommission: numOrNull(body.realtorCommission),
        prosCons: {
          pros: toArray(body?.prosCons?.pros),
          cons: toArray(body?.prosCons?.cons),
        }
      };

      if (!normalizedFees.includes('MUD') && normalizedFees.includes('None')) update.mudFee = null;
      if (!normalizedFees.includes('PID') && normalizedFees.includes('None')) {
        update.pidFee = null;
        update.pidFeeFrequency = '';
      }

      // optional topPlans (validate IDs if provided)
      const tp = body.topPlans || {};
      const planIds = ['plan1','plan2','plan3']
        .map(k => tp[k])
        .filter(isObjectId);

      if (planIds.length) {
        // ensure these are OUR FloorPlan (not competitor) and in tenant
        const plansCount = await FloorPlan.countDocuments({ _id: { $in: planIds }, ...baseFilter(req) });
        if (plansCount !== planIds.length) {
          return res.status(400).json({ error: 'One or more top plans are not in your company' });
        }
        update.topPlans = {
          plan1: isObjectId(tp.plan1) ? tp.plan1 : null,
          plan2: isObjectId(tp.plan2) ? tp.plan2 : null,
          plan3: isObjectId(tp.plan3) ? tp.plan3 : null,
        };
      }

  const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },               // ⬅️ use community
        { $set: { ...update, company: community.company } },            // ⬅️ set company on upsert
        { new: true, upsert: true }
      )
        .populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal')
        .populate('topPlans.plan1', 'name planNumber specs.squareFeet')
        .populate('topPlans.plan2', 'name planNumber specs.squareFeet')
        .populate('topPlans.plan3', 'name planNumber specs.squareFeet')
        .lean();

      res.json(profile);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

// ───────────────────────── Linked Competitions ─────────────────────────

/** GET minimal competitions for tenant (picker) */
router.get('/my-community-competition/:communityId/competitions/minimal',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      await assertCommunity(req, communityId);
      const comps = await Competition.find({ ...baseFilter(req) })
        .select('communityName builderName city state market communityRef isInternal')
        .sort({ builderName: 1, communityName: 1 })
        .lean();
      res.json(comps);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/** PUT bulk set linked competitions */
router.put('/my-community-competition/:communityId/linked-competitions',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const ids = (req.body?.competitionIds || []).filter(isObjectId);
      if (ids.length) {
        const cnt = await Competition.countDocuments({ _id: { $in: ids }, ...baseFilter(req) });
        if (cnt !== ids.length) return res.status(400).json({ error: 'One or more competitions are not in your company' });
      }

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $set: { linkedCompetitions: ids, company: community.company } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');

      res.json({ linkedCompetitions: profile.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/** POST link single competition */
router.post('/my-community-competition/:communityId/linked-competitions/:competitionId',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      await assertCompetition(req, competitionId);

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $addToSet: { linkedCompetitions: competitionId }, $setOnInsert: { company: community.company } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');

      res.json({ linkedCompetitions: profile.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/** DELETE unlink single competition */
router.delete('/my-community-competition/:communityId/linked-competitions/:competitionId',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      await assertCommunity(req, communityId);
      await assertCompetition(req, competitionId);

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: communityId, ...baseFilter(req) },
        { $pull: { linkedCompetitions: competitionId } },
        { new: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');

      res.json({ linkedCompetitions: profile?.linkedCompetitions || [] });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

// ───────────────────────── Month Data: Prices / QMI / Sales Summary ─────────────────────────

/** GET base prices for all linked competitions for a month */
router.get('/my-community-competition/:communityId/base-prices',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunity(req, communityId);
      const prof = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('linkedCompetitions')
        .lean();

      const compIds = (prof?.linkedCompetitions || []).map(String);
      if (!compIds.length) return res.json({ month, data: [] });

      // pull price records for each competition
      const recs = await PriceRecord.find({
        ...baseFilter(req),
        competition: { $in: compIds },
        month
      }).populate('floorPlan', 'name sqft bed bath storyType competition').lean();

      // group by competition
      const byComp = new Map();
      for (const r of recs) {
        const key = String(r.competition);
        if (!byComp.has(key)) byComp.set(key, []);
        byComp.get(key).push({
          floorPlanId: String(r.floorPlan?._id || r.floorPlan),
          name: r.floorPlan?.name || '',
          sqft: r.floorPlan?.sqft ?? null,
          bed:  r.floorPlan?.bed ?? null,
          bath: r.floorPlan?.bath ?? null,
          storyType: r.floorPlan?.storyType || null,
          price: r.price
        });
      }

      // add comp labels
      const comps = await Competition.find({ _id: { $in: compIds }, ...baseFilter(req) })
        .select('communityName builderName city state market communityRef isInternal')
        .lean();
      const compMeta = Object.fromEntries(comps.map(c => [String(c._id), c]));

      const data = [...byComp.entries()].map(([id, plans]) => ({
        competitionId: id,
        competition: compMeta[id] || null,
        plans
      }));

      res.json({ month, data });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/** GET QMI (homes) scatter data for linked competitions in a month */
router.get('/my-community-competition/:communityId/scatter',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunity(req, communityId);
      const prof = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('linkedCompetitions')
        .lean();
      const compIds = (prof?.linkedCompetitions || []).map(String);
      if (!compIds.length) return res.json({ month, points: [] });

      const qmi = await QuickMoveIn.find({
        ...baseFilter(req),
        competition: { $in: compIds },
        month
      }).select('competition sqft listPrice address floorPlan').lean();

      const comps = await Competition.find({ _id: { $in: compIds }, ...baseFilter(req) })
        .select('communityName builderName')
        .lean();
      const compMeta = Object.fromEntries(comps.map(c => [String(c._id), c]));

      const plans = await FloorPlanComp.find({ competition: { $in: compIds }, ...baseFilter(req) })
        .select('name sqft');
      const planMeta = Object.fromEntries(plans.map(p => [String(p._id), { name: p.name, sqft: p.sqft }]));

      const points = qmi.map(h => ({
        competitionId: String(h.competition),
        competition: compMeta[String(h.competition)] || null,
        sqft: h.sqft ?? (planMeta[String(h.floorPlan)]?.sqft ?? null),
        price: h.listPrice ?? null,
        address: h.address || '',
        floorPlanId: String(h.floorPlan || ''),
        floorPlanName: planMeta[String(h.floorPlan)]?.name || ''
      })).filter(p => Number.isFinite(Number(p.sqft)) && Number.isFinite(Number(p.price)));

      res.json({ month, points });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/** GET rolling sales series for THIS community’s profile (not comps) */
router.get('/my-community-competition/:communityId/sales-series',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const months = Math.max(1, Math.min(36, Number(req.query.months) || 12));
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      await assertCommunity(req, communityId);

      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlySalesSummary')
        .lean();

      if (!profile) return res.json({ labels: [], series: { sales: [], cancels: [], net: [], closings: [] } });

      const byMonth = new Map();
      for (const m of (profile.monthlySalesSummary || [])) {
        byMonth.set(m.month, { sales: +m.sales || 0, cancels: +m.cancels || 0, closings: +m.closings || 0 });
      }

      const fmtKey = (yr, mIdx) => `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
      const human  = (yr, mIdx) => new Date(yr, mIdx, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });

      const end = new Date(); let y = end.getFullYear(), m = end.getMonth();
      const buf = [];
      for (let i = 0; i < months; i++) {
        const key = fmtKey(y, m);
        const rec = byMonth.get(key) || { sales: 0, cancels: 0, closings: 0 };
        buf.push({ label: human(y, m), sales: rec.sales, cancels: rec.cancels, net: rec.sales - rec.cancels, closings: rec.closings });
        m -= 1; if (m < 0) { m = 11; y -= 1; }
      }
      buf.reverse();

      res.json({
        labels: buf.map(b => b.label),
        series: {
          sales:    buf.map(b => b.sales),
          cancels:  buf.map(b => b.cancels),
          net:      buf.map(b => b.net),
          closings: buf.map(b => b.closings),
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/** GET aggregate sales totals across LINKED competitions (month range) */
router.get('/my-community-competition/:communityId/multi-sales-totals',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { start, end } = req.query;  // YYYY-MM inclusive range
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(start) || !isYYYYMM(end)) return res.status(400).json({ error: 'start and end must be YYYY-MM' });

      await assertCommunity(req, communityId);
      const prof = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('linkedCompetitions')
        .lean();
      const compIds = (prof?.linkedCompetitions || []).map(String);
      if (!compIds.length) return res.json({ start, end, totals: [] });

      const recs = await SalesRecord.find({
        ...baseFilter(req),
        competition: { $in: compIds },
        month: { $gte: start, $lte: end }
      }).select('competition month sales cancels closings').lean();

      const byComp = new Map();
      for (const r of recs) {
        const key = String(r.competition);
        if (!byComp.has(key)) byComp.set(key, { sales: 0, cancels: 0, closings: 0 });
        const agg = byComp.get(key);
        agg.sales += +r.sales || 0;
        agg.cancels += +r.cancels || 0;
        agg.closings += +r.closings || 0;
      }

      const comps = await Competition.find({ _id: { $in: compIds }, ...baseFilter(req) })
        .select('communityName builderName city state market communityRef isInternal')
        .lean();
      const compMeta = Object.fromEntries(comps.map(c => [String(c._id), c]));

      const totals = [...byComp.entries()].map(([id, m]) => ({
        competitionId: id,
        competition: compMeta[id] || null,
        ...m,
        net: m.sales - m.cancels
      }));

      res.json({ start, end, totals });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ───────────────────────── Sales Summary (profile-level) ─────────────────────────

/** GET monthly sales summary (profile) */
router.get('/my-community-competition/:communityId/sales-summary',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunity(req, communityId);
      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlySalesSummary')
        .lean();

      const entry = (profile?.monthlySalesSummary || []).find(s => s.month === month);
      const out = entry ? { sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 }
                        : { sales: 0, cancels: 0, closings: 0 };
      res.json({ month, ...out });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/** PUT monthly sales summary (profile) */
router.put('/my-community-competition/:communityId/sales-summary',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, sales, cancels, closings } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      const community = await assertCommunity(req, communityId);
      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlySalesSummary)) doc.monthlySalesSummary = [];
      let entry = doc.monthlySalesSummary.find(s => s.month === month);
      if (!entry) { entry = { month, sales: 0, cancels: 0, closings: 0 }; doc.monthlySalesSummary.push(entry); }

      const toInt = v => (v === '' || v == null ? null : Number(v));
      const S = toInt(sales), C = toInt(cancels), CL = toInt(closings);
      if (Number.isFinite(S)) entry.sales = S;
      if (Number.isFinite(C)) entry.cancels = C;
      if (Number.isFinite(CL)) entry.closings = CL;

      await doc.save();
      res.json({ month: entry.month, sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

router.put('/my-community-competition/:communityId/amenities',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      const community = await assertCommunity(req, communityId);
      const amenities = normalizeAmenities(req.body?.communityAmenities);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        {
          $set: { communityAmenities: amenities },
          $setOnInsert: { company: community.company, community: community._id }
        },
        { new: true, upsert: true }
      ).select('communityAmenities').lean();

      res.json({ communityAmenities: doc?.communityAmenities || [] });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

module.exports = router;
