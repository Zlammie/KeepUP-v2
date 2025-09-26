const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Contact   = require('../models/Contact');
const Lender    = require('../models/lenderModel');
const Community = require('../models/Community');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ───────────────────────── helpers ─────────────────────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

function toStr(v){ return (v ?? '').toString().trim(); }
function normalizePhone(v){ const s = toStr(v).replace(/[^\d]/g, ''); return s.length >= 10 ? s.slice(-10) : s; }
function parseDateMaybe(v){
  if (!v) return null;
  if (typeof v === 'number') { const base = new Date(Date.UTC(1899, 11, 30)); return new Date(base.getTime() + v * 86400000); }
  const s = toStr(v); const d = new Date(s); if (!isNaN(d)) return d;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m){ const [_, mm, dd, yy] = m; const yr = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return new Date(`${yr}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T00:00:00Z`);
  }
  return null;
}

// All routes below require auth
router.use(ensureAuth);

// Health check (optional)
router.get('/ping', requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'), (req, res) => res.send('pong'));

// ───────────────────────── create ─────────────────────────
// POST /api/contacts
router.post('/',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      // Stamp company server-side (non-super users cannot spoof)
      if (!isSuper(req)) req.body.company = req.user.company;

      // Normalize a few fields
      if (req.body.phone) req.body.phone = normalizePhone(req.body.phone);
      if (req.body.visitDate) req.body.visitDate = parseDateMaybe(req.body.visitDate);
      if (req.body.communityId === '') req.body.communityId = null;

      const doc = await Contact.create(req.body);
      res.status(201).json(doc);
    } catch (err) {
      res.status(400).json({ error: 'Failed to save contact', details: err.message });
    }
  }
);

// ───────────────────────── list/search ─────────────────────────
// GET /api/contacts?q=smith
router.get('/',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const q = toStr(req.query.q);
      const base = companyFilter(req);
      const filter = {
        ...base,
        ...(q ? { $or: [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName:  { $regex: q, $options: 'i' } },
          { email:     { $regex: q, $options: 'i' } },
          { phone:     { $regex: q, $options: 'i' } },
        ] } : {})
      };

      const contacts = await Contact.find(filter)
        .select('firstName lastName email phone status communityIds realtorId lenderId updatedAt')
        .populate('communityIds', 'name')
        .populate('realtorId', 'firstName lastName brokerage email phone')
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
        .sort({ updatedAt: -1 })
        .lean();

      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
    }
  }
);

// ───────────────────────── search lenders (helper) ─────────────────────────
// GET /api/contacts/search?q=...
router.get('/search',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const q = toStr(req.query.q);
    const regex = new RegExp(q, 'i');
    const results = await Lender.find({
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }, { phone: regex }]
    }).limit(10);
    res.json(results);
  }
);

// ───────────────────────── get one ─────────────────────────
// GET /api/contacts/:id
router.get('/:id',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const filter = { _id: id, ...companyFilter(req) };

      const contact = await Contact.findOne(filter)
        .select('firstName lastName email phone status notes communityIds realtorId lenderId lotId ownerId visitDate lenderStatus lenderInviteDate lenderApprovedDate updatedAt')
        .populate('communityIds', 'name')                                       // ✅ array of communities
        .populate('realtorId', 'firstName lastName brokerage email phone')      // ✅ real field
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')// ✅ real field
        .populate('lotId',     'jobNumber lot block address')
        .populate('ownerId',   'email firstName lastName')
        .lean();

      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      // Normalize a few props so existing frontend code can keep working
      res.json({
        ...contact,
        realtor: contact.realtorId || null,
        lender:  contact.lenderId  || null,
        communities: contact.communityIds || [],
        // if your UI expects lowercase status values:
        status: typeof contact.status === 'string' ? contact.status.toLowerCase() : contact.status,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contact', details: err.message });
    }
  }
);

// ───────────────────────── update ─────────────────────────
// PUT /api/contacts/:id
router.put('/:id',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const body = { ...req.body };
      if (body.communityId === '') body.communityId = null;
      if (body.phone) body.phone = normalizePhone(body.phone);
      if (body.visitDate) body.visitDate = parseDateMaybe(body.visitDate);

      // Never allow cross-tenant move
      delete body.company;
      const updated = await Contact.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        body,
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ error: 'Contact not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: 'Failed to update contact', details: err.message });
    }
  }
);

