const express = require('express');
const router = express.Router();
const Competition = require('../models/Competition'); // adjust path if needed


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

module.exports = router;
