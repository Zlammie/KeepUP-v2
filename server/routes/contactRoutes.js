const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const router = express.Router();

const Contact   = require('../models/Contact');
const Lender    = require('../models/lenderModel');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const Realtor   = require('../models/Realtor');
const Task      = require('../models/Task');
const AutoFollowUpSchedule = require('../models/AutoFollowUpSchedule');
const { applyTaskAttentionFlags } = require('../utils/taskAttention');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');

const xlsx = require('xlsx');
const {
  getAllowedCommunityIds,
  filterCommunitiesForUser,
  hasCommunityAccess,
} = require('../utils/communityScope');
const { normalizePhoneForDb } = require('../utils/phone');

// ───────────────────────── helpers ─────────────────────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });
const isCompanyAdmin = req => (req.user?.roles || []).includes('COMPANY_ADMIN');
const READ_ROLES = ['READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const WRITE_ROLES = ['USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const ADMIN_ROLES = ['MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];

const toObjectId = (value) => {
  if (value == null) return null;
  const str = String(value);
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

function buildContactAccessFilter(req) {
  const base = companyFilter(req);
  if (isSuper(req)) return base;

  const allowedStrings = getAllowedCommunityIds(req.user || {});
  const allowedObjectIds = allowedStrings
    .map(toObjectId)
    .filter(Boolean);

  const ownerObjectId = toObjectId(req.user?._id);

  if (!allowedObjectIds.length) {
    if (isCompanyAdmin(req)) {
      return { ...base };
    }
    if (ownerObjectId) {
      return { ...base, ownerId: ownerObjectId };
    }
    return { ...base, _id: { $in: [] } };
  }

  const orClauses = [{ communityIds: { $in: allowedObjectIds } }];
  if (ownerObjectId) orClauses.push({ ownerId: ownerObjectId });

  return { ...base, $or: orClauses };
}

function cloneFilter(filter = {}) {
  const clone = { ...filter };
  if (filter.$and) clone.$and = [...filter.$and];
  if (filter.$or) clone.$or = [...filter.$or];
  return clone;
}

function contactQuery(req, extra = {}) {
  const baseFilter = buildContactAccessFilter(req);
  const merged = cloneFilter(baseFilter);
  if (extra && Object.keys(extra).length) {
    if (merged.$and) merged.$and.push(extra);
    else merged.$and = [extra];
  }
  return merged;
}

function toStr(v){ return (v ?? '').toString().trim(); }
const toIsoStringOrNull = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.valueOf()) ? null : d.toISOString();
};
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

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toStatusCase(v){
  const norm = toStr(v);
  if (!norm) return '';
  return norm
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
}

function splitMulti(value = '') {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function loadImportableCommunities(req) {
  const roles = req.user?.roles || [];
  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  const isCompanyAdmin = roles.includes('COMPANY_ADMIN');
  const enforceScope = !isSuperAdmin && !isCompanyAdmin;

  const baseFilter = { company: req.user.company };
  let filter = { ...baseFilter };

  if (enforceScope) {
    const allowed = getAllowedCommunityIds(req.user || [])
      .map(toObjectId)
      .filter(Boolean);
    if (!allowed.length) {
      return { list: [], nameMap: new Map(), idSet: new Set(), enforceScope };
    }
    filter = { ...baseFilter, _id: { $in: allowed } };
  }

  const list = await Community.find(filter).select('_id name').lean();
  const nameMap = new Map();
  const idSet = new Set();
  list.forEach((c) => {
    if (!c) return;
    if (c._id) idSet.add(c._id.toString());
    if (c.name) nameMap.set(c.name.trim().toLowerCase(), c._id);
  });

  return { list, nameMap, idSet, enforceScope };
}

// All routes below require auth
router.use(ensureAuth);

function extractCommunityIdStrings(body = {}) {
  let ids = [];
  if (Array.isArray(body.communityIds)) ids = body.communityIds;
  else if (typeof body.communityIds === 'string' && body.communityIds) {
    try {
      const parsed = JSON.parse(body.communityIds);
      ids = Array.isArray(parsed) ? parsed : [body.communityIds];
    } catch {
      ids = [body.communityIds];
    }
  }

  if (!ids.length) {
    if (Array.isArray(body.communities)) ids = body.communities;
    else if (typeof body.communities === 'string' && body.communities) {
      try {
        const parsed = JSON.parse(body.communities);
        ids = Array.isArray(parsed) ? parsed : [body.communities];
      } catch {
        ids = [body.communities];
      }
    }
  }

  if (!ids.length && body.communityId) ids = [body.communityId];
  if (!ids.length && body.community) ids = [body.community];
  return ids.filter(Boolean).map(String);
}

async function resolveCommunityIdsFromBody(req, body = {}) {
  const ids = extractCommunityIdStrings(body);
  if (!ids.length) return [];

  const candidates = await Community.find({
    _id: { $in: ids },
    company: req.user.company
  })
    .select('_id name')
    .lean();

  if (candidates.length !== ids.length) {
    const err = new Error('Selected communities were not found in your company.');
    err.statusCode = 400;
    throw err;
  }

  if (isSuper(req)) {
    return candidates.map((c) => c._id);
  }

  const scoped = filterCommunitiesForUser(req.user, candidates);
  if (scoped.length !== candidates.length) {
    const err = new Error('You do not have access to one or more selected communities.');
    err.statusCode = 403;
    throw err;
  }

  return scoped.map((c) => c._id);
}

function mergeCommunityIdLists(existing = [], additions = []) {
  const seen = new Set();
  const merged = [];
  const pushValue = (value) => {
    if (!value) return;
    const str = value.toString();
    if (seen.has(str)) return;
    seen.add(str);
    merged.push(value);
  };

  existing.forEach(pushValue);
  const beforeAddSize = seen.size;
  additions.forEach(pushValue);
  const changed = seen.size !== beforeAddSize;
  return { merged, changed };
}

// Health check (optional)
router.get('/ping', requireRole(...READ_ROLES), (req, res) => res.send('pong'));

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
      const phoneNormalized = normalizePhoneForDb(req.body.phone);
      const phoneRaw = phoneNormalized.phone;
      const emailNorm = emailRaw.toLowerCase();
      const phoneNorm = phoneNormalized.phoneNorm;
      const visitDate = req.body.visitDate ? new Date(req.body.visitDate) : null;
      const statusProvided = Object.prototype.hasOwnProperty.call(req.body, 'status');
      const requestedStatus = toStatusCase(req.body.status);
      const statusValue = (statusProvided && requestedStatus === '') ? '' : (requestedStatus || 'New');
      const sourceValue = toStr(req.body.source || req.body.leadSource);

      let communityIdsSelection = [];
      try {
        communityIdsSelection = await resolveCommunityIdsFromBody(req, req.body);
      } catch (communityErr) {
        return res
          .status(communityErr.statusCode || 400)
          .json({ error: communityErr.message || 'Invalid community selection' });
      }

      // 3) Dedupe key is ONLY inside this company
      const filter =
       emailNorm ? { company, emailNorm } :
        phoneNorm ? { company, phoneNorm } : null;

      // 4) No dedupe keys → create new in this company
      if (!filter) {
        const created = await Contact.create({
          company, firstName, lastName,
          email: emailRaw, phone: phoneRaw,
          emailNorm, phoneNorm, visitDate,
          status: statusValue,
          ownerId: req.user._id,
          source: sourceValue || undefined,
          communityIds: communityIdsSelection
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
          emailNorm, phoneNorm, visitDate,
          status: statusValue,
          ownerId: req.user._id,
          source: sourceValue || undefined,
          communityIds: communityIdsSelection
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
      if (requestedStatus && (!existing.status || String(existing.status).trim().toLowerCase() === 'new')) {
        $set.status = requestedStatus;
      }

      if (sourceValue && !existing.source) {
        $set.source = sourceValue;
      }

      if (communityIdsSelection.length) {
        const existingCommunities = Array.isArray(existing.communityIds) ? existing.communityIds : [];
        const { merged, changed } = mergeCommunityIdLists(existingCommunities, communityIdsSelection);
        if (changed) {
          $set.communityIds = merged;
        }
      }

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
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const q = toStr(req.query.q);
      const accessFilter = buildContactAccessFilter(req);
      if (accessFilter._id && accessFilter._id.$in && accessFilter._id.$in.length === 0) {
        return res.json([]);
      }

      const filter = cloneFilter(accessFilter);
      if (q) {
        const textClause = {
          $or: [
            { firstName: { $regex: q, $options: 'i' } },
            { lastName:  { $regex: q, $options: 'i' } },
            { email:     { $regex: q, $options: 'i' } },
            { phone:     { $regex: q, $options: 'i' } },
          ]
        };
        if (filter.$and) filter.$and.push(textClause);
        else filter.$and = [textClause];
      }

      const contacts = await Contact.find(filter)
        .select('firstName lastName email phone status visitDate communityIds realtorId lenderId lenders updatedAt flagged company financeType fundsVerified fundsVerifiedDate')
        .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')
        .populate('realtorId', 'firstName lastName brokerage email phone')
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
        .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
        .sort({ updatedAt: -1 })
        .lean();

      await applyTaskAttentionFlags(contacts, {
        linkedModel: 'Contact',
        fallbackCompanyId: req.user?.company || null
      });
      contacts.forEach((contact) => {
        contact.visitDate = toIsoStringOrNull(contact.visitDate);
      });
      contacts.forEach((contact) => {
        if (contact && Object.prototype.hasOwnProperty.call(contact, 'company')) {
          delete contact.company;
        }
      });

      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
    }
  }
);

// ───────────────────────── search lenders (helper) ─────────────────────────
// GET /api/contacts/search?q=...
router.get('/search',
  requireRole(...READ_ROLES),
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
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const contact = await Contact.findOne(contactQuery(req, { _id: new mongoose.Types.ObjectId(id) }))
        .select('firstName lastName email phone status notes source communityIds floorplans realtorId lenderId lotId ownerId visitDate lotLineUp buyTime buyMonth facing living investor renting ownSelling ownNotSelling lenderStatus lenderInviteDate lenderApprovedDate lenders updatedAt followUpSchedule beBackDate statusHistory financeType fundsVerified fundsVerifiedDate')
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
        beBackDate: toIsoStringOrNull(contact.beBackDate),
        statusHistory: contact.statusHistory || [],
        // if your UI expects lowercase status values:
        status: typeof contact.status === 'string' ? contact.status.toLowerCase() : contact.status,
        followUpSchedule: contact.followUpSchedule || null
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contact', details: err.message });
    }
  }
);

