// routes/competitionRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const ensureAuth = require('../middleware/ensureAuth');

const Competition = require('../models/Competition');
const Community = require('../models/Community');
const SalesRecord = require('../models/salesRecord');
const PriceRecord = require('../models/PriceRecord');
const { sanitizeSyncFields } = require('../config/competitionSync');
const { buildSyncUpdate } = require('../services/competitionSync');

let FloorPlanComp;
try { FloorPlanComp = require('../models/floorPlanComp'); } catch { /* optional */ }

const router = express.Router();
router.use(ensureAuth);

// ───────────────────────────── helpers ─────────────────────────────
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const toNumOrNull = v => (v === '' || v == null ? null : Number(v));
const clean = v => (v === '' ? undefined : v); // avoid saving empty-string enums

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
};

const isSuperAdmin = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const tenantFilter = (req) => {
  if (isSuperAdmin(req)) return {};
  const c = req.user?.company;
  if (!c) throw new Error('Missing company on user; cannot scope tenant queries');
  return { company: c };
};

// Attach a param guard for :id
router.param('id', (req, res, next, id) => {
  if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
  next();
});

// ───────────────────── list / minimal / get ───────────────────────

// GET /api/competitions?limit=25&page=1&sort=builderName,-communityName&fields=communityName,builderName,city
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
  const page  = Math.max(Number(req.query.page) || 1, 1);
  const skip  = (page - 1) * limit;

  // simple search: q matches builder/community/city/state
  const q = String(req.query.q || '').trim();
  const filter = q
    ? {
        $or: [
          { communityName: { $regex: q, $options: 'i' } },
          { builderName:   { $regex: q, $options: 'i' } },
          { city:          { $regex: q, $options: 'i' } },
          { state:         { $regex: q, $options: 'i' } },
        ]
      }
    : {};
  Object.assign(filter, tenantFilter(req));

  // fields (projection)
  const fields = String(req.query.fields || '').trim(); // comma-separated

  // sort
  const sortStr = String(req.query.sort || 'builderName,communityName').replace(/\s+/g, '');
  const sort = Object.fromEntries(
    sortStr.split(',').filter(Boolean).map(s => [s.replace(/^-/, ''), s.startsWith('-') ? -1 : 1])
  );

  const [items, total] = await Promise.all([
    Competition.find(filter)
      .select(fields ? fields.split(',').join(' ') : undefined)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Competition.countDocuments(filter)
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  });
}));

// GET /api/competitions/minimal
router.get('/minimal', asyncHandler(async (req, res) => {
  const comps = await Competition.find(tenantFilter(req))
    .select('communityName builderName city state')
    .sort({ builderName: 1, communityName: 1 })
    .lean();

  res.json(comps.map(c => ({
    id: c._id,
    label: [c.builderName, c.communityName].filter(Boolean).join(' - ')
  })));
}));
// GET /api/competitions/:id/monthly?month=YYYY-MM
router.get('/:id/monthly', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { month } = req.query || {};
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' });
  }

  const _id = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

  // try WITH tenant filter
  const filter = { _id, ...tenantFilter(req) };
  const doc = await Competition.findOne(filter, { monthlyMetrics: 1, company: 1 }).lean();

  if (!doc) {
    // check if it exists WITHOUT tenant to detect mismatch clearly
    const anyDoc = await Competition.findOne({ _id }, { company: 1 }).lean();
    if (anyDoc) {
      // ← this is the culprit after you added users/tenant scoping
      return res.status(403).json({ error: 'Wrong tenant/company for this competition' });
    }
    return res.status(404).json({ error: 'Competition not found' });
  }

  const hit = (doc.monthlyMetrics || []).find(m => m?.month === month);
  res.json(hit || { month, soldLots: null, quickMoveInLots: null });
}));
// GET /api/competitions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const comp = await Competition.findOne(filter).lean();
  if (!comp) return res.status(404).json({ error: 'Not found' });
  res.json(comp);
}));

// ──────────────────── create / update / delete ────────────────────

const ALLOWED_FIELDS = [
  'communityName','builderName','address','city','state','zip','market',
  'salesPerson','salesPersonPhone','salesPersonEmail',
  'lotSize','modelPlan','garageType',
  'schoolISD','elementarySchool','middleSchool','highSchool',
  'totalLots','hoaFee','hoaFrequency','tax',
  'feeTypes','mudFee','pidFee','pidFeeFrequency',
  'promotion','topPlan1','topPlan2','topPlan3','pros','cons',
  'communityAmenities',
  'communityRef','isInternal','syncFields'
];

