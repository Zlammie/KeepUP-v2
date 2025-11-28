// controllers/competition.controller.js
const mongoose = require('mongoose');
const { numOrNull, toNum } = require('../utils/number');
const Competition = require('../models/Competition');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const FloorPlanComp = require('../models/floorPlanComp');
const PriceRecord = require('../models/PriceRecord');
const QuickMoveIn = require('../models/quickMoveIn');
const SalesRecord = require('../models/salesRecord');

const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = (req) => {
  if (isSuper(req)) return {};
  const cid = req.user?.company;
  if (!cid) return { company: null };
  const objectId = mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid;
  return { company: objectId };
};
async function loadScopedCompetition(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const comp = await Competition.findOne({ _id: id, ...companyFilter(req) }).lean();
  if (!comp) return res.status(404).json({ error: 'Competition not found' });
  return comp;
}

const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);
const FALSE_SET = new Set(['0', 'false', 'no', 'off']);
const parseBoolean = (value, defaultValue = false) => {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_SET.has(normalized)) return true;
  if (FALSE_SET.has(normalized)) return false;
  return defaultValue;
};

const isYYYYMM = (input) => typeof input === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.trim());

// Parse a month key flexibly: accepts "YYYY-MM", "YYYY-M", "YYYY/MM", or date-like strings.
const toYM = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const m = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
    if (m) {
      const year = Number(m[1]);
      const month = Math.min(12, Math.max(1, Number(m[2])));
      return `${year}-${String(month).padStart(2, '0')}`;
    }
    if (isYYYYMM(trimmed)) return trimmed;
  }

  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const buildLabel = (...parts) => {
  const filtered = parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean);
  return filtered.length ? filtered.join(' - ') : 'Unnamed';
};
const friendlyMonthLabel = (ym) => {
  const normalized = toYM(ym);
  if (!normalized) return String(ym ?? '');
  const [y, m] = normalized.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
};
const extractNumeric = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const ymStrToInt = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return y * 100 + m;
};

// CRUD competitions
// GET /api/competitions
exports.list = async (req, res) => {
  const comps = await Competition.find({ ...companyFilter(req) }).lean();
  res.json(comps);
};
// POST /api/competitions
exports.create = async (req, res) => {
  // Force company for non-super
  if (!isSuper(req)) req.body.company = req.user.company;
  const c = await Competition.create(req.body);
  res.status(201).json(c);
};
// PUT /api/competitions/:id
exports.update = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;

  const allowed = [
    'communityName','builderName','address','city','state','zip','builderWebsite','modelPlan',
    'salesPerson','salesPersonPhone','salesPersonEmail','lotSize','garageType',
    'schoolISD','elementarySchool','middleSchool','highSchool',
    'totalLots','hoaFee','hoaFrequency','tax','feeTypes','mudFee','pidFee','pidFeeFrequency',
    'earnestAmount','realtorCommission','promotion','topPlan1','topPlan2','topPlan3','pros','cons'
  ];

  const update = {};
  const body = req.body || {};
  allowed.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return;
    let value = body[key];
    if (value === undefined) return;

    if (['totalLots','hoaFee','pidFee','mudFee','earnestAmount','realtorCommission','tax'].includes(key)) {
      value = numOrNull(value);
    } else if (key === 'garageType') {
      const norm = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (norm === 'front') value = 'Front';
      else if (norm === 'rear') value = 'Rear';
      else value = null;
    } else if (Array.isArray(value)) {
      value = value.map(v => (typeof v === 'string' ? v.trim() : v)).filter(v => v !== '');
    } else if (typeof value === 'string') {
      value = value.trim();
    }

    if (value === '') value = null;
    update[key] = value;
  });

  if (Array.isArray(update.feeTypes)) {
    update.feeTypes = Array.from(new Set(update.feeTypes.filter(Boolean)));
  }

  console.log('[competition:update]', comp._id.toString(), update);
  const updated = await Competition.findOneAndUpdate(
    { _id: comp._id },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  res.json(updated);
};

