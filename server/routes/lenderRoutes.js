const express = require("express");
const router = express.Router();
const Lender = require("../models/lenderModel");

router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  const regex = new RegExp(q, 'i'); // case-insensitive
  const lenders = await Lender.find({
    $or: [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
    ]
  }).limit(10);

  res.json(lenders);
});

router.post("/", async (req, res) => {
  try {
    const lender = new Lender(req.body);
    await lender.save();
    res.status(201).json(lender);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const lenders = await Lender.find();
    res.json(lenders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lenders', details: err.message });
  }
});

// GET /api/lenders/:id - Get a single lender by ID
router.get('/:id', async (req, res) => {
  try {
    const lender = await Lender.findById(req.params.id);
    if (!lender) {
      return res.status(404).json({ error: 'Lender not found' });
    }
    res.json(lender);
  } catch (err) {
    console.error('Error fetching lender by ID:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const lender = await Lender.findByIdAndDelete(req.params.id);
    if (!lender) {
      return res.status(404).json({ error: 'Lender not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting lender by ID:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