// Normalizers shared by POST/PUT/PATCH
function normalizeBody(raw) {
  const body = { ...raw };

  // trim core strings
  [
    'communityName','builderName','address','city','state','zip','market',
    'modelPlan','lotSize','salesPerson','salesPersonPhone','salesPersonEmail',
    'schoolISD','elementarySchool','middleSchool','highSchool',
    'promotion','topPlan1','topPlan2','topPlan3','pros','cons'
  ].forEach(key => {
    if (body[key] !== undefined && body[key] !== null) {
      body[key] = String(body[key]).trim();
      if (!body[key]) delete body[key];
    }
  });

  // numbers
  if ('totalLots' in body) body.totalLots = toNumOrNull(body.totalLots);
  if ('hoaFee'    in body) body.hoaFee    = toNumOrNull(body.hoaFee);
  if ('pidFee'    in body) body.pidFee    = toNumOrNull(body.pidFee);
  if ('tax'       in body) body.tax       = toNumOrNull(body.tax);
  if ('mudFee'    in body) body.mudFee    = toNumOrNull(body.mudFee);

  // enums: empty string → undefined
  if ('hoaFrequency'    in body) body.hoaFrequency    = clean(body.hoaFrequency);
  if ('pidFeeFrequency' in body) body.pidFeeFrequency = clean(body.pidFeeFrequency);

  // feeTypes
  if ('feeTypes' in body) {
    const arr = Array.isArray(body.feeTypes) ? body.feeTypes : [body.feeTypes].filter(Boolean);
    const ALLOWED_FEE_TYPES = ['MUD','PID','None'];
    body.feeTypes = arr.filter(v => ALLOWED_FEE_TYPES.includes(v));
  }

  // garageType
  if ('garageType' in body) {
    const gt = String(body.garageType ?? '').toLowerCase();
    body.garageType = gt === 'rear' ? 'Rear' : gt === 'front' ? 'Front' : null;
  }

  if ('isInternal' in body) {
    const raw = body.isInternal;
    if (typeof raw === 'string') {
      const lowered = raw.trim().toLowerCase();
      body.isInternal = ['1','true','yes','on'].includes(lowered);
    } else {
      body.isInternal = Boolean(raw);
    }
  }

  if ('communityRef' in body) {
    const ref = body.communityRef;
    body.communityRef = ref ? String(ref).trim() : null;
  }

  if ('syncFields' in body) {
    body.syncFields = sanitizeSyncFields(body.syncFields, { fallbackToDefault: false });
  }

  return body;
}

// POST /api/competitions
router.post('/', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const filterCompany = tenantFilter(req);
  let linkedCommunity = null;

  if (body.communityRef) {
    if (!isObjectId(body.communityRef)) {
      return res.status(400).json({ error: 'Invalid communityRef' });
    }
    const communityQuery = { _id: body.communityRef };
    if (!isSuperAdmin(req)) communityQuery.company = filterCompany.company;
    linkedCommunity = await Community.findOne(communityQuery).lean();
    if (!linkedCommunity) {
      return res.status(404).json({ error: 'Linked community not found' });
    }
  }

  if (body.isInternal) {
    if (!linkedCommunity) {
      return res.status(400).json({ error: 'Internal competitions require a linked community' });
    }
    const sanitizedFields = sanitizeSyncFields(body.syncFields, { fallbackToDefault: true });
    const { update, fields } = buildSyncUpdate(linkedCommunity, sanitizedFields);
    body.syncFields = fields;
    Object.assign(body, update);
    body.communityRef = linkedCommunity._id;
    body.company = linkedCommunity.company;
  } else {
    if (linkedCommunity) {
      body.communityRef = linkedCommunity._id;
      if (!body.company) {
        body.company = linkedCommunity.company;
      }
    }
  }

  if (!body.company) {
    if (isSuperAdmin(req) && req.body?.company && isObjectId(req.body.company)) {
      body.company = req.body.company;
    } else {
      body.company = filterCompany.company || null;
    }
  }
  if (!body.company) {
    return res.status(400).json({ error: 'Company context required' });
  }

  const required = ['communityName','builderName','address','city','state','zip'];
  for (const key of required) {
    const value = body[key];
    if (!value || !String(value).trim()) {
      return res.status(400).json({ error: `${key} is required` });
    }
  }

  if (!body.isInternal && body.syncFields !== undefined) {
    body.syncFields = sanitizeSyncFields(body.syncFields, { fallbackToDefault: false });
  }

  const comp = await Competition.create(body);
  res.status(201).json(comp);
}));

