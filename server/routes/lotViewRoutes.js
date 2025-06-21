// routes/lotViewRoutes.js
const express = require('express');
const router  = express.Router();
const Community = require('../models/Community');

// GET all lots for a community, populated with purchaser lastName
router.get('/communities/:communityId/lots', async (req, res) => {
  try {
    const community = await Community
      .findById(req.params.communityId)
      .populate('lots.purchaser', 'lastName');    // populate nested subdoc

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }
console.log('📦 populated purchasers on server:', community.lots.map(l => l.purchaser));

    res.json(community.lots);
    console.log('📦 populated community.lots:', community.lots);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

