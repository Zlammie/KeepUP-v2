// routes/communityRoutes.js (hardened for tenants + roles)
const express = require('express');
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const router = express.Router();

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const Contact = require('../models/Contact');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const upload = require('../middleware/upload');
const {
  getAllowedCommunityIds,
  hasCommunityAccess,
  filterCommunitiesForUser,
} = require('../utils/communityScope');

// ??????????????????????????????????????????????????????????????????????????? helpers ???????????????????????????????????????????????????????????????????????????
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });
const toObjectIdArray = (ids = []) =>
  ids
    .filter(id => isObjectId(id))
    .map(id => new mongoose.Types.ObjectId(id));

const toStringId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (typeof value.toString === 'function') {
      const str = value.toString();
      return str && str !== '[object Object]' ? str : null;
    }
  }
  return null;
};

function trimValue(value) {
  return value == null ? '' : String(value).trim();
}

function buildContactName(contact) {
  if (!contact || typeof contact !== 'object' || contact._bsontype) return '';
  const first = trimValue(contact.firstName);
  const last = trimValue(contact.lastName);
  const parts = [];
  if (first) parts.push(first);
  if (last) parts.push(last);
  if (parts.length) return parts.join(' ');
  const full = trimValue(contact.fullName);
  if (full) return full;
  return trimValue(contact.name);
}

function derivePurchaserMeta(lot) {
  const input = lot || {};
  const raw = input.purchaser;

  const fallbackName = [
    trimValue(input.purchaserName),
    trimValue(input.buyerName),
    trimValue(input.purchaserDisplayName)
  ].find(Boolean) || '';

  let name = buildContactName(raw) || fallbackName;

  let id = input.purchaserId || null;
  if (!id && raw && typeof raw === 'object' && !raw._bsontype) {
    id = raw._id || raw.id || null;
  } else if (!id) {
    id = toStringId(raw);
  }

  const finalId = toStringId(id) || (typeof id === 'string' ? id.trim() : null);

  return { name: trimValue(name), id: finalId || null };
}

function normalizeFloorPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const normalized = {
    _id: toStringId(plan._id || plan.id || null),
    name: trimValue(plan.name),
    planNumber: trimValue(plan.planNumber),
    title: trimValue(plan.title),
    code: trimValue(plan.code)
  };
  return normalized;
}

function deriveFloorPlanName(plan) {
  if (!plan || typeof plan !== 'object') return '';
  return trimValue(plan.name) || trimValue(plan.title) || trimValue(plan.planNumber) || trimValue(plan.code);
}

async function loadScopedCommunity(req, res) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    res.status(400).json({ error: 'Invalid community id' });
    return null;
  }
  if (!hasCommunityAccess(req.user, id)) {
    res.status(404).json({ error: 'Community not found' });
    return null;
  }
  const filter = { _id: id, ...companyFilter(req) };
  const doc = await Community.findOne(filter).lean();
  if (!doc) {
    res.status(404).json({ error: 'Community not found' });
    return null;
  }
  return doc;
}

// All community routes require auth
router.use(ensureAuth);