async function saveCompetitionUpdate(req, filter, updates) {
  const current = await Competition.findOne(filter).lean();
  if (!current) return { code: 404 };

  const next = { ...updates };
  const tenantCompany = tenantFilter(req).company || null;
  const targetIsInternal = Object.prototype.hasOwnProperty.call(next, 'isInternal')
    ? next.isInternal
    : current.isInternal;
  let targetCommunityRef = Object.prototype.hasOwnProperty.call(next, 'communityRef')
    ? next.communityRef
    : current.communityRef;
  let targetSyncFields = Object.prototype.hasOwnProperty.call(next, 'syncFields')
    ? next.syncFields
    : current.syncFields;

  let linkedCommunity = null;
  const companyHint = current.company || tenantCompany || req.user?.company || null;

  const findCommunity = async (ref) => {
    if (!ref) return null;
    if (!isObjectId(ref)) return { code: 400, error: 'Invalid communityRef' };
    const query = { _id: ref };
    if (!isSuperAdmin(req)) query.company = companyHint;
    const community = await Community.findOne(query).lean();
    if (!community) return { code: 404, error: 'Linked community not found' };
    return community;
  };

  if (targetIsInternal) {
    if (!targetCommunityRef) targetCommunityRef = current.communityRef;
    const lookup = await findCommunity(targetCommunityRef);
    if (lookup && lookup.code) return lookup;
    linkedCommunity = lookup;
    if (!linkedCommunity) {
      return { code: 400, error: 'Internal competitions require a linked community' };
    }
    const sanitizedFields = sanitizeSyncFields(targetSyncFields, { fallbackToDefault: true });
    const { update, fields } = buildSyncUpdate(linkedCommunity, sanitizedFields);
    next.syncFields = fields;
    next.communityRef = linkedCommunity._id;
    Object.assign(next, update);
    next.isInternal = true;
    next.company = linkedCommunity.company;
  } else {
    if (Object.prototype.hasOwnProperty.call(next, 'syncFields')) {
      next.syncFields = sanitizeSyncFields(next.syncFields, { fallbackToDefault: false });
    }
    if (Object.prototype.hasOwnProperty.call(next, 'isInternal')) {
      next.isInternal = false;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'communityRef')) {
      if (next.communityRef) {
        const lookup = await findCommunity(next.communityRef);
        if (lookup && lookup.code) return lookup;
        if (lookup) next.communityRef = lookup._id;
      } else {
        next.communityRef = null;
      }
    }
  }

  const updated = await Competition.findOneAndUpdate(
    filter,
    { $set: next },
    { new: true, runValidators: true }
  ).lean();

  return { code: updated ? 200 : 404, doc: updated };
}

// PUT /api/competitions/:id (full update)
router.put('/:id', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const result = await saveCompetitionUpdate(req, filter, body);
  if (result.code !== 200) {
    return res.status(result.code).json({ error: result.error || 'Not found' });
  }

  res.json(result.doc);
}));

// PATCH /api/competitions/:id (partial update)
router.patch('/:id', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const result = await saveCompetitionUpdate(req, filter, body);
  if (result.code !== 200) {
    return res.status(result.code).json({ error: result.error || 'Not found' });
  }

  res.json(result.doc);
}));

// keep your dedicated helpers as targeted endpoints (clear intent)
router.put('/:id/amenities', asyncHandler(async (req, res) => {
  const raw = req.body?.communityAmenities;

  // normalize into the expected shape: [{ category, items:[] }]
  const groups = Array.isArray(raw) ? raw : [];
  const safeGroups = groups.map(g => ({
    category: String(g?.category ?? ''),
    items: Array.isArray(g?.items) ? g.items.map(String).filter(Boolean) : []
  }));

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const result = await Competition.updateOne(filter, { $set: { communityAmenities: safeGroups } });

  if (result.matchedCount === 0) return res.status(404).json({ ok:false, error: 'Not found for this tenant/user' });
  return res.json({ ok:true, count: safeGroups.length });
}));

router.put('/:id/metrics', asyncHandler(async (req, res) => {
  const {
    promotion, topPlan1, topPlan2, topPlan3, pros, cons,
    totalLots, hoaFee, hoaFrequency, pidFee, pidFeeFrequency
  } = req.body;

  const $set = {
    ...(promotion   !== undefined ? { promotion } : {}),
    ...(topPlan1    !== undefined ? { topPlan1 }  : {}),
    ...(topPlan2    !== undefined ? { topPlan2 }  : {}),
    ...(topPlan3    !== undefined ? { topPlan3 }  : {}),
    ...(pros        !== undefined ? { pros }      : {}),
    ...(cons        !== undefined ? { cons }      : {}),
    ...(totalLots   !== undefined ? { totalLots: toNumOrNull(totalLots) } : {}),
    ...(hoaFee      !== undefined ? { hoaFee:    toNumOrNull(hoaFee)    } : {}),
    ...(hoaFrequency     !== undefined ? { hoaFrequency:    clean(hoaFrequency)    } : {}),
    ...(pidFee      !== undefined ? { pidFee:    toNumOrNull(pidFee)    } : {}),
    ...(pidFeeFrequency  !== undefined ? { pidFeeFrequency: clean(pidFeeFrequency) } : {}),
  };
  Object.keys($set).forEach(k => $set[k] === undefined && delete $set[k]);

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const updated = await Competition.findOneAndUpdate(
    filter,
    { $set },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}));

// DELETE /api/competitions/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const deleted = await Competition.findOneAndDelete({ _id: req.params.id, ...tenantFilter(req) });
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
}));

