// controllers/competition.controller.js
const mongoose = require('mongoose');
const { numOrNull, toNum } = require('../utils/number');
const Competition = require('../models/Competition');
const FloorPlanComp = require('../models/floorPlanComp');
const PriceRecord = require('../models/PriceRecord');
const QuickMoveIn = require('../models/quickMoveIn');
const SalesRecord = require('../models/salesRecord');

const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = (req) => (isSuper(req) ? {} : { company: req.user.company });

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
      label: [c.builderName, c.communityName].filter(Boolean).join(' — ')
    }));
    res.json(data);
  } catch (err) { next(err); }
};