// DELETE /api/competitions/:id
exports.remove = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  await Competition.deleteOne({ _id: comp._id });
  res.json({ success: true });
};

// Floorplans
exports.getFloorPlans = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const fps = await FloorPlanComp.find({ competition: comp._id }).lean();
  res.json(fps);
};
exports.addFloorPlan = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const fp = await FloorPlanComp.create({ competition: comp._id, ...req.body });
  res.status(201).json(fp);
};
exports.updateFloorPlan = async (req, res) => {
  // ensure parent competition is in scope
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const fp = await FloorPlanComp.findOneAndUpdate(
    { _id: req.params.fpId, competition: comp._id },
    req.body,
    { new: true, runValidators: true }
  ).lean();
  if (!fp) return res.status(404).json({ error: 'Not found' });
  res.json(fp);
};

// Monthly metrics (load one month)
exports.getMonthly = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { month } = req.query || {};
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' });
  }
  const hit = (comp.monthlyMetrics || []).find(m => m?.month === month);
  res.json(hit || { month, soldLots: null, quickMoveInLots: null });
};

// Monthly metrics (upsert one month row)
exports.upsertMonthly = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;

  const { month } = req.body || {};
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' });
  }

  const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));
  const setOps = {};
  if (req.body.soldLots        !== undefined) setOps['monthlyMetrics.$.soldLots']        = toNumOrNull(req.body.soldLots);
  if (req.body.quickMoveInLots !== undefined) setOps['monthlyMetrics.$.quickMoveInLots'] = toNumOrNull(req.body.quickMoveInLots);

  // 1) try updating an existing row for that month
  const updated = await Competition.updateOne(
    { _id: comp._id, 'monthlyMetrics.month': month },
    { $set: setOps },
    { runValidators: true }
  );

  if (updated.matchedCount === 0) {
    // 2) push a new row if none existed
    await Competition.updateOne(
      { _id: comp._id },
      { $push: {
        monthlyMetrics: {
          month,
          ...(req.body.soldLots        !== undefined ? { soldLots:        toNumOrNull(req.body.soldLots) } : {}),
          ...(req.body.quickMoveInLots !== undefined ? { quickMoveInLots: toNumOrNull(req.body.quickMoveInLots) } : {}),
        }
      }},
      { runValidators: true }
    );
  }

  res.json({ ok: true });
};

// Price records
exports.getPriceRecords = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const recs = await PriceRecord.find({ competition: comp._id, ...(req.query.month ? { month: req.query.month } : {}) }).lean();
  res.json(recs);
};
exports.createPriceRecord = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { floorPlanId, month, price } = req.body;
  const rec = await PriceRecord.create({ competition: comp._id, floorPlan: floorPlanId, month, price });
  res.status(201).json(rec);
};
exports.updatePriceRecord = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const rec = await PriceRecord.findOneAndUpdate(
    { _id: req.params.recId, competition: comp._id },
    { price: req.body.price },
    { new: true, runValidators: true }
  ).lean();
  if (!rec) return res.status(404).json({ error: 'Not found' });
  res.json(rec);
};

