const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Contact   = require('../models/Contact');
const Lender    = require('../models/lenderModel');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const Realtor   = require('../models/Realtor');

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
const toIsoStringOrNull = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.valueOf()) ? null : d.toISOString();
};
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

function toStatusCase(v){
  const norm = toStr(v);
  if (!norm) return '';
  return norm
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
}

// All routes below require auth
router.use(ensureAuth);

// Health check (optional)
router.get('/ping', requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'), (req, res) => res.send('pong'));

// ───────────────────────── create ─────────────────────────
// POST /api/contacts
router.post(
  '/',
  requireRole('USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      // 1) Company scope (non-super users cannot pick a different company)
      const roles = req.user?.roles || [];
      const isSuper = roles.includes('SUPER_ADMIN');
      const company = isSuper ? (req.body.company || req.user.company) : req.user.company;
      if (!company) return res.status(400).json({ error: 'Company context required' });

      // 2) Normalize inputs
           const firstName = (req.body.firstName || '').trim();
      const lastName  = (req.body.lastName  || '').trim();
      const emailRaw  = (req.body.email || '').trim();
      const phoneRaw  = (req.body.phone || '').toString();
      const emailNorm = emailRaw.toLowerCase();
      const phoneNorm = phoneRaw.replace(/\D+/g, '');
      const visitDate = req.body.visitDate ? new Date(req.body.visitDate) : null;

      // 3) Dedupe key is ONLY inside this company
      const filter =
       emailNorm ? { company, emailNorm } :
        phoneNorm ? { company, phoneNorm } : null;

      // 4) No dedupe keys → create new in this company
      if (!filter) {
        const created = await Contact.create({
          company, firstName, lastName,
          email: emailRaw, phone: phoneRaw,
          emailNorm, phoneNorm, visitDate
        });
        return res.status(201).json({ created: true, contact: created });
      }

      // 5) Look for existing contact in THIS company only
      const existing = await Contact.findOne(filter).lean();

      // 5a) If nothing in this company → create a new one (even if the same email exists in another company)
      if (!existing) {
        const created = await Contact.create({
          company, firstName, lastName,
          email: emailRaw, phone: phoneRaw,
          emailNorm, phoneNorm, visitDate
        });
        return res.status(201).json({ created: true, contact: created });
      }

      // 6) Same-company “associate” behavior (never cross-company):
      const $set = {};
      if (firstName && !existing.firstName) $set.firstName = firstName;
      if (lastName  && !existing.lastName)  $set.lastName  = lastName;
       if (emailNorm && !existing.emailNorm) { $set.email = emailRaw; $set.emailNorm = emailNorm; }
       if (phoneNorm && !existing.phoneNorm) { $set.phone = phoneRaw; $set.phoneNorm = phoneNorm; }
      if (visitDate && !existing.visitDate) $set.visitDate = visitDate;
      if (!existing.ownerId)                $set.ownerId   = req.user._id;

      const attached = await Contact.findOneAndUpdate(
        { _id: existing._id, company },
        Object.keys($set).length ? { $set } : {},
        { new: true }
      ).lean();

      return res.json({ created: false, attached: true, contact: attached || existing });
    } catch (err) {
      if (String(err?.code) === '11000') {
        // If this still hits, you likely have a legacy global unique index (email_1/phone_1).
        return res.status(409).json({ error: 'Duplicate (index)', details: err.message });
      }
      console.error('POST /api/contacts error', err);
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
        .select('firstName lastName email phone status communityIds realtorId lenderId lenders updatedAt')
        .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')
        .populate('realtorId', 'firstName lastName brokerage email phone')
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
        .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
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
    if (!q) return res.json([]);
    const regex = new RegExp(q, 'i');
    const results = await Lender.find({
      ...companyFilter(req),
      $or: [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex }
      ]
    }).limit(10).lean();
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
        .select('firstName lastName email phone status notes source communityIds floorplans realtorId lenderId lotId ownerId visitDate lotLineUp buyTime buyMonth facing living investor renting ownSelling ownNotSelling lenderStatus lenderInviteDate lenderApprovedDate lenders updatedAt')
        .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')                                       // ✅ array of communities
        .populate('realtorId', 'firstName lastName brokerage email phone')      // ✅ real field
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')// ✅ real field
        .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone') // lender details
        .populate('lotId',     'jobNumber lot block address')
        .populate('ownerId',   'email firstName lastName')
        .lean();
      if (contact) contact.visitDate = toIsoStringOrNull(contact.visitDate);

      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      // Normalize a few props so existing frontend code can keep working
      res.json({
        ...contact,
        realtor: contact.realtorId || null,
        lender:  contact.lenderId  || null,
        communities: contact.communityIds || [],
        floorplans: contact.floorplans || [],
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
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const b = req.body;
      const $set = {};
      const $unset = {};

      // --- Realtor: accept 'realtorId' or legacy 'realtor' → save to realtorId
      if (Object.prototype.hasOwnProperty.call(b, 'realtorId') ||
          Object.prototype.hasOwnProperty.call(b, 'realtor')) {
        const raw = String(b.realtorId || b.realtor || '').trim();
        if (!raw) {
          $unset.realtorId = '';
        } else {
          const ok = await Realtor.exists({ _id: raw, company: req.user.company });
          if (!ok) return res.status(400).json({ error: 'Realtor not found in your company' });
          $set.realtorId = raw;
        }
      }

      // --- Communities: update ONLY if client asked to
      const wantsCommunityUpdate =
        Object.prototype.hasOwnProperty.call(b, 'communityIds') ||
        Object.prototype.hasOwnProperty.call(b, 'communities')  ||
        Object.prototype.hasOwnProperty.call(b, 'communityId');

      if (wantsCommunityUpdate) {
        let ids = [];
        if (Array.isArray(b.communityIds)) ids = b.communityIds;
        else if (typeof b.communityIds === 'string') {
          try { ids = JSON.parse(b.communityIds); } catch { ids = [b.communityIds]; }
        }
        if (!ids.length && Array.isArray(b.communities)) ids = b.communities;
        else if (!ids.length && typeof b.communities === 'string') {
          try { ids = JSON.parse(b.communities); } catch { ids = [b.communities]; }
        }
        if (!ids.length && b.communityId) ids = [b.communityId];

        ids = ids.filter(Boolean).map(String);

        const allowed = await Community.find({
          _id: { $in: ids },
          company: req.user.company
        }).select('_id').lean();

        const toSave = allowed.map(c => c._id);
        if (ids.length && !toSave.length) {
          return res.status(400).json({ error: 'Selected communities are not in your company.' });
        }
        $set.communityIds = toSave;
      }

      const floorplanPayload = Object.prototype.hasOwnProperty.call(b, 'floorplans') ? b.floorplans : (Object.prototype.hasOwnProperty.call(b, 'floorPlans') ? b.floorPlans : undefined);
      if (floorplanPayload !== undefined) {
        let planIds = [];
        if (Array.isArray(floorplanPayload)) {
          planIds = floorplanPayload;
        } else if (typeof floorplanPayload === 'string') {
          try {
            const parsed = JSON.parse(floorplanPayload);
            planIds = Array.isArray(parsed) ? parsed : [floorplanPayload];
          } catch {
            planIds = floorplanPayload.split(',');
          }
        }
        planIds = planIds.filter(Boolean).map(id => id.toString().trim()).filter(Boolean);

        if (planIds.length) {
          const allowedPlans = await FloorPlan.find({ _id: { $in: planIds }, ...companyFilter(req) })
            .select('_id')
            .lean();
          if (allowedPlans.length !== planIds.length) {
            return res.status(400).json({ error: 'Selected floor plans are not in your company.' });
          }
          $set.floorplans = allowedPlans.map(p => p._id);
        } else {
          $set.floorplans = [];
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'visitDate')) {
        const parsedDate = parseDateMaybe(b.visitDate);
        if (!parsedDate) {
          $unset.visitDate = '';
          delete $set.visitDate;
        } else {
          $set.visitDate = parsedDate;
          if (Object.prototype.hasOwnProperty.call($unset, 'visitDate')) delete $unset.visitDate;
        }
      }

      const textFields = ['firstName','lastName','owner','source','lotLineUp','buyTime','buyMonth'];
      for (const field of textFields) {
        if (Object.prototype.hasOwnProperty.call(b, field)) {
          const value = toStr(b[field]);
          if (!value) {
            $unset[field] = '';
            delete $set[field];
          } else {
            $set[field] = value;
            if (Object.prototype.hasOwnProperty.call($unset, field)) delete $unset[field];
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'email')) {
        const email = toStr(b.email).toLowerCase();
        if (!email) {
          $unset.email = '';
          delete $set.email;
        } else {
          $set.email = email;
          if (Object.prototype.hasOwnProperty.call($unset, 'email')) delete $unset.email;
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'phone')) {
        const phone = normalizePhone(b.phone);
        if (!phone) {
          $unset.phone = '';
          delete $set.phone;
        } else {
          $set.phone = phone;
          if (Object.prototype.hasOwnProperty.call($unset, 'phone')) delete $unset.phone;
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'facing')) {
        const facingInput = Array.isArray(b.facing) ? b.facing : String(b.facing).split(',');
        const facing = facingInput.map(toStr).filter(Boolean);
        if (!facing.length) {
          $unset.facing = '';
          delete $set.facing;
        } else {
          $set.facing = facing;
          if (Object.prototype.hasOwnProperty.call($unset, 'facing')) delete $unset.facing;
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'living')) {
        const livingInput = Array.isArray(b.living) ? b.living : String(b.living).split(',');
        const living = livingInput.map(toStr).filter(Boolean);
        if (!living.length) {
          $unset.living = '';
          delete $set.living;
        } else {
          $set.living = living;
          if (Object.prototype.hasOwnProperty.call($unset, 'living')) delete $unset.living;
        }
      }

      ['investor','renting','ownSelling','ownNotSelling'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(b, field)) {
          $set[field] = !!b[field];
          if (Object.prototype.hasOwnProperty.call($unset, field)) delete $unset[field];
        }
      });

      if (Object.prototype.hasOwnProperty.call(b, 'status')) {
        const statusValue = toStatusCase(b.status);
        if (statusValue) {
          $set.status = statusValue;
        }
      }

      // --- Build update doc
      const updateDoc = {};
      if (Object.keys($set).length)   updateDoc.$set   = $set;
      if (Object.keys($unset).length) updateDoc.$unset = $unset;

      // If nothing to update, return current doc
      if (!Object.keys(updateDoc).length) {
        const current = await Contact.findOne({ _id: id, ...companyFilter(req) })
          .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')
          .populate('realtorId', 'firstName lastName brokerage email phone')
          .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
          .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
          .populate('lotId',     'jobNumber lot block address')
          .populate('ownerId',   'email firstName lastName')
          .lean();
        if (current) current.visitDate = toIsoStringOrNull(current.visitDate);
        return res.json({
          ...current,
          status: typeof current?.status === 'string' ? current.status.toLowerCase() : current?.status,
          communities: current?.communityIds || [],
          floorplans: current?.floorplans || [],
          realtor: current?.realtorId || null,
        });
      }

      // --- Apply update and return normalized payload
      const updated = await Contact.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        updateDoc,
        { new: true }
      )
        .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')
        .populate('realtorId', 'firstName lastName brokerage email phone')
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
        .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
        .populate('lotId',     'jobNumber lot block address')
        .populate('ownerId',   'email firstName lastName')
        .lean();
      if (updated) updated.visitDate = toIsoStringOrNull(updated.visitDate);

      if (!updated) return res.status(404).json({ error: 'Contact not found' });

      return res.json({
        ...updated,
        status: typeof updated.status === 'string' ? updated.status.toLowerCase() : updated.status,
        communities: updated.communityIds || [],
        floorplans: updated.floorplans || [],
        realtor: updated.realtorId || null,
      });
    } catch (err) {
      console.error('PUT /api/contacts/:id failed:', err);
      res.status(500).json({ error: 'Failed to update contact', details: err.message });
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
        .populate('realtorId', 'firstName lastName brokerage email phone')
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
       ).populate('realtorId','firstName lastName brokerage email phone')
        .populate('lenders.lender');

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
        const emailRaw  = toStr(r.Email || r.email);
        const phoneRaw  = normalizePhone(r.Phone || r.phone);
        const emailNorm = emailRaw.toLowerCase();
        const phoneNorm = phoneRaw; // normalizePhone already digits-only
        const visitDate = parseDateMaybe(r.VisitDate || r['Visit Date'] || r.visitDate);

        if (!firstName && !lastName && !emailRaw && !phoneNorm) { skipped++; continue; }

         const filter = emailNorm ? { company: req.user.company, emailNorm } :
                       phoneNorm ? { company: req.user.company, phoneNorm } : null;
        if (!filter) { skipped++; continue; }

        const set = { firstName, lastName };
        if (emailNorm) { set.email = emailRaw; set.emailNorm = emailNorm; }
       if (phoneNorm) { set.phone = phoneRaw; set.phoneNorm = phoneNorm; }
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
