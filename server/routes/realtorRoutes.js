const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Realtor = require('../models/Realtor');

const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

const toStr = v => (v ?? '').toString().trim();
const normalizePhone = v => {
  const s = toStr(v).replace(/[^\d]/g, '');
  return s.length >= 10 ? s.slice(-10) : s;
};
const normalizeEmail = v => toStr(v).toLowerCase();

// all routes require auth
router.use(ensureAuth);

/**
 * POST /api/realtors
 * Create realtor (USER+). Stamps company server-side.
 */
router.post('/',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const body = { ...req.body };
      body.company = isSuper(req) ? (body.company || req.user.company) : req.user.company;
      if (body.email) body.email = normalizeEmail(body.email);
      if (body.phone) body.phone = normalizePhone(body.phone);

      const realtor = await Realtor.create(body);
      res.status(201).json(realtor);
    } catch (err) {
      const code = err?.code === 11000 ? 409 : 400;
      res.status(code).json({ error: err.message || 'Failed to create realtor' });
    }
  }
);

/**
 * GET /api/realtors?q=smith
 * List (READONLY+), with optional text search.
 */
router.get('/',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const q = toStr(req.query.q);
      const filter = {
        ...companyFilter(req),
        ...(q ? { $or: [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName:  { $regex: q, $options: 'i' } },
          { email:     { $regex: q, $options: 'i' } },
          { phone:     { $regex: q, $options: 'i' } },
          { brokerage: { $regex: q, $options: 'i' } }
        ] } : {})
      };
      const realtors = await Realtor.find(filter).sort({ lastName: 1, firstName: 1 }).lean();
      res.json(realtors);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch realtors', details: err.message });
    }
  }
);

/**
 * GET /api/realtors/search?q=...
 * Quick search (READONLY+), limited results.
 */
router.get('/search',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const q = toStr(req.query.q);
    if (!q) return res.json([]);
    const filter = {
      ...companyFilter(req),
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName:  { $regex: q, $options: 'i' } },
        { email:     { $regex: q, $options: 'i' } },
        { phone:     { $regex: q, $options: 'i' } },
      ]
    };
    const realtors = await Realtor.find(filter).limit(10).lean();
    res.json(realtors);
  }
);

/**
 * GET /api/realtors/:id
 * Fetch one (READONLY+).
 */
router.get('/:id',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
      const realtor = await Realtor.findOne({ _id: req.params.id, ...companyFilter(req) }).lean();
      if (!realtor) return res.status(404).json({ error: 'Realtor not found' });
      res.json(realtor);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/realtors/:id
 * Update (USER+). Prevent cross-tenant moves.
 */
router.put('/:id',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
      const updates = { ...req.body };
      delete updates.company;

      if (updates.email) updates.email = normalizeEmail(updates.email);
      if (updates.phone) updates.phone = normalizePhone(updates.phone);

      const updated = await Realtor.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        updates,
        { new: true, runValidators: true }
      ).lean();

      if (!updated) return res.status(404).json({ error: 'Realtor not found' });
      res.json(updated);
    } catch (err) {
      const code = err?.code === 11000 ? 409 : 400;
      res.status(code).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/realtors/:id
 * Delete (MANAGER+).
 */
router.delete('/:id',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
      const realtor = await Realtor.findOneAndDelete({ _id: req.params.id, ...companyFilter(req) });
      if (!realtor) return res.status(404).json({ error: 'Realtor not found' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST /api/realtors/import
 * Bulk import (MANAGER+). Upserts by { company, email } or { company, phone }.
 */
router.post('/import',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  upload.single('file'),
  async (req, res) => {
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
        const email     = normalizeEmail(r.Email || r.email);
        const phone     = normalizePhone(r.Phone || r.phone);
        const brokerage = toStr(r.Brokerage || r.brokerage || r.Company || r.company);

        if (!firstName && !lastName && !email && !phone) { skipped++; continue; }

        const filter = email ? { company: req.user.company, email }
                     : phone ? { company: req.user.company, phone }
                     : null;
        if (!filter) { skipped++; continue; }

        const set = { firstName, lastName, brokerage };
        if (email) set.email = email;
        if (phone) set.phone = phone;

        try {
          const result = await Realtor.updateOne(
            filter,
            { $set: set, $setOnInsert: { company: req.user.company } },
            { upsert: true }
          );
          if (result.upsertedCount) created++;
          else if (result.matchedCount) updated++;
          else skipped++;
        } catch (e) {
          errors.push({ row: i+1, message: e.message });
        }
      }

      res.json({ success: true, created, updated, skipped, errors });
    } catch (err) {
      res.status(500).json({ error: 'Failed to import realtors', details: err.message });
    }
  }
);

module.exports = router;