// Price scatter (price vs sqft per plan for a competition, by month)
exports.getPriceScatter = async (req, res) => {
  try {
    const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
    const monthFilter = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const monthKey = toYM(monthFilter);

    // Load price records for this competition (optionally filter by month)
    const companyMatch = companyFilter(req);
    const baseQuery = {
      competition: comp._id,
      ...(monthKey ? { month: monthKey } : {})
    };
    const priceQuery = { ...baseQuery, ...companyMatch };

    let priceRecs = await PriceRecord.find(priceQuery)
      .populate('floorPlan', 'name planNumber sqft specs.squareFeet')
      .lean();

    // Legacy safeguard: if nothing matched with the company filter, try again scoped only by competition.
    if (!priceRecs.length && companyMatch && Object.keys(companyMatch).length) {
      priceRecs = await PriceRecord.find(baseQuery)
        .populate('floorPlan', 'name planNumber sqft specs.squareFeet')
        .lean();
    }

    // If some records failed to populate (e.g., legacy references to FloorPlan instead of FloorPlanComp),
    // try to hydrate those plans manually so we can still get sqft/name.
    const missingPlanIds = priceRecs
      .map((rec) => (!rec.floorPlan || typeof rec.floorPlan !== 'object') ? rec.floorPlan : null)
      .filter(Boolean)
      .map((id) => String(id));

    let planLookup = {};
    if (missingPlanIds.length) {
      const planDocs = await Promise.all([
        FloorPlanComp.find({ _id: { $in: missingPlanIds } }).select('name planNumber sqft specs.squareFeet').lean(),
        FloorPlan.find({ _id: { $in: missingPlanIds } }).select('name planNumber specs.squareFeet').lean()
      ]);

      planLookup = Object.fromEntries(
        planDocs.flat().map((p) => [String(p._id), {
          _id: p._id,
          name: p.name || '',
          planNumber: p.planNumber || '',
          sqft: p.sqft,
          specs: p.specs || {}
        }])
      );
    }

    // Group usable points by month so we can pick the most recent month with data.
    const monthPoints = new Map();
    for (const rec of priceRecs) {
      const ym = toYM(rec?.month);
      if (!ym) continue;

      const fp = rec.floorPlan && typeof rec.floorPlan === 'object'
        ? rec.floorPlan
        : (planLookup[String(rec.floorPlan)] || null);

      const sqft = extractNumeric(fp?.sqft) ?? extractNumeric(fp?.specs?.squareFeet) ?? extractNumeric(rec?.sqft);
      const price = extractNumeric(rec?.price);
      if (!Number.isFinite(sqft) || sqft <= 0 || !Number.isFinite(price)) continue;

      const labelParts = [fp?.name || '', fp?.planNumber || ''].filter(Boolean).join(' ');
      const point = {
        x: sqft,
        y: price,
        planId: fp?._id ? String(fp._id) : null,
        planName: fp?.name || '',
        planNumber: fp?.planNumber || '',
        label: labelParts || 'Plan',
        month: ym
      };

      if (!monthPoints.has(ym)) monthPoints.set(ym, []);
      monthPoints.get(ym).push(point);
    }

    if (!monthPoints.size) {
      return res.json({ months: [], selectedMonth: null, datasets: [] });
    }

    const monthsDesc = [...monthPoints.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    const months = monthsDesc.map((m) => ({ value: m, label: friendlyMonthLabel(m) }));
    const selectedMonth = monthKey && monthPoints.has(monthKey) ? monthKey : monthsDesc[0];
    const selectedPoints = [...(monthPoints.get(selectedMonth) || [])].sort((a, b) => a.x - b.x);

    const datasets = [
      {
        id: String(comp._id),
        type: 'competition',
        label: buildLabel(comp.builderName, comp.communityName),
        points: selectedPoints
      }
    ];

    res.json({ months, selectedMonth, datasets });
  } catch (err) {
    console.error('[competition:price-scatter]', err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
};

async function deriveQuickMoveInsFromCommunity(req, competition, monthFilter) {
  if (!competition?.communityRef) return [];

  const monthNormalized = typeof monthFilter === 'string' && isYYYYMM(monthFilter.trim())
    ? monthFilter.trim()
    : null;
  const monthIntFilter = monthNormalized ? ymStrToInt(monthNormalized) : null;

  const community = await Community.findOne({
    _id: competition.communityRef,
    ...companyFilter(req)
  })
    .select('lots')
    .lean();
  if (!community) return [];

  const lots = Array.isArray(community.lots) ? community.lots : [];

  const planIds = new Set();
  for (const lot of lots) {
    if (lot?.floorPlan) planIds.add(String(lot.floorPlan));
  }

  let planMap = {};
  if (planIds.size) {
    const plans = await FloorPlan.find({
      _id: { $in: [...planIds] },
      ...companyFilter(req)
    })
      .select('name planNumber specs.squareFeet')
      .lean();

    planMap = Object.fromEntries(
      plans.map((plan) => [
        String(plan._id),
        {
          _id: plan._id,
          name: plan.name || '',
          planNumber: plan.planNumber || '',
          sqft: extractNumeric(plan?.specs?.squareFeet)
        }
      ])
    );
  }

  const results = [];

  for (const lot of lots) {
    if (!lot) continue;

    const statusRaw = String(lot.status || lot.generalStatus || '').trim();
    const statusLower = statusRaw.toLowerCase();
    const hasPurchaser = Boolean(lot.purchaser);
    const statusSold =
      statusLower.includes('sold') ||
      statusLower.includes('closed') ||
      statusLower.includes('purchased');

    const planId = lot.floorPlan ? String(lot.floorPlan) : null;
    const planMeta = planId && planMap[planId] ? planMap[planId] : null;

    const releaseMonth = toYM(
      lot.releaseDate ||
      lot.listDate ||
      lot.availableDate ||
      lot.listedDate
    );
    const releaseInt = releaseMonth ? ymStrToInt(releaseMonth) : null;
    const listDate = lot.listDate || lot.releaseDate || lot.availableDate || null;

    const listPrice =
      extractNumeric(lot.listPrice) ??
      extractNumeric(lot.price) ??
      extractNumeric(lot.basePrice) ??
      extractNumeric(lot.askingPrice) ??
      null;

    const sqft =
      extractNumeric(lot.squareFeet) ??
      extractNumeric(lot.sqft) ??
      (planMeta ? extractNumeric(planMeta.sqft) : null);

    const soldDate =
      lot.salesDate ||
      lot.closeDateTime ||
      lot.closeDate ||
      lot.closingDate ||
      lot.closedDate ||
      lot.soldDate ||
      lot.contractDate ||
      null;
    const soldMonth = toYM(lot.closeMonth || soldDate);
    const soldPrice =
      extractNumeric(lot.salesPrice) ??
      extractNumeric(lot.soldPrice) ??
      extractNumeric(lot.contractPrice) ??
      extractNumeric(lot.closingPrice) ??
      null;

    if (!hasPurchaser && !statusSold) {
      const isInventory =
        (statusLower.includes('under') && statusLower.includes('construction')) ||
        statusLower.includes('finished') ||
        statusLower.includes('available') ||
        statusLower.includes('spec') ||
        statusLower.includes('inventory');
      if (!isInventory) continue;

      if (monthIntFilter != null) {
        if (!releaseMonth || releaseInt == null) continue;
        if (releaseInt > monthIntFilter) continue;
      }

      results.push({
        _id: null,
        recordId: lot._id ? String(lot._id) : null,
        isDerived: true,
        source: 'linked-community',
        competition: competition._id,
        company: competition.company,
        address: lot.address || lot.streetAddress || '',
        status: statusRaw || 'Ready Now',
        listDate,
        soldDate: null,
        month: releaseMonth,
        listPrice,
        soldPrice: null,
        sqft,
        floorPlan: planMeta?._id || null,
        plan: planMeta || null
      });
      continue;
    }

    const derivedMonth = soldMonth || releaseMonth || (listDate ? toYM(listDate) : null);
    if (monthNormalized && derivedMonth !== monthNormalized) continue;

    results.push({
      _id: null,
      recordId: lot._id ? String(lot._id) : null,
      isDerived: true,
      source: 'linked-community',
      competition: competition._id,
      company: competition.company,
      address: lot.address || lot.streetAddress || '',
      status: 'SOLD',
      listDate,
      soldDate,
      month: derivedMonth,
      listPrice,
      soldPrice,
      sqft,
      floorPlan: planMeta?._id || null,
      plan: planMeta || null
    });
  }

  return results;
}

// Quick move-ins
exports.listQMIs = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const month = req.query.month;
  const includeDerived = parseBoolean(req.query.includeDerived);
  const filter = { competition: comp._id, ...(month ? { month } : {}) };
  const recs = await QuickMoveIn.find(filter).lean();

  if (!recs.length && includeDerived && comp.isInternal) {
    try {
      const derived = await deriveQuickMoveInsFromCommunity(req, comp, month);
      if (derived.length) return res.json(derived);
    } catch (err) {
      console.error('[competition:quick-moveins:derive]', err);
    }
  }

  res.json(recs);
};
exports.createQMI = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { month, address, floorPlanId, floorPlan, listPrice, sqft, status, listDate, soldDate, soldPrice } = req.body;
  const rec = await QuickMoveIn.create({
    competition: comp._id,
    month, address,
    floorPlan: floorPlanId || floorPlan,
    listPrice: numOrNull(listPrice),
    sqft:      numOrNull(sqft),
    status, listDate,
    soldDate:  soldDate || null,
    soldPrice: numOrNull(soldPrice)
  });
  res.status(201).json(rec);
};
exports.updateQMI = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { address, floorPlanId, floorPlan, listPrice, sqft, status, listDate, soldDate, soldPrice } = req.body;
  const rec = await QuickMoveIn.findOneAndUpdate(
    { _id: req.params.recId, competition: comp._id },
    { address, floorPlan: floorPlanId || floorPlan, listPrice: numOrNull(listPrice), sqft: numOrNull(sqft), status, listDate, soldDate: soldDate || null, soldPrice: numOrNull(soldPrice) },
    { new: true, runValidators: true }
  ).lean();
  if (!rec) return res.status(404).json({ error: 'Not found' });
  res.json(rec);
};
exports.deleteQMI = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const out = await QuickMoveIn.deleteOne({ _id: req.params.recId, competition: comp._id });
  if (!out.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.sendStatus(204);
};