// ??????????????????????????????????????????????????????????????????????????? import ???????????????????????????????????????????????????????????????????????????
// POST /api/communities/import  (MANAGER+)
router.post('/import',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  upload.single('file'),
  async (req, res) => {
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      // Preload plans for lookup by name/number (scoped to company if you tenant FloorPlan; else global)
      const plans = await FloorPlan.find({}, 'name planNumber').lean();
      const planByName   = new Map(plans.map(p => [String(p.name || '').toLowerCase(), String(p._id)]));
      const planByNumber = new Map(plans.map(p => [String(p.planNumber || '').toLowerCase(), String(p._id)]));

      const grouped = new Map(); // key: name|projectNumber
      for (const row of rows) {
        const name = row['Community Name'];
        const projectNumber = row['Project Number'];

        if (!name || !projectNumber) continue;

        const fpRaw = String(row['Floor Plan'] || '').trim().toLowerCase();
        const fpId  = planByName.get(fpRaw) || planByNumber.get(fpRaw) || null;

        const lot = {
          jobNumber: String(row['Job Number'] || '').padStart(4, '0'),
          lot: row['Lot'] || '',
          block: row['Block'] || '',
          phase: row['Phase'] || '',
          address: row['Address'] || '',
          floorPlan: isObjectId(fpId) ? fpId : null,
          elevation: row['Elevation'] || ''
        };

        const key = `${name}|${projectNumber}`;
        if (!grouped.has(key)) grouped.set(key, { name, projectNumber, lots: [] });
        grouped.get(key).lots.push(lot);
      }

      const inserted = [];
      for (const { name, projectNumber, lots } of grouped.values()) {
        // uniqueness within tenant
        const filter = { name, projectNumber, ...companyFilter(req) };

        let doc = await Community.findOne(filter);
        if (!doc) {
          doc = new Community({
            company: isSuper(req) ? (req.body.company || req.user.company) : req.user.company,
            name, projectNumber, lots
          });
        } else {
          doc.lots.push(...lots);
        }
        await doc.save();
        inserted.push(doc);
      }

      res.json({ success: true, inserted });
    } catch (err) {
      console.error('Import failed:', err);
      res.status(500).json({ error: 'Import failed' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? create ???????????????????????????????????????????????????????????????????????????
// POST /api/communities  (USER+)
router.post('/',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { name, projectNumber } = req.body;
      if (!name || !projectNumber) return res.status(400).json({ error: 'Missing required fields' });

      const filter = { name, projectNumber, ...companyFilter(req) };
      const existing = await Community.findOne(filter).lean();
      if (existing) return res.status(409).json({ error: 'Community already exists' });

      const doc = await Community.create({
        company: isSuper(req) ? (req.body.company || req.user.company) : req.user.company,
        name, projectNumber, lots: []
      });
      res.status(201).json(doc);
    } catch (err) {
      console.error('Create community error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? list ???????????????????????????????????????????????????????????????????????????
// GET /api/communities  (READONLY+)
router.get('/',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const roles = req.user?.roles || [];
      const isSuperAdmin = roles.includes('SUPER_ADMIN');
      const isCompanyAdmin = roles.includes('COMPANY_ADMIN');

      const q = String(req.query.q || '').trim();
      const base = { company: req.user.company };

      const allowedStrings = getAllowedCommunityIds(req.user);
      const allowedObjectIds = toObjectIdArray(allowedStrings);

      let accessFilter = base;
      if (!isSuperAdmin) {
        if (allowedObjectIds.length) {
          accessFilter = { ...base, _id: { $in: allowedObjectIds } };
        } else if (!isCompanyAdmin) {
          accessFilter = { ...base, _id: { $in: [] } };
        }
      }

      const textFilter = q
        ? {
            $or: [
              { name: { $regex: q, $options: 'i' } },
              { city: { $regex: q, $options: 'i' } },
              { state: { $regex: q, $options: 'i' } },
              { market: { $regex: q, $options: 'i' } },
            ],
          }
        : {};

      const communities = await Community.find({ ...accessFilter, ...textFilter })
        .select('name city state market')
        .sort({ name: 1 })
        .lean();

      res.json(filterCommunitiesForUser(req.user, communities));
    } catch (err) {
      console.error('Fetch communities error:', err);
      res.status(500).json({ error: 'Failed to fetch communities' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? lots search ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/:id/lots?q=address  (READONLY+)
router.get('/:id/lots',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const community = await loadScopedCommunity(req, res);
      if (!community) return;

      const q = (req.query.q || '').toLowerCase();
      const allLots = community.lots || [];
      const baseLots = q
        ? allLots.filter(l => (l.address || '').toLowerCase().includes(q))
        : allLots;

      const lotMetaPairs = baseLots.map(lot => ({ lot, meta: derivePurchaserMeta(lot) }));
      const missingIds = Array.from(new Set(
        lotMetaPairs
          .filter(({ meta }) => !meta.name && meta.id)
          .map(({ meta }) => String(meta.id))
      ));

      let contactNameById = new Map();
      let contactById = new Map();
      if (missingIds.length) {
        const objectIds = missingIds
          .filter(id => /^[0-9a-fA-F]{24}$/.test(id))
          .map(id => new mongoose.Types.ObjectId(id));
        const lookupIds = objectIds.length ? objectIds : missingIds;
        const contacts = await Contact.find({
          _id: { $in: lookupIds },
          ...companyFilter(req)
        })
          .select('firstName lastName fullName name email phone')
          .lean({ virtuals: true });
        contactNameById = new Map();
        contactById = new Map();
        for (const contact of contacts) {
          const contactId = toStringId(contact._id);
          const name = trimValue(buildContactName(contact));
          if (contactId) {
            contactById.set(contactId, contact);
            if (name) contactNameById.set(contactId, name);
          }
        }
      }

      const floorPlanIds = Array.from(new Set(
        baseLots
          .map(lot => {
            const fp = lot.floorPlan;
            if (!fp) return null;
            if (typeof fp === 'string') return fp.trim();
            if (typeof fp === 'object') return toStringId(fp._id || fp.id);
            return null;
          })
          .filter(Boolean)
      ));

      let floorPlanById = new Map();
      if (floorPlanIds.length) {
        const objectFloorIds = floorPlanIds
          .filter(id => /^[0-9a-fA-F]{24}$/.test(id))
          .map(id => new mongoose.Types.ObjectId(id));
        const lookupFloorIds = objectFloorIds.length ? objectFloorIds : floorPlanIds;
        const floorPlans = await FloorPlan.find({
          _id: { $in: lookupFloorIds },
          ...companyFilter(req)
        })
          .select('name planNumber title code')
          .lean({ virtuals: true });
        floorPlanById = new Map();
        for (const plan of floorPlans) {
          const planId = toStringId(plan._id);
          const normalizedPlan = normalizeFloorPlan(plan);
          if (planId && normalizedPlan) {
            if (!normalizedPlan._id) normalizedPlan._id = planId;
            floorPlanById.set(planId, normalizedPlan);
          }
        }
      }

      const lots = lotMetaPairs.map(({ lot, meta }) => {
        const result = { ...lot };
        const existingPlanName = trimValue(result.floorPlanName);

        let displayName = meta.name || '';
        if (!displayName && meta.id) {
          const key = String(meta.id);
          displayName = contactNameById.get(key) || key;
          const needsHydration =
            !result.purchaser ||
            typeof result.purchaser === 'string' ||
            (typeof result.purchaser === 'object' && result.purchaser._bsontype);
          if (needsHydration) {
            const contact = contactById.get(key);
            if (contact) result.purchaser = contact;
          }
        }
        result.purchaserDisplayName = displayName;
        result.purchaserId = meta.id || null;

        const rawPlan = lot.floorPlan;
        const floorPlanId = (() => {
          if (!rawPlan) return null;
          if (typeof rawPlan === 'string') return rawPlan.trim();
          if (typeof rawPlan === 'object') return toStringId(rawPlan._id || rawPlan.id);
          return null;
        })();

        let floorPlanValue = rawPlan;
        if (floorPlanId && floorPlanById.has(floorPlanId)) {
          floorPlanValue = floorPlanById.get(floorPlanId);
        } else if (floorPlanValue && typeof floorPlanValue === 'object') {
          const normalized = normalizeFloorPlan(floorPlanValue);
          if (normalized) floorPlanValue = normalized;
        }

        if (floorPlanValue && typeof floorPlanValue === 'object') {
          const normalized = normalizeFloorPlan(floorPlanValue) || {};
          if (floorPlanId && !normalized._id) normalized._id = floorPlanId;
          result.floorPlan = normalized;
          const planName = deriveFloorPlanName(normalized);
          if (planName) result.floorPlanName = planName;
        } else if (floorPlanId && floorPlanById.has(floorPlanId)) {
          const plan = floorPlanById.get(floorPlanId);
          result.floorPlan = plan;
          const planName = deriveFloorPlanName(plan);
          if (planName) result.floorPlanName = planName;
        } else {
          result.floorPlan = floorPlanValue;
        }

        if (!result.floorPlanName && floorPlanId && floorPlanById.has(floorPlanId)) {
          const plan = floorPlanById.get(floorPlanId);
          const planName = deriveFloorPlanName(plan);
          if (planName) result.floorPlanName = planName;
        }

        if (!result.floorPlanName && existingPlanName) {
          result.floorPlanName = existingPlanName;
        }

        return result;
      });

      res.json(lots);
    } catch (err) {
      console.error('Fetch lots error:', err);
      res.status(500).json({ error: 'Failed to fetch lots' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? lot by purchaser ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/lot-by-purchaser/:contactId  (READONLY+)
router.get('/lot-by-purchaser/:contactId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { contactId } = req.params;
      if (!isObjectId(contactId)) return res.json({ found: false });

      const community = await Community.findOne(
        { 'lots.purchaser': contactId, ...companyFilter(req) },
        { lots: 1 }
      ).populate('lots.purchaser', 'lastName').lean();

      if (!community) return res.json({ found: false });

      const lot = (community.lots || []).find(l => String(l.purchaser?._id || l.purchaser) === String(contactId));
      if (!lot) return res.json({ found: false });

      let floorPlanValue = lot.floorPlan;
      let floorPlanName = trimValue(lot.floorPlanName || '');
      const floorPlanId = (() => {
        if (!floorPlanValue) return null;
        if (typeof floorPlanValue === 'string') return floorPlanValue.trim();
        if (typeof floorPlanValue === 'object') return toStringId(floorPlanValue._id || floorPlanValue.id);
        return null;
      })();

      if (floorPlanId) {
        const needsPlan =
          !floorPlanValue ||
          typeof floorPlanValue === 'string' ||
          (typeof floorPlanValue === 'object' && floorPlanValue._bsontype);
        if (needsPlan) {
          const planDoc = await FloorPlan.findOne({ _id: floorPlanId, ...companyFilter(req) })
            .select('name planNumber title code')
            .lean({ virtuals: true });
          if (planDoc) floorPlanValue = planDoc;
        }
      }

      if (floorPlanValue && typeof floorPlanValue === 'object') {
        const normalized = normalizeFloorPlan(floorPlanValue);
        if (normalized) {
          if (floorPlanId && !normalized._id) normalized._id = floorPlanId;
          floorPlanValue = normalized;
          if (!floorPlanName) floorPlanName = deriveFloorPlanName(normalized);
        }
      } else if (typeof floorPlanValue === 'string') {
        if (!floorPlanName) floorPlanName = floorPlanValue;
      }

      const lotPayload = {
        _id: lot._id,
        address: lot.address,
        jobNumber: lot.jobNumber,
        lot: lot.lot || null,
        block: lot.block || null,
        phase: lot.phase || null,
        elevation: lot.elevation || null,
        status: lot.status || null,
        generalStatus: lot.generalStatus || null,
        floorPlan: floorPlanValue ?? null,
        salesDate: lot.salesDate || null,
        salesPrice: lot.salesPrice ?? null
      };
      if (floorPlanName) lotPayload.floorPlanName = floorPlanName;

      res.json({
        found: true,
        communityId: community._id,
        lot: lotPayload
      });
    } catch (err) {
      console.error('lot-by-purchaser error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? add lot ???????????????????????????????????????????????????????????????????????????
// POST /api/communities/:id/lots  (USER+)
router.post('/:id/lots',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const community = await loadScopedCommunity(req, res);
      if (!community) return;

      const {
        jobNumber, lot, block, phase, address, floorPlan = '', elevation = ''
      } = req.body;

      const newLot = {
        jobNumber: String(jobNumber || '').padStart(4, '0'),
        lot: lot || '', block: block || '', phase: phase || '', address: address || '',
        floorPlan: isObjectId(floorPlan) ? floorPlan : null,
        elevation: elevation || '',
        status: '',
        purchaser: null,
        phone: '', email: '',
        releaseDate: null,
        expectedCompletionDate: null,
        closeMonth: '',
        walkStatus: 'waitingOnBuilder',
        thirdParty: null, firstWalk: null, finalSignOff: null,
        lender: '',
        closeDateTime: null,
        listPrice: null, salesPrice: null
      };

      const upd = await Community.findOneAndUpdate(
        { _id: community._id, ...companyFilter(req) },
        { $push: { lots: newLot } },
        { new: true, runValidators: true }
      ).lean();

      const created = (upd?.lots || []).slice(-1)[0];
      res.status(201).json({ message: 'Lot added', lot: created || newLot });
    } catch (err) {
      console.error('Add lot error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? select options ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/select-options  (READONLY+)
router.get('/select-options',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const rows = await Community.find({ ...companyFilter(req) })
        .select('name communityName builder builderName')
        .sort({ name: 1, communityName: 1 })
        .lean();

      const scopedRows = filterCommunitiesForUser(req.user, rows);
      const data = scopedRows.map(c => {
        const name = c.name || c.communityName || '(unnamed)';
        const builder = c.builder || c.builderName || '';
        return { id: c._id, label: builder ? `${builder} ??? ${name}` : name };
      });
      res.json(data);
    } catch (e) { next(e); }
  }
);

// ??????????????????????????????????????????????????????????????????????????? plans for community ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/:id/floorplans  (READONLY+)
router.get('/:id/floorplans',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const community = await loadScopedCommunity(req, res);
      if (!community) return;

      const plans = await FloorPlan.find({ communities: community._id }).lean();
      res.json(plans);
    } catch (err) {
      console.error('Fetch floorplans error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? get single lot ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/:id/lots/:lotId  (READONLY+)
router.get('/:id/lots/:lotId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const community = await loadScopedCommunity(req, res);
      if (!community) return;

      const { lotId } = req.params;
      const lot = (community.lots || []).find(l => String(l._id) === String(lotId));
      if (!lot) return res.status(404).json({ error: 'Lot not found' });

      const meta = derivePurchaserMeta(lot);
      let purchaser = lot.purchaser;
      let purchaserDisplayName = meta.name || '';

      if (meta.id) {
        const needsHydration =
          !purchaser ||
          typeof purchaser === 'string' ||
          (typeof purchaser === 'object' && purchaser._bsontype);
        if (needsHydration) {
          const contact = await Contact.findOne({ _id: meta.id, ...companyFilter(req) })
            .select('firstName lastName fullName name email phone status notes communityIds')
            .lean({ virtuals: true });
          if (contact) purchaser = contact;
          if (contact && !purchaserDisplayName) purchaserDisplayName = trimValue(buildContactName(contact));
        }
      }
      if (!purchaserDisplayName && meta.id) purchaserDisplayName = meta.id;

      let floorPlanValue = lot.floorPlan;
      let floorPlanName = trimValue(lot.floorPlanName || '');
      const floorPlanId = (() => {
        if (!floorPlanValue) return null;
        if (typeof floorPlanValue === 'string') return floorPlanValue.trim();
        if (typeof floorPlanValue === 'object') return toStringId(floorPlanValue._id || floorPlanValue.id);
        return null;
      })();

      if (floorPlanId) {
        const needsPlan =
          !floorPlanValue ||
          typeof floorPlanValue === 'string' ||
          (typeof floorPlanValue === 'object' && floorPlanValue._bsontype);
        if (needsPlan) {
          const planDoc = await FloorPlan.findOne({ _id: floorPlanId, ...companyFilter(req) })
            .select('name planNumber title code')
            .lean({ virtuals: true });
          if (planDoc) floorPlanValue = planDoc;
        }
      }

      if (floorPlanValue && typeof floorPlanValue === 'object') {
        const normalized = normalizeFloorPlan(floorPlanValue);
        if (normalized) {
          if (floorPlanId && !normalized._id) normalized._id = floorPlanId;
          floorPlanValue = normalized;
          if (!floorPlanName) floorPlanName = deriveFloorPlanName(normalized);
        }
      } else if (typeof floorPlanValue === 'string') {
        if (!floorPlanName) floorPlanName = floorPlanValue;
      }

      const payload = {
        ...lot,
        purchaser: purchaser ?? null,
        purchaserId: meta.id || null,
        purchaserDisplayName,
        floorPlan: floorPlanValue ?? null,
      };
      if (floorPlanName) payload.floorPlanName = floorPlanName;

      return res.json(payload);
    } catch (err) {
      console.error('Get lot error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? update lot (generic) ???????????????????????????????????????????????????????????????????????????
// PUT /api/communities/:communityId/lots/:lotId  (USER+)
router.put('/:communityId/lots/:lotId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { communityId, lotId } = req.params;
    const updates = req.body || {};
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Empty update body' });

    if (!hasCommunityAccess(req.user, communityId)) {
      return res.status(404).json({ error: 'Community not found' });
    }

    if (typeof updates.salesDate === 'string' && updates.salesDate) {
      updates.salesDate = new Date(updates.salesDate);
    }

    const setObj = Object.entries(updates).reduce((acc, [k, v]) => {
      acc[`lots.$.${k}`] = v; return acc;
    }, {});

    try {
      const filter = { _id: communityId, ...companyFilter(req), 'lots._id': lotId };
      const community = await Community.findOneAndUpdate(filter, { $set: setObj }, { new: true, runValidators: true });
      if (!community) return res.status(404).json({ error: 'Community or Lot not found' });
      return res.json(community.lots.id(lotId));
    } catch (err) {
      console.error('Update lot error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? set purchaser ???????????????????????????????????????????????????????????????????????????
// PUT /api/communities/:communityId/lots/:lotId/purchaser  (USER+)
router.put('/:communityId/lots/:lotId/purchaser',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { communityId, lotId } = req.params;
    const { contactId } = req.body;
    if (!contactId || !isObjectId(contactId)) {
      return res.status(400).json({ error: 'Missing/invalid contactId' });
    }
    try {
      // Optional: ensure contact in same tenant
      const contact = await Contact.findOne({ _id: contactId, ...companyFilter(req) }).select('_id').lean();
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      if (!hasCommunityAccess(req.user, communityId)) {
        return res.status(404).json({ error: 'Community not found' });
      }
      const filter = { _id: communityId, ...companyFilter(req) };
      const community = await Community.findOneAndUpdate(
        filter,
        { $set: { 'lots.$[lot].purchaser': contactId } },
        { new: true, arrayFilters: [{ 'lot._id': lotId }] }
      ).populate('lots.purchaser', 'lastName');
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const updatedLot = community.lots.find(l => String(l._id) === String(lotId));
      if (!updatedLot) return res.status(404).json({ error: 'Lot not found' });
      return res.json(updatedLot);
    } catch (err) {
      console.error('Set purchaser error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? update community meta ???????????????????????????????????????????????????????????????????????????
// PUT /api/communities/:id  (MANAGER+)
router.put('/:id',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    const { name, projectNumber } = req.body;

    try {
      const update = {};
      if (typeof name === 'string') update.name = name.trim();
      if (typeof projectNumber === 'string') update.projectNumber = projectNumber.trim();

      const updated = await Community.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        { $set: update },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) return res.status(404).json({ error: 'Community not found' });
      res.json(updated);
    } catch (err) {
      console.error('Update community failed:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// DELETE /api/communities/:id  (MANAGER+)
router.delete('/:id',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid community id' });
    if (!hasCommunityAccess(req.user, id)) return res.status(404).json({ error: 'Community not found' });

    try {
      const filter = { _id: id, ...companyFilter(req) };
      const deleted = await Community.findOneAndDelete(filter).lean();
      if (!deleted) return res.status(404).json({ error: 'Community not found' });
      res.json({ ok: true, id: deleted._id });
    } catch (err) {
      console.error('Delete community failed:', err);
      res.status(500).json({ error: 'Delete community failed' });
    }
  }
);
// DELETE /api/communities/:id/lots/:lotId/purchaser  (USER+)
router.delete('/:id/lots/:lotId/purchaser',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      if (!hasCommunityAccess(req.user, req.params.id)) {
        return res.status(404).json({ error: 'Community or lot not found' });
      }
      const filter = { _id: req.params.id, ...companyFilter(req), 'lots._id': req.params.lotId };
      const doc = await Community.findOne(filter, { 'lots.$': 1 }).lean();
      if (!doc || !doc.lots || !doc.lots[0]) return res.status(404).json({ error: 'Community or lot not found' });

      await Community.updateOne(filter, { $unset: { 'lots.$.purchaser': '' } });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Unlink purchaser failed:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? delete lot ???????????????????????????????????????????????????????????????????????????
// DELETE /api/communities/:id/lots/:lotId  (MANAGER+)
router.delete('/:id/lots/:lotId',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id, lotId } = req.params;
    try {
      if (!hasCommunityAccess(req.user, id)) {
        return res.status(404).json({ error: 'Community or lot not found' });
      }
      const result = await Community.updateOne(
        { _id: id, ...companyFilter(req) },
        { $pull: { lots: { _id: lotId } } }
      );

      if (!result.modifiedCount) return res.status(404).json({ error: 'Community or lot not found' });
      return res.sendStatus(204);
    } catch (err) {
      console.error('Delete lot failed:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;


