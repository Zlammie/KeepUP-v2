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

module.exports = router;