// ───────────────────────── delete ─────────────────────────
// DELETE /api/contacts/:id
router.delete('/:id',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const deleted = await Contact.findOneAndDelete({ _id: id, ...companyFilter(req) });
      if (!deleted) return res.status(404).json({ error: 'Contact not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete contact', details: err.message });
    }
  }
);
// GET /api/my/communities  → [{ _id, name }]
router.get('/my/communities',
  ensureAuth,
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const roles = req.user?.roles || [];
      const isSuper = roles.includes('SUPER_ADMIN');
      const isCompanyAdmin = roles.includes('COMPANY_ADMIN');

      // If the user has explicit allowedCommunityIds, use those; otherwise:
      // - Company Admin: all communities in their company
      // - Super Admin: communities in their current company (req.user.company)
      // - Regular user: none unless allowedCommunityIds set
      const allowedIds = (req.user.allowedCommunityIds || []).map(String);

      const base = { company: req.user.company };
      const filter =
        isCompanyAdmin || isSuper
          ? base
          : (allowedIds.length ? { ...base, _id: { $in: allowedIds } } : { ...base, _id: { $in: [] } });

      const communities = await Community.find(filter)
        .select('name')
        .sort({ name: 1 })
        .lean();

      res.json(communities);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load communities' });
    }
  }
);
// ───────────────────────── link lot to contact ─────────────────────────
// POST /api/contacts/:contactId/link-lot  { lotId }
router.post('/:contactId/link-lot',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { contactId } = req.params;
    const { lotId } = req.body;

    try {
      if (!isObjectId(contactId)) return res.status(400).json({ error: 'Invalid contactId' });
      const contact = await Contact.findOne({ _id: contactId, ...companyFilter(req) });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      if (!contact.communityId) return res.status(400).json({ error: 'Contact has no communityId' });
      const community = await Community.findOne({ _id: contact.communityId, ...companyFilter(req) }).lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const lot = (community.lots || []).find(l => String(l._id) === String(lotId));
      if (!lot) return res.status(404).json({ error: 'Lot not found in selected community' });

      // normalize lender entry statuses to lowercase (defensive)
      if (Array.isArray(contact.lenders)) {
        contact.lenders.forEach(entry => { if (entry.status) entry.status = String(entry.status).toLowerCase(); });
      }

      contact.linkedLot = {
        communityId: community._id,
        lotId:       lot._id,
        jobNumber:   lot.jobNumber,
        address:     lot.address,
        lot:         lot.lot,
        block:       lot.block,
        phase:       lot.phase,
        listPrice:   lot.listPrice || '',
        salesPrice:  lot.salesPrice || '',
        salesDate:   lot.salesDate || null
      };

      await contact.save();
      res.json({ success: true, contact });
    } catch (err) {
      console.error('Failed to link lot:', err);
      res.status(500).json({ error: 'Failed to link lot' });
    }
  }
);

// ───────────────────────── relations: by realtor/lender ─────────────────────────
// GET /api/contacts/by-realtor/:realtorId
router.get('/by-realtor/:realtorId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { realtorId } = req.params;
      if (!isObjectId(realtorId)) return res.status(400).json({ error: 'Invalid realtorId' });

      const contacts = await Contact.find({ realtorId, ...companyFilter(req) })
        .select('firstName lastName email phone')
        .lean();

      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
    }
  }
);

// GET /api/contacts/by-lender/:lenderId
router.get('/by-lender/:lenderId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { lenderId } = req.params;
      if (!isObjectId(lenderId)) return res.status(400).json({ error: 'Invalid lenderId' });

      const contacts = await Contact.find({ lenderId, ...companyFilter(req) })
        .select('firstName lastName email phone')
        .lean();

      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts by lender', details: err.message });
    }
  }
);

