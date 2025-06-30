// routes/lotViewRoutes.js
const express = require('express');
const router  = express.Router();
const Community = require('../models/Community');

// GET all lots for a community, populated with purchaser lastName
router.get('/communities/:communityId/lots', async (req, res) => {
  
  try {
    const community = await Community
      .findById(req.params.communityId)
      .populate('lots.purchaser',  'firstName lastName')
      .populate('lots.floorPlan',   'name');
      

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // ✅ Return the array of lots here
    return res.json(community.lots);
  } catch (err) {
    console.error('Error fetching lots:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.put(
  '/communities/:communityId/lots/:lotId',
  async (req, res) => {
    try {
      const { communityId, lotId } = req.params;
      const updates                = req.body;

      // Build a $set object that targets the correct lot in the array
      const set = {};
      for (const [key, val] of Object.entries(updates)) {
        set[`lots.$.${key}`] = val;
      }

      const updated = await Community.findOneAndUpdate(
        { _id: communityId, 'lots._id': lotId },
        { $set: set },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ error: 'Community or Lot not found' });
      }
      // Optionally: return just the updated lot instead of the whole community
      const updatedLot = updated.lots.id(lotId);
      res.json(updatedLot);
    } catch (err) {
      console.error('Error updating nested lot:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;