// ───────────────────────── update ─────────────────────────
// PUT /api/contacts/:id
router.put('/:id',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
      const contactObjectId = new mongoose.Types.ObjectId(id);

      const existing = await Contact.findOne(contactQuery(req, { _id: contactObjectId }))
        .select('status statusHistory beBackDate lotLineUp company communityIds floorplans')
        .lean();
      if (!existing) return res.status(404).json({ error: 'Contact not found' });

      const historyEntries = [];
      const previousStatus = existing.status || '';
      let beBackDateValue = null;
      const previousCommunityIds = Array.isArray(existing.communityIds)
        ? existing.communityIds.map((id) => id.toString())
        : [];
      const previousFloorplanIds = Array.isArray(existing.floorplans)
        ? existing.floorplans.map((id) => id.toString())
        : [];
      const prevFloorplanIdsSorted = [...previousFloorplanIds].sort();

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
      let communityNamesForHistory = null;
      let nextFloorplanIds = null;
      let floorplanNamesForHistory = null;

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

        const candidates = await Community.find({
          _id: { $in: ids },
          company: req.user.company
        }).select('_id name').lean();

        if (ids.length && candidates.length !== ids.length) {
          return res.status(400).json({ error: 'Selected communities are not in your company.' });
        }

        const scoped = filterCommunitiesForUser(req.user, candidates);
        if (ids.length && scoped.length !== candidates.length && !isSuper(req)) {
          return res.status(403).json({ error: 'You do not have access to one or more selected communities.' });
        }

        const toSave = scoped.map(c => c._id);
        communityNamesForHistory = scoped.map((c) => c.name).filter(Boolean);
        $set.communityIds = toSave;

        // Only record history when the assigned communities actually change
        const nextIds = toSave.map((id) => id.toString()).sort();
        const prevIdsSorted = [...previousCommunityIds].sort();
        const changedLength = nextIds.length !== prevIdsSorted.length;
        const changedValues =
          changedLength || nextIds.some((val, idx) => val !== prevIdsSorted[idx]);
        if (changedValues) {
          const actorName = [req.user?.firstName, req.user?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || req.user?.email || null;
          const entry = {
            status: 'Community Assigned',
            detail: communityNamesForHistory?.length
              ? `Assigned to ${communityNamesForHistory.join(', ')}`
              : 'Communities cleared',
            changedAt: new Date(),
            occurredAt: new Date(),
            changedBy: req.user?._id || null
          };
          if (actorName) entry.changedByName = actorName;
          historyEntries.push(entry);
        }
      }

      if (nextFloorplanIds) {
        const nextSorted = [...nextFloorplanIds].sort();
        const changedLength = nextSorted.length !== prevFloorplanIdsSorted.length;
        const changedValues =
          changedLength || nextSorted.some((val, idx) => val !== prevFloorplanIdsSorted[idx]);
        if (changedValues) {
          const actorName = [req.user?.firstName, req.user?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || req.user?.email || null;
          const detail =
            floorplanNamesForHistory && floorplanNamesForHistory.length
              ? `Floor plans set to ${floorplanNamesForHistory.join(', ')}`
              : 'Floor plans cleared';
          const entry = {
            status: 'Floor Plans Updated',
            detail,
            changedAt: new Date(),
            occurredAt: new Date(),
            changedBy: req.user?._id || null
          };
          if (actorName) entry.changedByName = actorName;
          historyEntries.push(entry);
        }
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
            .select('_id name planNumber')
            .lean();
          if (!allowedPlans.length) {
            $set.floorplans = [];
            nextFloorplanIds = [];
            floorplanNamesForHistory = [];
          } else {
            const toSave = allowedPlans.map((p) => p._id);
            // If some requested plans are missing, proceed with the ones the user can access.
            const missing = planIds.filter(
              (id) => !allowedPlans.find((p) => String(p._id) === String(id))
            );
            if (missing.length) {
              console.warn(
                '[contact:update] dropping unavailable floor plans',
                missing,
                'for company',
                req.user?.company
              );
            }
            $set.floorplans = toSave;
            nextFloorplanIds = toSave.map((id) => id.toString());
            floorplanNamesForHistory = allowedPlans
              .map((p) => p.name || p.planNumber || p._id?.toString())
              .filter(Boolean);
          }
        } else {
          $set.floorplans = [];
          nextFloorplanIds = [];
          floorplanNamesForHistory = [];
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

      if (
        Object.prototype.hasOwnProperty.call(b, 'beBackDate') ||
        Object.prototype.hasOwnProperty.call(b, 'beBackOn')
      ) {
        const rawBeBack = b.beBackDate ?? b.beBackOn;
        const parsedBeBack = parseDateMaybe(rawBeBack);
        if (parsedBeBack) {
          beBackDateValue = parsedBeBack;
          $set.beBackDate = parsedBeBack;
          if (Object.prototype.hasOwnProperty.call($unset, 'beBackDate')) delete $unset.beBackDate;
        } else {
          $unset.beBackDate = '';
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
        const normalizedPhone = normalizePhoneForDb(b.phone);
        const phone = normalizedPhone.phone;
        if (!phone) {
          $unset.phone = '';
          $unset.phoneNorm = '';
          delete $set.phone;
          if (Object.prototype.hasOwnProperty.call($set, 'phoneNorm')) delete $set.phoneNorm;
        } else {
          $set.phone = phone;
          $set.phoneNorm = normalizedPhone.phoneNorm;
          if (Object.prototype.hasOwnProperty.call($unset, 'phone')) delete $unset.phone;
          if (Object.prototype.hasOwnProperty.call($unset, 'phoneNorm')) delete $unset.phoneNorm;
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
        const rawStatus = b.status;
        const statusValue = toStatusCase(rawStatus);
        if (statusValue) {
          $set.status = statusValue;
          const normalizedNext = String(statusValue || '').trim().toLowerCase();
          const normalizedPrev = String(previousStatus || '').trim().toLowerCase();
          const statusChanged = normalizedNext !== normalizedPrev;

          if (normalizedNext === 'be-back' && !beBackDateValue) {
            beBackDateValue = new Date();
            $set.beBackDate = beBackDateValue;
          }

          if (statusChanged || (normalizedNext === 'be-back' && beBackDateValue)) {
            const actorName = [req.user?.firstName, req.user?.lastName]
              .filter(Boolean)
              .join(' ')
              .trim() || req.user?.email || null;
            historyEntries.push({
              status: statusValue,
              changedAt: new Date(),
              occurredAt:
                normalizedNext === 'be-back'
                  ? (beBackDateValue ? new Date(beBackDateValue) : new Date())
                  : new Date(),
              changedBy: req.user?._id || null
            });
            if (actorName) historyEntries[historyEntries.length - 1].changedByName = actorName;
          }
        } else if (
          rawStatus === '' ||
          rawStatus === null ||
          (typeof rawStatus === 'string' && rawStatus.trim() === '')
        ) {
          $set.status = '';
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'lotLineUp')) {
        const incomingLotLine = toStr(b.lotLineUp);
        const currentLotLine = toStr(existing.lotLineUp);
        if (incomingLotLine && incomingLotLine !== currentLotLine) {
          const actorName = [req.user?.firstName, req.user?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || req.user?.email || null;
          const entry = {
            status: 'Lot Lineup Added',
            detail: incomingLotLine,
            changedAt: new Date(),
            occurredAt: new Date(),
            changedBy: req.user?._id || null
          };
          if (actorName) entry.changedByName = actorName;
          historyEntries.push(entry);
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'financeType')) {
        const ft = String(b.financeType || '').trim().toLowerCase();
        if (ft === 'cash' || ft === 'financed') {
          $set.financeType = ft;
          if (ft === 'financed' && Object.prototype.hasOwnProperty.call($unset, 'financeType')) delete $unset.financeType;
        } else if (!ft) {
          $unset.financeType = '';
        }
      }

      if (Object.prototype.hasOwnProperty.call(b, 'fundsVerified')) {
        $set.fundsVerified = !!b.fundsVerified;
        if (Object.prototype.hasOwnProperty.call($unset, 'fundsVerified')) delete $unset.fundsVerified;
      }

      if (Object.prototype.hasOwnProperty.call(b, 'fundsVerifiedDate')) {
        const parsed = parseDateMaybe(b.fundsVerifiedDate);
        if (!parsed) {
          $unset.fundsVerifiedDate = '';
          delete $set.fundsVerifiedDate;
        } else {
          $set.fundsVerifiedDate = parsed;
          if (Object.prototype.hasOwnProperty.call($unset, 'fundsVerifiedDate')) delete $unset.fundsVerifiedDate;
        }
      }

      // --- Build update doc
      const updateDoc = {};
      if (Object.keys($set).length)   updateDoc.$set   = $set;
      if (Object.keys($unset).length) updateDoc.$unset = $unset;
      if (historyEntries.length) {
        updateDoc.$push = { statusHistory: { $each: historyEntries } };
      }

      // If nothing to update, return current doc
      if (!Object.keys(updateDoc).length) {
        const current = await Contact.findOne(contactQuery(req, { _id: contactObjectId }))
          .populate('communityIds', 'name')
        .populate('floorplans', 'name planNumber')
          .populate('realtorId', 'firstName lastName brokerage email phone')
          .populate('lenderId',  'firstName lastName lenderBrokerage email phone')
          .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
          .populate('lotId',     'jobNumber lot block address')
          .populate('ownerId',   'email firstName lastName')
          .lean();
        if (current) {
          current.visitDate = toIsoStringOrNull(current.visitDate);
          current.beBackDate = toIsoStringOrNull(current.beBackDate);
        }
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
        contactQuery(req, { _id: contactObjectId }),
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
      if (updated) {
        updated.visitDate = toIsoStringOrNull(updated.visitDate);
        updated.beBackDate = toIsoStringOrNull(updated.beBackDate);
      }

      if (!updated) return res.status(404).json({ error: 'Contact not found' });

      return res.json({
        ...updated,
        status: typeof updated.status === 'string' ? updated.status.toLowerCase() : updated.status,
        beBackDate: toIsoStringOrNull(updated.beBackDate),
        statusHistory: updated.statusHistory || [],
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
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const deleted = await Contact.findOneAndDelete(contactQuery(req, { _id: new mongoose.Types.ObjectId(id) }));
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
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const roles = req.user?.roles || [];
      const isSuperAdmin = roles.includes('SUPER_ADMIN');
      const isCompanyAdmin = roles.includes('COMPANY_ADMIN');

      const allowedStrings = getAllowedCommunityIds(req.user);
      const allowedObjectIds = allowedStrings
        .filter(id => isObjectId(id))
        .map(id => new mongoose.Types.ObjectId(id));

      const base = { company: req.user.company };
      let filter = base;

      if (!isSuperAdmin) {
        if (allowedObjectIds.length) {
          filter = { ...base, _id: { $in: allowedObjectIds } };
        } else if (!isCompanyAdmin) {
          filter = { ...base, _id: { $in: [] } };
        }
      }

      const communities = await Community.find(filter)
        .select('name')
        .sort({ name: 1 })
        .lean();

      res.json(filterCommunitiesForUser(req.user, communities));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load communities' });
    }
  }
);
// ───────────────────────── link lot to contact ─────────────────────────
// POST /api/contacts/:contactId/link-lot  { lotId }
router.post('/:contactId/link-lot',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const { contactId } = req.params;
    const { lotId } = req.body;

    try {
      if (!isObjectId(contactId)) return res.status(400).json({ error: 'Invalid contactId' });
      const contactObjectId = new mongoose.Types.ObjectId(contactId);
      const contact = await Contact.findOne(contactQuery(req, { _id: contactObjectId }));
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      if (!contact.communityId) return res.status(400).json({ error: 'Contact has no communityId' });
      if (!hasCommunityAccess(req.user, contact.communityId)) {
        return res.status(403).json({ error: 'Not authorized to access this community' });
      }
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
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { realtorId } = req.params;
      if (!isObjectId(realtorId)) return res.status(400).json({ error: 'Invalid realtorId' });

      const contacts = await Contact.find(contactQuery(req, { realtorId: new mongoose.Types.ObjectId(realtorId) }))
        .select('firstName lastName email phone status communityIds ownerId lenderStatus lenders lenderId company requiresAttention')
        .populate('communityIds', 'name')
        .populate('ownerId', 'firstName lastName email')
        .lean();

      await applyTaskAttentionFlags(contacts, {
        linkedModel: 'Contact',
        fallbackCompanyId: req.user?.company || null
      });

      const mapped = contacts.map((contact) => {
        const communities = (contact.communityIds || [])
          .map((community) => community?.name)
          .filter(Boolean);

        const ownerName = contact.ownerId
          ? `${contact.ownerId.firstName || ''} ${contact.ownerId.lastName || ''}`.trim() || contact.ownerId.email || ''
          : '';

        let lenderStatus = contact.lenderStatus || '';
        if (!lenderStatus && Array.isArray(contact.lenders) && contact.lenders.length) {
          lenderStatus = contact.lenders[0]?.status || '';
        }

        return {
          _id: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          status: contact.status,
          communities,
          owner: ownerName,
          lenderStatus,
          requiresAttention: Boolean(contact.requiresAttention)
        };
      });

      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
    }
  }
);

// GET /api/contacts/by-lender/:lenderId
router.get('/by-lender/:lenderId',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { lenderId } = req.params;
      const isCash = lenderId === 'cash';
      if (!isCash && !isObjectId(lenderId)) return res.status(400).json({ error: 'Invalid lenderId' });

      const lenderObjectId = isCash ? null : new mongoose.Types.ObjectId(lenderId);
      const filter = isCash
        ? contactQuery(req, { financeType: 'cash' })
        : contactQuery(req, {
            $or: [
              { lenderId: lenderObjectId },
              { 'lenders.lender': lenderObjectId }
            ]
          });

      const contacts = await Contact.find(filter)
        .select('firstName lastName email phone communityIds lenderId lenders ownerId lenderStatus lenderInviteDate lenderApprovedDate linkedLot lotId status company requiresAttention financeType fundsVerified fundsVerifiedDate')
        .populate('communityIds', 'name')
        .populate('lenderId', 'firstName lastName lenderBrokerage email phone')
        .populate('lenders.lender', 'firstName lastName lenderBrokerage email phone')
        .populate('ownerId', 'firstName lastName email')
        .lean();

      await applyTaskAttentionFlags(contacts, {
        linkedModel: 'Contact',
        fallbackCompanyId: req.user?.company || null
      });

      const mapped = contacts.map((contact) => {
        const communities = (contact.communityIds || [])
          .map((c) => c?.name)
          .filter(Boolean);

        const ownerName = contact.ownerId
          ? `${contact.ownerId.firstName || ''} ${contact.ownerId.lastName || ''}`.trim() || contact.ownerId.email || ''
          : '';

        const formatter = (entry) => ({
          _id: entry?._id,
          status: entry?.status || '',
          inviteDate: entry?.inviteDate || null,
          approvedDate: entry?.approvedDate || null,
          closingStatus: entry?.closingStatus || '',
          closingDateTime: entry?.closingDateTime || null,
          lender: entry?.lender || null,
        });

        const lenderEntries = isCash
          ? []
          : (contact.lenders || [])
              .filter((entry) => entry?.lender && String(entry.lender._id) === lenderId)
              .map(formatter);

        if (!isCash && !lenderEntries.length && contact.lenderId && String(contact.lenderId._id) === lenderId) {
          lenderEntries.push({
            _id: contact.lenderId._id,
            lender: contact.lenderId,
            status: contact.lenderStatus || '',
            inviteDate: contact.lenderInviteDate || null,
            approvedDate: contact.lenderApprovedDate || null,
            closingStatus: '',
            closingDateTime: null,
          });
        }

        const linkedLotData = contact.linkedLot ? {
          ...contact.linkedLot,
          communityId: contact.linkedLot.communityId || contact.linkedLot?.lot?.communityId || null,
          lotId: contact.linkedLot.lotId || contact.linkedLot?._id || contact.linkedLot?.lotId || null,
        } : null;

        const hasLinkedLot =
          Boolean(linkedLotData && (
            linkedLotData.lotId ||
            linkedLotData.communityId ||
            linkedLotData.address ||
            linkedLotData.jobNumber ||
            linkedLotData.block ||
            linkedLotData.phase ||
            linkedLotData.lot
          )) ||
          Boolean(contact.lotId);

        const statusNormalized = String(contact.status || '').trim().toLowerCase();
        const purchaserStatus = statusNormalized === 'purchased';
        const isPurchaserWithLot = hasLinkedLot && purchaserStatus;

        return {
          _id: contact._id,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          email: contact.email || '',
          phone: contact.phone || '',
          status: contact.status || '',
          communities,
          owner: ownerName,
          lenders: lenderEntries,
          lotId: contact.lotId || null,
          linkedLot: linkedLotData,
          hasLinkedLot,
          isPurchaserWithLot,
          requiresAttention: Boolean(contact.requiresAttention),
          financeType: contact.financeType || 'financed',
          fundsVerified: Boolean(contact.fundsVerified),
          fundsVerifiedDate: contact.fundsVerifiedDate || null
        };
      });

      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts by lender', details: err.message });
    }
  }
);

// ───────────────────────── lender links & updates ─────────────────────────
// PATCH /api/contacts/:contactId/lenders/:entryId
router.patch('/:contactId/lenders/:entryId',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { contactId, entryId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(entryId)) return res.status(400).json({ error: 'Invalid id' });

      const contactObjectId = new mongoose.Types.ObjectId(contactId);
      const lenderEntryObjectId = new mongoose.Types.ObjectId(entryId);
      const filter = contactQuery(req, { _id: contactObjectId, 'lenders._id': lenderEntryObjectId });
      const {
        status,
        inviteDate,
        approvedDate,
        closingStatus,
        closingDateTime
      } = req.body;

      const $set = {};
      if (status !== undefined) $set['lenders.$.status'] = status;
      if (inviteDate !== undefined) $set['lenders.$.inviteDate'] = inviteDate;
      if (approvedDate !== undefined) $set['lenders.$.approvedDate'] = approvedDate;
      if (closingStatus !== undefined) $set['lenders.$.closingStatus'] = closingStatus || 'notLocked';
      if (closingDateTime !== undefined) {
        const parsed = closingDateTime ? new Date(closingDateTime) : null;
        $set['lenders.$.closingDateTime'] = parsed;
      }

      if (!Object.keys($set).length) {
        return res.status(400).json({ error: 'No lender fields provided to update.' });
      }

      const contact = await Contact.findOneAndUpdate(
        filter,
        { $set },
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
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { contactId, lenderLinkId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(lenderLinkId)) return res.status(400).json({ error: 'Invalid id' });

      const contactObjectId = new mongoose.Types.ObjectId(contactId);
      const contact = await Contact.findOne(contactQuery(req, { _id: contactObjectId }));
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
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { contactId, lenderLinkId } = req.params;
      if (!isObjectId(contactId) || !isObjectId(lenderLinkId)) return res.status(400).json({ error: 'Invalid id' });

      const contactObjectId = new mongoose.Types.ObjectId(contactId);
      const lenderLinkObjectId = new mongoose.Types.ObjectId(lenderLinkId);
      const updated = await Contact.findOneAndUpdate(
        contactQuery(req, { _id: contactObjectId, 'lenders._id': lenderLinkObjectId }),
        { $pull: { lenders: { _id: lenderLinkObjectId } } },
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
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { contactId } = req.params;
      if (!isObjectId(contactId)) return res.status(400).json({ error: 'Invalid id' });

      const { lenderId, status, inviteDate, approvedDate } = req.body;

      const contactObjectId = new mongoose.Types.ObjectId(contactId);
      const updated = await Contact.findOneAndUpdate(
        contactQuery(req, { _id: contactObjectId }),
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
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const contact = await Contact.findOne(contactQuery(req, { _id: new mongoose.Types.ObjectId(id) }));
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
  requireRole(...ADMIN_ROLES),
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
      const {
        nameMap: communityNameMap,
        idSet: allowedCommunityIdSet,
        enforceScope: enforceCommunityScope
      } = await loadImportableCommunities(req);
      const selectedCommunityId = toObjectId(req.body.communityId);
      if (req.body.communityId) {
        if (!selectedCommunityId) {
          return res.status(400).json({ error: 'Invalid community selection.' });
        }
        const selectedStr = selectedCommunityId.toString();
        if (
          enforceCommunityScope &&
          (allowedCommunityIdSet.size === 0 || !allowedCommunityIdSet.has(selectedStr))
        ) {
          return res.status(403).json({ error: 'Selected community is not available for your account.' });
        }
        if (allowedCommunityIdSet.size && !allowedCommunityIdSet.has(selectedStr)) {
          return res.status(400).json({ error: 'Selected community was not found.' });
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const firstName = toStr(r.FirstName || r['First Name'] || r.firstName);
        const lastName  = toStr(r.LastName  || r['Last Name']  || r.lastName);
        const emailRaw  = toStr(r.Email || r.email);
        const phoneData = normalizePhoneForDb(r.Phone || r.phone);
        const phoneRaw = phoneData.phone;
        const emailNorm = emailRaw.toLowerCase();
        const phoneNorm = phoneData.phoneNorm;
        const visitDate = parseDateMaybe(r.VisitDate || r['Visit Date'] || r.visitDate);
        const sourceValue = toStr(r.Source || r.source || r.LeadSource || r['Lead Source']);

        const communityIdsFromRow = [];
        const missingCommunities = [];
        const rawCommunityNames = toStr(r.Community || r['Community Name'] || r.community);
        const rawCommunityIds = toStr(r.CommunityId || r['Community Id'] || r.CommunityIDs || r.communityId || r.communityIds);

        const addCommunityIdIfAllowed = (val) => {
          const obj = toObjectId(val);
          if (!obj) { missingCommunities.push(String(val)); return; }
          const str = obj.toString();
          // If we have an allowed set and this id is not in it, record a miss
          if (enforceCommunityScope && (allowedCommunityIdSet.size === 0 || !allowedCommunityIdSet.has(str))) {
            missingCommunities.push(String(val));
            return;
          }
          communityIdsFromRow.push(obj);
        };

        if (rawCommunityIds) {
          splitMulti(rawCommunityIds).forEach(addCommunityIdIfAllowed);
        }

        if (rawCommunityNames) {
          splitMulti(rawCommunityNames).forEach((name) => {
            const match = communityNameMap.get(name.toLowerCase());
            if (match) {
              communityIdsFromRow.push(match);
            } else {
              missingCommunities.push(name);
            }
          });
        }

        if (selectedCommunityId) {
          communityIdsFromRow.push(selectedCommunityId);
        }

        if (!firstName && !lastName && !emailRaw && !phoneNorm) { skipped++; continue; }

         const filter = emailNorm ? { company: req.user.company, emailNorm } :
                       phoneNorm ? { company: req.user.company, phoneNorm } : null;
        if (!filter) { skipped++; continue; }

        const set = { firstName, lastName };
        if (emailNorm) { set.email = emailRaw; set.emailNorm = emailNorm; }
       if (phoneNorm) { set.phone = phoneRaw; set.phoneNorm = phoneNorm; }
        if (visitDate) set.visitDate = visitDate;
        if (sourceValue) set.source = sourceValue;

        const updateDoc = {
          $set: set,
          $setOnInsert: isSuper(req)
            ? { company: req.body.company || req.user.company }
            : { company: req.user.company }
        };

        if (communityIdsFromRow.length) {
          updateDoc.$addToSet = { communityIds: { $each: communityIdsFromRow } };
        }

        // Stamp company on upsert
        const result = await Contact.updateOne(
          filter,
          updateDoc,
          { upsert: true }
        );
        if (result.upsertedCount && result.upsertedId) created++;
        else if (result.matchedCount) updated++;
        else skipped++;

        if (missingCommunities.length) {
          errors.push({ row: i + 2, message: `Unknown or unauthorized community: ${missingCommunities.join(', ')}` });
        }
      }

      res.json({ success: true, created, updated, skipped, errors });
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'Failed to import contacts', details: err.message });
    } finally {
      if (filePath) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
  }
);

router.post(
  '/:id/followup-schedule',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid contact id' });
      const contactObjectId = new mongoose.Types.ObjectId(id);

      const scheduleObjectId = toObjectId(req.body?.scheduleId);
      if (!scheduleObjectId) {
        return res.status(400).json({ error: 'scheduleId is required' });
      }

      const contact = await Contact.findOne(contactQuery(req, { _id: contactObjectId }));
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const schedule = await AutoFollowUpSchedule.findOne({
        _id: scheduleObjectId,
        company: contact.company
      })
        .select('name')
        .lean();

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const contactIdString = contactObjectId.toString();
      const scheduleIdString = scheduleObjectId.toString();
      const requestedPrefix =
        typeof req.body?.reasonPrefix === 'string' ? req.body.reasonPrefix.trim() : '';
      const normalizedPrefix =
        requestedPrefix.startsWith(`followup:${contactIdString}:${scheduleIdString}:`)
          ? requestedPrefix
          : `followup:${contactIdString}:${scheduleIdString}:`;

      contact.followUpSchedule = {
        scheduleId: scheduleObjectId,
        scheduleName: schedule.name,
        appliedAt: new Date(),
        appliedBy: req.user._id,
        reasonPrefix: normalizedPrefix
      };

      await contact.save();
      return res.json({ followUpSchedule: contact.followUpSchedule });
    } catch (err) {
      console.error('[contacts] failed to assign follow-up schedule', err);
      return res.status(500).json({ error: 'Failed to assign schedule' });
    }
  }
);

router.delete(
  '/:id/followup-schedule',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid contact id' });
      const contactObjectId = new mongoose.Types.ObjectId(id);

      const cleanup =
        req.query.cleanup === '1' ||
        req.query.cleanup === 'true' ||
        req.query.cleanup === 'yes';

      const contact = await Contact.findOne(contactQuery(req, { _id: contactObjectId }));
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const previous = contact.followUpSchedule || null;
      contact.set('followUpSchedule', undefined);
      await contact.save();

      let removedTasks = 0;
      if (cleanup && previous?.scheduleId) {
        const contactIdStr = contactObjectId.toString();
        const scheduleIdStr = previous.scheduleId.toString();
        const reasonPrefix =
          typeof previous.reasonPrefix === 'string' && previous.reasonPrefix.trim().length
            ? previous.reasonPrefix.trim()
            : `followup:${contactIdStr}:${scheduleIdStr}:`;
        const pattern = new RegExp(`^${escapeRegExp(reasonPrefix)}`);

        const deletion = await Task.deleteMany({
          company: contact.company,
          linkedModel: 'Contact',
          linkedId: contactObjectId,
          reason: { $regex: pattern }
        });
        removedTasks = deletion?.deletedCount || 0;
      }

      return res.json({ followUpSchedule: null, removedTasks });
    } catch (err) {
      console.error('[contacts] failed to unassign follow-up schedule', err);
      return res.status(500).json({ error: 'Failed to unassign schedule' });
    }
  }
);

module.exports = router;
