const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const router = express.Router();

const Community = require('../models/Community'); // ✅ Only declared once
const FloorPlan = require('../models/FloorPlan');
const Contact = require('../models/Contact'); 

const upload = multer({ dest: 'uploads/' });

// 📥 Import Communities from Excel/CSV
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const communitiesMap = {};
    const plans = await FloorPlan.find({}, 'name planNumber').lean();
    const planByName   = new Map(plans.map(p => [String(p.name).toLowerCase(), String(p._id)]));
    const planByNumber = new Map(plans.map(p => [String(p.planNumber).toLowerCase(), String(p._id)]));

    data.forEach(row => {
      const name = row['Community Name'];
      const projectNumber = row['Project Number'];

      const fpRaw = (row['Floor Plan'] || '').toString().trim().toLowerCase();
      const fpId  = planByName.get(fpRaw) || planByNumber.get(fpRaw) || null;

      const lot = {
        jobNumber: String(row['Job Number']).padStart(4, '0'),
        lot: row['Lot'],
        block: row['Block'],
        phase: row['Phase'],
        address: row['Address'],
        floorPlan: fpId,                 // ✅ store ObjectId (or null)
        elevation: row['Elevation'] || ''
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

// GET /api/communities/lot-by-purchaser/:contactId
router.get('/lot-by-purchaser/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    // Find any community that has a lot purchased by this contact
    const community = await Community.findOne({ 'lots.purchaser': contactId }, { lots: 1 })
      .populate('lots.purchaser', 'lastName');

    if (!community) return res.json({ found: false });

    const lot = community.lots.find(l => String(l.purchaser?._id || l.purchaser) === String(contactId));
    if (!lot) return res.json({ found: false });

    res.json({
      found: true,
      communityId: community._id,
      lot: {
        _id: lot._id,
        address: lot.address,
        jobNumber: lot.jobNumber,
        salesDate: lot.salesDate,
        salesPrice: lot.salesPrice
      }
    });
  } catch (err) {
    console.error('lot-by-purchaser error', err);
    res.status(500).json({ error: 'Server error' });
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

    // Keep purchaser populate if you want; avoid populating floorPlan here
    const community = await Community
      .findById(id)
      .populate('lots.purchaser', 'lastName')
      .lean();

    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lot = (community.lots || []).find(l => String(l._id) === String(lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // --- Normalize floorPlan for the client without throwing ---
    // Cases we handle: ObjectId string, populated object, legacy string, or empty
    let planId = null;
    if (lot.floorPlan && typeof lot.floorPlan === 'object') {
      planId = lot.floorPlan._id; // already an object for some records
    } else if (typeof lot.floorPlan === 'string') {
      planId = lot.floorPlan;
    }

    let planPayload = null;
    if (planId && mongoose.isValidObjectId(planId)) {
      // valid ObjectId → fetch plan details
      const fp = await FloorPlan.findById(planId).select('name planNumber').lean();
      if (fp) planPayload = fp;
    } else if (typeof lot.floorPlan === 'string' && lot.floorPlan.trim()) {
      // legacy plain string (e.g., "Harper" or "1234")
      planPayload = { name: lot.floorPlan };
    }
    lot.floorPlan = planPayload; // object or null

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
    if (typeof updates.salesDate === 'string' && updates.salesDate) {
  updates.salesDate = new Date(updates.salesDate);
}

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

// DELETE /api/communities/:id/lots/:lotId/purchaser
router.delete('/:id/lots/:lotId/purchaser', async (req, res) => {
  try {
    const { id, lotId } = req.params;

    const doc = await Community.findOne(
      { _id: id, 'lots._id': lotId },
      { 'lots.$': 1 }
    ).lean();

    if (!doc || !doc.lots || !doc.lots[0]) {
      return res.status(404).json({ error: 'Community or lot not found' });
    }

    await Community.updateOne(
      { _id: id, 'lots._id': lotId },
      { $unset: { 'lots.$.purchaser': '' } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('unlink purchaser failed:', err);
    return res.status(500).json({ error: err.message });
  }
});



module.exports = router;
