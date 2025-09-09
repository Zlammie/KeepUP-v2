const express = require('express');
const router = express.Router();
const Competition = require('../models/Competition'); // adjust path if needed
const SalesRecord = require('../models/salesRecord'); // adjust path if needed
const PriceRecord   = require('../models/PriceRecord');   // match file name case
let FloorPlanComp;
try {
  FloorPlanComp = require('../models/floorPlanComp');     // if you have a model for plans per competition
} catch (e) {
  // optional: leave undefined; we’ll still work from PriceRecord if this model doesn't exist
}


router.put('/:id', async (req, res) => {
  try {
    const competitionId = req.params.id;
    const update = req.body;

    const updated = await Competition.findByIdAndUpdate(competitionId, update, { new: true });
    if (!updated) return res.status(404).json({ message: 'Competition not found' });

    res.json(updated);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/amenities', async (req, res) => {
  try {
    const { communityAmenities } = req.body;
    const updated = await Competition.findByIdAndUpdate(
      req.params.id,
      { communityAmenities },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('Error updating amenities:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
router.put('/:id/metrics', async (req, res) => {
  console.log('💡 Incoming metrics payload:', req.body);
  try {
    const { id } = req.params;
    const update = {};

    // Allow multiple fields from metricsForm
    const fields = ['promotion', 'topPlan1', 'topPlan2', 'topPlan3', 'pros', 'cons'];
    fields.forEach(key => {
      if (req.body[key] !== undefined) {
        update[key] = req.body[key];
      }
    });

    const result = await Competition.findByIdAndUpdate(id, update, {
      new: true
    });

    res.json(result);
  } catch (err) {
    console.error('Error updating competition metrics:', err);
    res.status(500).json({ error: 'Failed to update competition metrics' });
  }
});

router.put('/:id/monthly-metrics', async (req, res) => {
  const { id } = req.params;
  const { soldLots, quickMoveInLots } = req.body;
  const month = new Date().toISOString().slice(0, 7); // e.g. "2025-07"

  try {
    const competition = await Competition.findById(id);
    if (!competition) return res.status(404).json({ error: 'Competition not found' });

    const existingIndex = competition.monthlyMetrics.findIndex(entry => entry.month === month);

    if (existingIndex >= 0) {
      competition.monthlyMetrics[existingIndex].soldLots = soldLots;
      competition.monthlyMetrics[existingIndex].quickMoveInLots = quickMoveInLots;
    } else {
      competition.monthlyMetrics.push({
        month,
        soldLots,
        quickMoveInLots
      });
    }

    await competition.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving monthly metrics:', err);
    res.status(500).json({ error: 'Failed to save monthly metrics' });
  }
});

router.get('/api/competitions/minimal', async (req, res) => {
  try {
    const comps = await Competition.find({})
      .select('communityName builderName city state') // only what we render
      .sort({ builderName: 1, communityName: 1 })
      .lean();
    res.json(comps);
  } catch (err) {
    console.error('GET /competitions/minimal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
//base price graph //
router.get('/:id/base-prices-by-plan', async (req, res) => {
  try {
    const { id } = req.params;
    let { anchor } = req.query; // "YYYY-MM"

    // default anchor = previous month
    if (!anchor) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      anchor = `${y}-${m}`;
    }

    // compute prior = anchor minus 1 month
    const [ay, am] = anchor.split('-').map(Number);
    const priorDate = new Date(ay, am - 2, 1); // zero-based month: am-1 is anchor; am-2 is prior
    const prior = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;

    // If you have a floor-plan model, use it to list plans; otherwise we’ll derive from PriceRecord.
    let planList = [];
    if (FloorPlanComp) {
      planList = await FloorPlanComp.find({ competition: id }).lean();
    }

    // Pull all price records for the two months in one shot
    const recs = await PriceRecord.find({
      competition: id,
      month: { $in: [prior, anchor] }
    }).lean();

    // If we didn't get plans from FloorPlanComp, synthesize from the records we do have
    if (!planList.length) {
      const byPlan = new Map();
      for (const r of recs) {
        const pid = String(r.floorPlan || r.floorPlanId || '');
        if (!byPlan.has(pid)) {
          byPlan.set(pid, { _id: pid, name: r.floorPlanName || 'Plan' });
        }
      }
      planList = Array.from(byPlan.values());
    }

    // Aggregate price per plan per month (average if multiple records exist)
    const acc = {}; // key: `${planId}|${month}` => { sum, count }
    for (const r of recs) {
      const planId = String(r.floorPlan || r.floorPlanId || '');
      if (!planId) continue;
      const key = `${planId}|${r.month}`;
      if (!acc[key]) acc[key] = { sum: 0, count: 0 };
      acc[key].sum += Number(r.price) || 0;
      acc[key].count++;
    }

    // Build response: every plan present, zeros if missing for a month
    const plans = planList.map(p => {
      const pid = String(p._id || p.id || p.planId || '');
      const priorKey  = `${pid}|${prior}`;
      const anchorKey = `${pid}|${anchor}`;
      const priorAvg  = acc[priorKey]  ? acc[priorKey].sum  / acc[priorKey].count  : 0;
      const anchorAvg = acc[anchorKey] ? acc[anchorKey].sum / acc[anchorKey].count : 0;
      return {
        id: pid,
        name: p.name || p.title || p.planName || 'Unnamed Plan',
        prior: priorAvg,
        anchor: anchorAvg
      };
    });

    res.json({ prior, anchor, plans });
  } catch (err) {
    console.error('GET /:id/base-prices-by-plan error:', err);
    res.status(500).json({ error: 'Failed to load per-plan base prices' });
  }
});
module.exports = router;
