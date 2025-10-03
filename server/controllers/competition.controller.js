// controllers/competition.controller.js
const mongoose = require('mongoose');
const { numOrNull, toNum } = require('../utils/number');
const Competition = require('../models/Competition');
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

// Quick move-ins
exports.listQMIs = async (req, res) => {
  const comp = await loadScopedCompetition(req, res); if (!comp || res.headersSent) return;
  const filter = { competition: comp._id, ...(req.query.month ? { month: req.query.month } : {}) };
  const recs = await QuickMoveIn.find(filter).lean();
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