// Sales records
exports.salesSeries = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const year = Number(req.query.year) || new Date().getFullYear();

  const recs = await SalesRecord.find({
    competition: comp._id,
    month: { $regex: `^${year}-` }
  }).lean();

  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const key = `${year}-${mm}`;
    const hit = recs.find(r => r.month === key);
    return {
      month: key,
      sales:   hit?.sales    ?? 0,
      cancels: hit?.cancels  ?? 0,
      closings: hit?.closings ?? 0,
    };
  });

  res.json({ year, months });
};

exports.listSales = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const filter = { competition: comp._id, ...(req.query.month ? { month: req.query.month } : {}) };
  const recs = await SalesRecord.find(filter).lean();
  res.json(recs);
};

exports.createSales = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { month, sales, cancels, closings } = req.body;
  const rec = await SalesRecord.create({
    competition: comp._id,
    month,
    sales:   toNum(sales),
    cancels: toNum(cancels),
    closings: toNum(closings)
  });
  res.status(201).json(rec);
};
exports.updateSales = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const { sales, cancels, closings } = req.body;
  const rec = await SalesRecord.findOneAndUpdate(
    { _id: req.params.recId, competition: comp._id },
    { sales: toNum(sales), cancels: toNum(cancels), closings: toNum(closings) },
    { new: true, runValidators: true }
  ).lean();
  if (!rec) return res.status(404).json({ error: 'Not found' });
  res.json(rec);
};

exports.listMinimal = async (req, res, next) => {
  try {
    const rows = await Competition.find({ ...companyFilter(req) }, { builderName: 1, communityName: 1 }).lean();
    const data = rows.map(c => ({
      id: c._id,
      label: [c.builderName, c.communityName].filter(Boolean).join(' - ')
    }));
    res.json(data);
  } catch (err) { next(err); }
};
