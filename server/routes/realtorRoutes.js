const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const router = express.Router();
const Realtor = require('../models/Realtor');
const RealtorAssignment = require('../models/RealtorAssignment');
const { normalizePhoneForDb } = require('../utils/phone');

const xlsx = require('xlsx');

const upload = require('../middleware/upload');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

const toStr = v => (v ?? '').toString().trim();
const normalizeEmail = v => toStr(v).toLowerCase();

//Realtor Assignment Helpers


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
      if (body.phone) body.phone = normalizePhoneForDb(body.phone).phone;

      // 1) find by identity within company
      let realtor = null;
      if (body.email || body.phone) {
        realtor = await Realtor.findOne({
          company: body.company,
          $or: [
            body.email ? { email: body.email } : null,
            body.phone ? { phone: body.phone } : null
          ].filter(Boolean)
        });
      }

      // 2) if found, lightly patch blank identity fields
      if (realtor) {
        const patch = {};
        if (!realtor.firstName && body.firstName) patch.firstName = String(body.firstName).trim();
        if (!realtor.lastName  && body.lastName)  patch.lastName  = String(body.lastName).trim();
        if (!realtor.brokerage && body.brokerage) patch.brokerage = String(body.brokerage).trim();
        if (Object.keys(patch).length) {
          await Realtor.updateOne({ _id: realtor._id, company: body.company }, { $set: patch });
          realtor = await Realtor.findById(realtor._id).lean();
        } else {
          realtor = realtor.toObject?.() || realtor;
        }
        return res.status(201).json(realtor);
      }

      // 3) else create new
      const created = await Realtor.create(body);
      return res.status(201).json(created);

    } catch (err) {
      // 4) race: unique conflict → re-find and return existing
      if (err?.code === 11000) {
        try {
          const email = req.body.email ? normalizeEmail(req.body.email) : '';
        const phone = req.body.phone ? normalizePhoneForDb(req.body.phone).phone : '';
          const existing = await Realtor.findOne({
            company: req.user.company,
            $or: [
              email ? { email } : null,
              phone ? { phone } : null
            ].filter(Boolean)
          }).lean();
          if (existing) return res.status(201).json(existing);
        } catch (_) {}
      }
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
      if (updates.phone) updates.phone = normalizePhoneForDb(updates.phone).phone;

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
    const filePath = req.file.path;
    try {
      const buffer = await fs.promises.readFile(filePath);
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const sheet = wb.SheetNames[0];
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });

      let created = 0, updated = 0, skipped = 0, errors = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const firstName = toStr(r.FirstName || r['First Name'] || r.firstName);
        const lastName  = toStr(r.LastName  || r['Last Name']  || r.lastName);
        const email     = normalizeEmail(r.Email || r.email);
        const phoneData = normalizePhoneForDb(r.Phone || r.phone);
        const phone     = phoneData.phone;
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
    } finally {
      if (filePath) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
  }
);

///REALTOR ASSIGNMENT ROUTES///
// --- NEW: list "my" realtors -----------------------------------------------
// GET /api/realtors/mine?q=smith
router.get('/mine',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const q = toStr(req.query.q);
      const links = await RealtorAssignment.find({ company: req.user.company, userId: req.user._id })
        .populate({
          path: 'realtorId',
          select: 'firstName lastName email phone brokerage isActive',
          match: q ? {
            $or: [
              { firstName: { $regex: q, $options: 'i' } },
              { lastName:  { $regex: q, $options: 'i' } },
              { email:     { $regex: q, $options: 'i' } },
              { phone:     { $regex: q, $options: 'i' } },
              { brokerage: { $regex: q, $options: 'i' } },
            ]
          } : {}
        })
        .sort({ updatedAt: -1 })
        .lean();

      // flatten; drop unmatched populates
      const rows = links
        .filter(l => l.realtorId)
        .map(l => ({
          ...l.realtorId,
          _assignmentId: l._id,
          nickname: l.nickname,
          notes: l.notes,
          isFavorite: l.isFavorite,
          lastUsedAt: l.lastUsedAt
        }));

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch my realtors', details: err.message });
    }
  }
);

// --- NEW: link existing realtor to me --------------------------------------
// POST /api/realtors/:id/assign
router.post('/:id/assign',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

      await RealtorAssignment.updateOne(
        { company: req.user.company, userId: req.user._id, realtorId: id },
        {
          $setOnInsert: {
            nickname: req.body.nickname || '',
            notes: req.body.notes || ''
          },
          $set: { lastUsedAt: new Date() }
        },
        { upsert: true }
      );
      res.sendStatus(204);
    } catch (err) {
      res.status(500).json({ error: 'Failed to assign realtor', details: err.message });
    }
  }
);

// --- NEW: unlink from me (keep the realtor record) -------------------------
// DELETE /api/realtors/:id/unassign
router.delete('/:id/unassign',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

      await RealtorAssignment.deleteOne({ company: req.user.company, userId: req.user._id, realtorId: id });
      res.sendStatus(204);
    } catch (err) {
      res.status(500).json({ error: 'Failed to unassign realtor', details: err.message });
    }
  }
);

// --- NEW: create-or-link in one step (no duplicates) -----------------------
// POST /api/realtors/assign
router.post('/assign',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const company = req.user.company;

      // allow either realtorId, or identity fields (email/phone)
      const realtorId = toStr(req.body.realtorId);
      let realtor = null;

      if (realtorId && mongoose.Types.ObjectId.isValid(realtorId)) {
        realtor = await Realtor.findOne({ _id: realtorId, company }).lean();
        if (!realtor) return res.status(404).json({ error: 'Realtor not found' });
      } else {
        const email = normalizeEmail(req.body.email);
        const phone = normalizePhoneForDb(req.body.phone).phone;

        realtor = (email || phone)
          ? await Realtor.findOne({
              company,
              $or: [
                email ? { email } : null,
                phone ? { phone } : null
              ].filter(Boolean)
            })
          : null;

        if (!realtor) {
          realtor = await Realtor.create({
            company,
            firstName: req.body.firstName,
            lastName:  req.body.lastName,
            brokerage: req.body.brokerage,
            email,
            phone,
          });
        }
      }

      await RealtorAssignment.updateOne(
        { company, userId: req.user._id, realtorId: realtor._id },
        {
          $setOnInsert: {
            nickname: req.body.nickname || '',
            notes: req.body.notes || ''
          },
          $set: { lastUsedAt: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json(realtor);
    } catch (err) {
      // if unique conflict on Realtor, re-find and link
      if (err?.code === 11000) {
        const email = normalizeEmail(req.body.email);
        const phone = normalizePhoneForDb(req.body.phone).phone;
        const existing = await Realtor.findOne({
          company: req.user.company,
          $or: [
            email ? { email } : null,
            phone ? { phone } : null
          ].filter(Boolean)
        }).lean();
        if (existing) {
          await RealtorAssignment.updateOne(
            { company: req.user.company, userId: req.user._id, realtorId: existing._id },
            { $setOnInsert: { nickname: req.body.nickname || '', notes: req.body.notes || '' } },
            { upsert: true }
          );
          return res.status(201).json(existing);
        }
      }
      res.status(500).json({ error: 'Failed to assign realtor', details: err.message });
    }
  }
);

module.exports = router;