// ───────────────────── monthly metrics ────────────────────────────

// PUT /api/competitions/:id/monthly-metrics  (atomic upsert)
router.put('/:id/monthly-metrics', asyncHandler(async (req, res) => {
  let { month, soldLots, quickMoveInLots } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' });
  }

  if (soldLots        !== undefined) soldLots        = toNumOrNull(soldLots);
  if (quickMoveInLots !== undefined) quickMoveInLots = toNumOrNull(quickMoveInLots);

  const upd = await Competition.updateOne(
    { _id: req.params.id, 'monthlyMetrics.month': month, ...tenantFilter(req) },
    {
      $set: {
        ...(soldLots        !== undefined ? { 'monthlyMetrics.$.soldLots': soldLots } : {}),
        ...(quickMoveInLots !== undefined ? { 'monthlyMetrics.$.quickMoveInLots': quickMoveInLots } : {}),
      }
    },
    { runValidators: true }
  );

  if (upd.matchedCount === 0) {
    await Competition.updateOne(
      { _id: req.params.id, ...tenantFilter(req) },
      {
        $push: {
          monthlyMetrics: {
            month,
            ...(soldLots        !== undefined ? { soldLots }        : {}),
            ...(quickMoveInLots !== undefined ? { quickMoveInLots } : {}),
          }
        }
      },
      { runValidators: true }
    );
  }
  res.json({ ok: true });
}));



// ───────────────────────── analytics ──────────────────────────────

// GET /api/competitions/:id/sales?year=YYYY
router.get('/:id/sales', asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const exists = await Competition.exists(filter);
  if (!exists) return res.status(404).json({ error: 'Not found' });
  const { id } = req.params;
  const year = Number(req.query.year) || new Date().getFullYear();

  const recs = await SalesRecord.find({
    competition: id,
    month: { $regex: `^${year}-` }
  }).sort({ month: 1 }).lean();

  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const key = `${year}-${mm}`;
    const hit = recs.find(r => r.month === key);
    return {
      month: key,
      sales:    hit?.sales    ?? 0,
      cancels:  hit?.cancels  ?? 0,
      closings: hit?.closings ?? 0,
    };
  });

  res.json({ year, months });
}));

// GET /api/competitions/:id/base-prices-by-plan?anchor=YYYY-MM
router.get('/:id/base-prices-by-plan', asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { anchor } = req.query; // "YYYY-MM"

  if (!anchor || !/^\d{4}-\d{2}$/.test(anchor)) {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    anchor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const [ay, am] = anchor.split('-').map(Number);
  const priorDate = new Date(ay, am - 2, 1);
  const prior = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;

  let planList = [];
  if (FloorPlanComp) planList = await FloorPlanComp.find({ competition: id }).lean();

  const recs = await PriceRecord.find({ competition: id, month: { $in: [prior, anchor] } }).lean();

  if (!planList.length) {
    const byPlan = new Map();
    for (const r of recs) {
      const pid = String(r.floorPlan || r.floorPlanId || '');
      if (!pid) continue;
      if (!byPlan.has(pid)) byPlan.set(pid, { _id: pid, name: r.floorPlanName || 'Plan' });
    }
    planList = Array.from(byPlan.values());
  }

  const acc = {};
  for (const r of recs) {
    const pid = String(r.floorPlan || r.floorPlanId || '');
    if (!pid) continue;
    const key = `${pid}|${r.month}`;
    if (!acc[key]) acc[key] = { sum: 0, count: 0 };
    acc[key].sum += Number(r.price) || 0;
    acc[key].count++;
  }

  const plans = planList.map(p => {
    const pid = String(p._id || p.id || p.planId || '');
    const priorKey  = `${pid}|${prior}`;
    const anchorKey = `${pid}|${anchor}`;
    const priorAvg  = acc[priorKey]  ? acc[priorKey].sum  / acc[priorKey].count  : 0;
    const anchorAvg = acc[anchorKey] ? acc[anchorKey].sum / acc[anchorKey].count : 0;
    return { id: pid, name: p.name || p.title || p.planName || 'Unnamed Plan', prior: priorAvg, anchor: anchorAvg };
  });

  res.json({ prior, anchor, plans });
}));

// ───────────────────── error handling ─────────────────────────────

// If you have a global error handler, remove the handler below.
// Keeping a small local one in case this router is mounted standalone.
router.use((err, _req, res, _next) => {
  console.error('Competition router error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Server error' });
});

module.exports = router;
