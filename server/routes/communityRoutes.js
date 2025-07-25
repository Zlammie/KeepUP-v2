const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const router = express.Router();

const Community = require('../models/Community'); // ✅ Only declared once

const upload = multer({ dest: 'uploads/' });

// 📥 Import Communities from Excel/CSV
router.post('/communities/import', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const communitiesMap = {};

    data.forEach(row => {
      const name = row["Community Name"];
      const projectNumber = row["Project Number"];
      const lot = {
        jobNumber: String(row["Job Number"]).padStart(4, '0'), // <-- padded to 4 digits
        lot: row["Lot"],
        block: row["Block"],
        phase: row["Phase"],
        address: row["Address"],
        floorPlan: row["Floor Plan"] || '',
        elevation: row["Elevation"] || ''
      };

      const key = `${name}|${projectNumber}`;
      if (!communitiesMap[key]) {
        communitiesMap[key] = { name, projectNumber, lots: [] };
      }
      communitiesMap[key].lots.push(lot);
    });

    const inserted = [];

    for (const key in communitiesMap) {
      const { name, projectNumber, lots } = communitiesMap[key];

      let community = await Community.findOne({ name, projectNumber });
      if (!community) {
        community = new Community({ name, projectNumber, lots });
      } else {
        community.lots.push(...lots);
      }
      await community.save();
      inserted.push(community);
    }

    res.json({ success: true, inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed' });
  }
});
// POST /api/communities — Create new community
router.post('/', async (req, res) => {
  try {
    const { name, projectNumber } = req.body;
    if (!name || !projectNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await Community.findOne({ name, projectNumber });
    if (existing) {
      return res.status(409).json({ error: 'Community already exists' });
    }

    const newCommunity = new Community({ name, projectNumber, lots: [] });
    await newCommunity.save();
    res.status(201).json(newCommunity);
  } catch (err) {
    console.error('Error creating community:', err);
    res.status(500).json({ error: 'Server error' });
  }
});



// 📤 Get all Communities
router.get('/', async (req, res) => {
  try {
    const communities = await Community.find();
    res.json(communities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

// 🔍 Search lots in a community by address
router.get('/:id/lots', async (req, res) => {
  try {
    const { id } = req.params;
    const query = req.query.q?.toLowerCase() || '';

    const community = await Community.findById(id)
      .populate('lots.purchaser','lastName');

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const matchingLots = community.lots.filter(lot =>
      lot.address?.toLowerCase().includes(query)
    );

    res.json(matchingLots);
  } catch (err) {
    console.error('Failed to fetch lots:', err);
    res.status(500).json({ error: 'Failed to fetch lots' });
  }
});

router.post('/:id/lots', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jobNumber, lot, block, phase, address, floorPlan = '', elevation = ''
    } = req.body;

    const community = await Community.findById(id);
    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const newLot = {
      jobNumber: String(jobNumber).padStart(4, '0'),
      lot,
      block,
      phase,
      address,
      floorPlan: mongoose.Types.ObjectId.isValid(floorPlan) ? floorPlan : null,
      elevation,
      status: '',
      purchaser: null,
      phone: '',
      email: '',
      releaseDate: '',
      expectedCompletionDate: '',
      closeMonth: '',
      walkStatus: 'waitingOnBuilder',
      thirdParty: null,
      firstWalk: null,
      finalSignOff: null,
      lender: '',
      closeDateTime: '',
      listPrice: '',
      salesPrice: ''
    };

    community.lots.push(newLot);
    await community.save();

    res.status(201).json({ message: 'Lot added', lot: newLot });
  } catch (err) {
    console.error('Error adding lot:', err);
    res.status(500).json({ error: err.message });  // ⬅️ add this line
    
  }
});

const FloorPlan = require('../models/FloorPlan'); // at the top, alongside Community

// GET all floor plans for a specific community
router.get('/:id/floorplans', async (req, res) => {
  try {
    const communityId = req.params.id;
    // find all plans that include this community ID in their communities array
    const plans = await FloorPlan.find({ communities: communityId });
    res.json(plans);
  } catch (err) {
    console.error('Error fetching floor plans for community:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/communities/:id/lots/:lotId
router.get('/:id/lots/:lotId', async (req, res) => {
  try {
    const { id, lotId } = req.params;
    const community = await Community
      .findById(id)
      .populate('lots.purchaser', 'lastName');
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lot = community.lots.id(lotId);
    if (!lot)       return res.status(404).json({ error: 'Lot not found' });

    return res.json(lot);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

router.put(
  '/:communityId/lots/:lotId',
  async (req, res) => {
    const { communityId, lotId } = req.params;
    const updates = req.body;    // e.g. { walkStatus: 'datesSentToPurchaser' }

    // Build a $set that targets lots.$.<field>
    const setObj = Object.entries(updates).reduce((acc, [k,v]) => {
      acc[`lots.$.${k}`] = v;
      return acc;
    }, {});

    try {
      const community = await Community.findOneAndUpdate(
        { _id: communityId, 'lots._id': lotId },
        { $set: setObj },
        { new: true }    // return the updated document
      );
      if (!community) {
        return res.status(404).json({ error: 'Community or Lot not found' });
      }

      // Extract just the updated lot
      const updatedLot = community.lots.id(lotId);
      return res.json(updatedLot);
    } catch (err) {
      console.error('Error updating lot:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);
// --- End generic update ---

router.put(
  '/:communityId/lots/:lotId/purchaser',
  
  async (req, res) => {
    const { communityId, lotId } = req.params;
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'Missing contactId' });
    }
    try {
      const community = await Community.findByIdAndUpdate(
        communityId,
        { $set: { 'lots.$[lot].purchaser': contactId } },
        {
          new: true,
          arrayFilters: [{ 'lot._id': lotId }]
        }
      ).populate('lots.purchaser', 'lastName');
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const updatedLot = community.lots.find(l => l._id.toString() === lotId);
      if (!updatedLot)    return res.status(404).json({ error: 'Lot not found' });

      return res.json(updatedLot);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }
);




module.exports = router;