// ───────────────────────── lender links & updates ─────────────────────────
// PATCH /api/contacts/:contactId/lenders/:entryId
router.patch('/:contactId/lenders/:entryId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { contactId, entryId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(entryId)) return res.status(400).json({ error: 'Invalid id' });

      const filter = { _id: contactId, ...companyFilter(req), 'lenders._id': entryId };
      const { status, inviteDate, approvedDate } = req.body;

      const contact = await Contact.findOneAndUpdate(
        filter,
        { $set: {
          'lenders.$.status': status,
          'lenders.$.inviteDate': inviteDate,
          'lenders.$.approvedDate': approvedDate
        } },
        { new: true }
      ).populate('lenders.lender');

      if (!contact) return res.status(404).json({ error: 'Contact or lender entry not found' });
      const updatedEntry = contact.lenders.id(entryId);
      return res.json(updatedEntry);
    } catch (err) {
      console.error('Error updating lender info:', err);
      res.status(500).json({ error: 'Failed to update lender info' });
    }
  }
);

// PUT /api/contacts/:contactId/lenders/:lenderLinkId/primary
router.put('/:contactId/lenders/:lenderLinkId/primary',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { contactId, lenderLinkId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(lenderLinkId)) return res.status(400).json({ error: 'Invalid id' });

      const contact = await Contact.findOne({ _id: contactId, ...companyFilter(req) });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      contact.lenders.forEach(link => { link.isPrimary = (String(link._id) === String(lenderLinkId)); });
      await contact.save();
      await contact.populate('lenders.lender');
      res.json(contact);
    } catch (err) {
      console.error('Failed to set primary lender:', err);
      res.status(500).json({ error: 'Could not set primary lender' });
    }
  }
);

// DELETE /api/contacts/:contactId/lenders/:lenderLinkId
router.delete('/:contactId/lenders/:lenderLinkId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { contactId, lenderLinkId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(lenderLinkId)) return res.status(400).json({ error: 'Invalid id' });

      const updated = await Contact.findOneAndUpdate(
        { _id: contactId, ...companyFilter(req) },
        { $pull: { lenders: { _id: lenderLinkId } } },
        { new: true }
      )
        .populate('realtor')
        .populate('lenders.lender');

      if (!updated) return res.status(404).json({ error: 'Contact not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error unlinking lender:', err);
      res.status(500).json({ error: 'Failed to unlink lender' });
    }
  }
);

// PATCH /api/contacts/:contactId/link-lender
router.patch('/:contactId/link-lender',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { contactId } = req.params;
      if (!isObjectId(contactId)) return res.status(400).json({ error: 'Invalid id' });

      const { lenderId, status, inviteDate, approvedDate } = req.body;

      const updated = await Contact.findOneAndUpdate(
        { _id: contactId, ...companyFilter(req) },
        { $push: { lenders: { lender: lenderId, status, inviteDate, approvedDate } } },
        { new: true }
      ).populate('realtor').populate('lenders.lender');

      if (!updated) return res.status(404).json({ error: 'Contact not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error linking lender:', err);
      res.status(500).json({ error: 'Failed to link lender' });
    }
  }
);

// PATCH /api/contacts/:id/unlink-lender
router.patch('/:id/unlink-lender',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const contact = await Contact.findOne({ _id: id, ...companyFilter(req) });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      contact.lenders = [];
      await contact.save();
      res.json({ success: true });
    } catch (err) {
      console.error('Unlink error:', err);
      res.status(500).json({ error: 'Failed to unlink lender' });
    }
  }
);

// ───────────────────────── import ─────────────────────────
// POST /api/contacts/import
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
        const email     = toStr(r.Email     || r.email);
        const phone     = normalizePhone(r.Phone || r.phone);
        const visitDate = parseDateMaybe(r.VisitDate || r['Visit Date'] || r.visitDate);

        if (!firstName && !lastName && !email && !phone) { skipped++; continue; }

        const filter = email ? { company: req.user.company, email } :
                       phone ? { company: req.user.company, phone } : null;
        if (!filter) { skipped++; continue; }

        const set = { firstName, lastName };
        if (email) set.email = email;
        if (phone) set.phone = phone;
        if (visitDate) set.visitDate = visitDate;

        // Stamp company on upsert
        const result = await Contact.updateOne(
          filter,
          { $set: set, $setOnInsert: isSuper(req) ? { company: req.body.company || req.user.company } : { company: req.user.company } },
          { upsert: true }
        );
        if (result.upsertedCount && result.upsertedId) created++;
        else if (result.matchedCount) updated++;
        else skipped++;
      }

      res.json({ success: true, created, updated, skipped, errors });
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'Failed to import contacts', details: err.message });
    }
  }
);

module.exports = router;
