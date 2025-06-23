// routes/floorPlanRoutes.js
const express = require('express');
const router  = express.Router();
const FloorPlan = require('../models/FloorPlan');

// GET all floor plans
router.get('/', async (req, res) => {
  try {
    const plans = await FloorPlan.find().populate('communities');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching floor plans:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET a single floor plan by ID
router.get('/:id', async (req, res) => {
  try {
    const plan = await FloorPlan.findById(req.params.id).populate('communities');
    if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
    res.json(plan);
  } catch (err) {
    console.error('Error fetching floor plan:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create a new floor plan
router.post('/', async (req, res) => {
  try {
    const { planNumber, name, specs, communities } = req.body;
    const newPlan = new FloorPlan({ planNumber, name, specs, communities });
    await newPlan.save();
    res.status(201).json(newPlan);
  } catch (err) {
    console.error('Error creating floor plan:', err);
    res.status(400).json({ error: err.message });
  }
});

// PUT update an existing floor plan
router.put('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const plan = await FloorPlan.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
    res.json(plan);
  } catch (err) {
    console.error('Error updating floor plan:', err);
    res.status(400).json({ error: err.message });
  }
});

// DELETE an existing floor plan
router.delete('/:id', async (req, res) => {
  try {
    const plan = await FloorPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('Error deleting floor plan:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
