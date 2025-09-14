// routes/competitionRoutes.js
const express = require('express');
const router = express.Router();

const Competition  = require('../models/Competition');   // adjust if needed
const SalesRecord  = require('../models/salesRecord');   // adjust if needed
const PriceRecord  = require('../models/PriceRecord');   // match file case

let FloorPlanComp;
try { FloorPlanComp = require('../models/floorPlanComp'); } catch { /* optional */ }

// ---------- helpers ----------
const toNumOrNull = v => (v === '' || v == null ? null : Number(v));
const clean = v => (v === '' ? undefined : v); // avoid saving empty-string enums

// ---------- list / minimal / get one / create ----------
router.get('/', async (req, res) => {
  try {
    const comps = await Competition.find().lean();
    res.json(comps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/minimal', async (req, res) => {
  try {
    const comps = await Competition.find({})
      .select('communityName builderName city state')
      .sort({ builderName: 1, communityName: 1 })
      .lean();
    res.json(comps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id).lean();
    if (!comp) return res.status(404).json({ error: 'Not found' });
    res.json(comp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const comp = await Competition.create(req.body);
    res.status(201).json(comp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- generic update ----------
router.put('/:id', async (req, res) => {
  try {
    const updated = await Competition.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Competition not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update error:', err);
    res.status(400).json({ message: err.message });
  }
});

// ---------- amenities ----------
router.put('/:id/amenities', async (req, res) => {
  try {
    const { communityAmenities } = req.body;
    const updated = await Competition.findByIdAndUpdate(
      req.params.id,
      { $set: { communityAmenities } },
      { new: true, runValidators: true }
    ).lean();
    res.json(updated);
  } catch (err) {
    console.error('Error updating amenities:', err);
    res.status(400).json({ error: err.message });
  }
});

// ---------- metrics (normalize blank enums, coerce numbers) ----------
router.put('/:id/metrics', async (req, res) => {
  try {
    const {
      promotion, topPlan1, topPlan2, topPlan3, pros, cons,
      totalLots, hoaFee, hoaFrequency, pidFee, pidFeeFrequency
    } = req.body;

    const $set = {
      ...(promotion  !== undefined ? { promotion } : {}),
      ...(topPlan1   !== undefined ? { topPlan1 } : {}),
      ...(topPlan2   !== undefined ? { topPlan2 } : {}),
      ...(topPlan3   !== undefined ? { topPlan3 } : {}),
      ...(pros       !== undefined ? { pros } : {}),
      ...(cons       !== undefined ? { cons } : {}),
      ...(totalLots  !== undefined ? { totalLots: toNumOrNull(totalLots) } : {}),
      ...(hoaFee     !== undefined ? { hoaFee: toNumOrNull(hoaFee) } : {}),
      ...(hoaFrequency     !== undefined ? { hoaFrequency: clean(hoaFrequency) } : {}),
      ...(pidFee     !== undefined ? { pidFee: toNumOrNull(pidFee) } : {}),
      ...(pidFeeFrequency  !== undefined ? { pidFeeFrequency: clean(pidFeeFrequency) } : {}),
    };
    Object.keys($set).forEach(k => $set[k] === undefined && delete $set[k]);

    const updated = await Competition.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error updating competition metrics:', err);
    res.status(400).json({ error: err.message });
  }
});

// ---------- monthly metrics (atomic upsert; no full doc save) ----------
router.put('/:id/monthly-metrics', async (req, res) => {
  try {
    let { month, soldLots, quickMoveInLots } = req.body;
    if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

    if (soldLots        !== undefined) soldLots        = toNumOrNull(soldLots);
    if (quickMoveInLots !== undefined) quickMoveInLots = toNumOrNull(quickMoveInLots);

    const upd = await Competition.updateOne(
      { _id: req.params.id, 'monthlyMetrics.month': month },
      {
        $set: {
          ...(soldLots !== undefined ? { 'monthlyMetrics.$.soldLots': soldLots } : {}),
          ...(quickMoveInLots !== undefined ? { 'monthlyMetrics.$.quickMoveInLots': quickMoveInLots } : {}),
        }
      },
      { runValidators: true }
    );

    if (upd.matchedCount === 0) {
      await Competition.updateOne(
        { _id: req.params.id },
        {
          $push: {
            monthlyMetrics: {
              month,
              ...(soldLots !== undefined ? { soldLots } : {}),
              ...(quickMoveInLots !== undefined ? { quickMoveInLots } : {}),
            }
          }
        },
        { runValidators: true }
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('💥 monthly-metrics save error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ---------- monthly metrics (GET one month for hydration) ----------
router.get('/:id/monthly', async (req, res) => {
  try {
    const { month } = req.query;
    const doc = await Competition.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const m = (doc.monthlyMetrics || []).find(x => x.month === month) || {};
    res.json({
      soldLots: m.soldLots ?? null,
      quickMoveInLots: m.quickMoveInLots ?? null
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- sales (unchanged from yours) ----------
router.get('/:id/sales', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('GET sales error:', err);
    res.status(500).json({ error: 'Failed to load sales records' });
  }
});

// ---------- base prices by plan (unchanged; minor cleanup) ----------
router.get('/:id/base-prices-by-plan', async (req, res) => {
  try {
    const { id } = req.params;
    let { anchor } = req.query; // "YYYY-MM"

    if (!anchor) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
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
  } catch (err) {
    console.error('GET /:id/base-prices-by-plan error:', err);
    res.status(500).json({ error: 'Failed to load per-plan base prices' });
  }
});

// ---------- delete ----------
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Competition.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
