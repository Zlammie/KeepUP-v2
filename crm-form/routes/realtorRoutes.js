const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Realtor = require('../models/Realtor');

// ✅ Create a realtor
router.post('/', async (req, res) => {
  try {
    const realtor = new Realtor(req.body);
    await realtor.save();
    res.status(201).json(realtor);
  } catch (err) {
    res.status(400).json({ error: 'Failed to save realtor', details: err.message });
  }
});

// ✅ Get all realtors
router.get('/', async (req, res) => {
  try {
    const realtors = await Realtor.find();
    res.json(realtors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch realtors', details: err.message });
  }
});

// ✅ Search realtors (IMPORTANT: This must come before the `/:id` route)
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query' });

    const regex = new RegExp(q, 'i');
    const realtors = await Realtor.find({
      $or: [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex }
      ]
    });

    res.json(realtors);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Get one realtor by ID
router.get('/:id', async (req, res) => {
  try {
    const realtor = await Realtor.findById(req.params.id);
    if (!realtor) return res.status(404).json({ error: 'Realtor not found' });
    res.json(realtor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update a realtor
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  console.log('PUT Realtor ID:', id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  try {
    const updated = await Realtor.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      console.log('Realtor not found for ID:', id);
      return res.status(404).json({ error: 'Realtor not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
