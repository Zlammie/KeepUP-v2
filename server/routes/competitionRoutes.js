// routes/competitionRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const ensureAuth = require('../middleware/ensureAuth');

const Competition = require('../models/Competition');
const SalesRecord = require('../models/salesRecord');
const PriceRecord = require('../models/PriceRecord');

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
const tenantFilter = (req) => (isSuperAdmin(req) ? {} : { company: req.user?.company });

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

// GET /api/competitions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const comp = await Competition.findOne(filter).lean();
  if (!comp) return res.status(404).json({ error: 'Not found' });
  res.json(comp);
}));

// ──────────────────── create / update / delete ────────────────────

const ALLOWED_FIELDS = [
  'communityName','builderName','address','city','state','zip',
  'salesPerson','salesPersonPhone','salesPersonEmail',
  'lotSize','modelPlan','garageType',
  'schoolISD','elementarySchool','middleSchool','highSchool',
  'totalLots','hoaFee','hoaFrequency','tax',
  'feeTypes','mudFee','pidFee','pidFeeFrequency',
  'promotion','topPlan1','topPlan2','topPlan3','pros','cons',
  'communityAmenities' // for completeness when posted in bulk
];

// Normalizers shared by POST/PUT/PATCH
function normalizeBody(raw) {
  const body = { ...raw };

  // trim core strings
  [
    'communityName','builderName','address','city','state','zip',
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

  return body;
}

// POST /api/competitions
router.post('/', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const required = ['communityName','builderName','address','city','state','zip'];
  for (const key of required) {
    const value = body[key];
    if (!value || !String(value).trim()) {
      return res.status(400).json({ error: `${key} is required` });
    }
  }

  const filterCompany = tenantFilter(req);
  if (isSuperAdmin(req) && req.body?.company && isObjectId(req.body.company)) {
    body.company = req.body.company;
  } else {
    body.company = filterCompany.company || null;
  }
  if (!body.company) return res.status(400).json({ error: 'Company context required' });

  const comp = await Competition.create(body);
  res.status(201).json(comp);
}));

// PUT /api/competitions/:id (full update)
router.put('/:id', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const updated = await Competition.findOneAndUpdate(
    filter,
    { $set: body },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}));

// PATCH /api/competitions/:id (partial update)
router.patch('/:id', asyncHandler(async (req, res) => {
  const body = normalizeBody(pick(req.body, ALLOWED_FIELDS));

  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const updated = await Competition.findOneAndUpdate(
    filter,
    { $set: body },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}));

// keep your dedicated helpers as targeted endpoints (clear intent)
router.put('/:id/amenities', asyncHandler(async (req, res) => {
  const { communityAmenities } = req.body;
  const filter = { _id: req.params.id, ...tenantFilter(req) };
  const updated = await Competition.findOneAndUpdate(
    filter,
    { $set: { communityAmenities } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
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

// GET /api/competitions/:id/monthly?month=YYYY-MM
router.get('/:id/monthly', asyncHandler(async (req, res) => {
  const { month } = req.query;
  const doc = await Competition.findOne({ _id: req.params.id, ...tenantFilter(req) }).lean();
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const m = (doc.monthlyMetrics || []).find(x => x.month === month) || {};
  res.json({
    soldLots: m.soldLots ?? null,
    quickMoveInLots: m.quickMoveInLots ?? null
  });
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
