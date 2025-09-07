const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Realtor = require('../models/Realtor');

const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function toStr(v){ return (v ?? '').toString().trim(); }
function normalizePhone(v){ const s = toStr(v).replace(/[^\d]/g, ''); return s.length >= 10 ? s.slice(-10) : s; }


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
// POST /api/realtors/import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });

    let created = 0, updated = 0, skipped = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const firstName = toStr(r.FirstName || r['First Name'] || r.firstName);
      const lastName  = toStr(r.LastName  || r['Last Name']  || r.lastName);
      const email     = toStr(r.Email     || r.email);
      const phone     = normalizePhone(r.Phone || r.phone);
      const brokerage = toStr(r.Brokerage || r.brokerage || r.Company || r.company);

      if (!firstName && !lastName && !email && !phone) { skipped++; continue; }

      const filter = email ? { email } : (phone ? { phone } : null);
      if (!filter) { skipped++; continue; }

      const update = { $set: { firstName, lastName, brokerage } };
      if (email) update.$set.email = email;
      if (phone) update.$set.phone = phone;

      try {
        const result = await Realtor.updateOne(filter, update, { upsert: true });
        if (result.upsertedCount && result.upsertedId) created++;
        else if (result.matchedCount) updated++;
        else skipped++;
      } catch (e) {
        errors.push({ row: i + 1, message: e.message });
      }
    }

    res.json({ success: true, created, updated, skipped, errors });
  } catch (err) {
    console.error('Realtor import error:', err);
    res.status(500).json({ error: 'Failed to import realtors', details: err.message });
  }
});

// DELETE /api/realtors/:id
router.delete('/:id', async (req, res) => {
  try {
    const realtor = await Realtor.findByIdAndDelete(req.params.id);
    if (!realtor) {
      return res.status(404).json({ error: 'Realtor not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting realtor:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
module.exports = router;
