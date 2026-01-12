// routes/communityRoutes.js (hardened for tenants + roles)
const express = require('express');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const router = express.Router();

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const Contact = require('../models/Contact');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const upload = require('../middleware/upload');
const { hasCommunityAccess, filterCommunitiesForUser } = require('../utils/communityScope');
const { syncInternalCompetitions } = require('../services/competitionSync');
const { publishCommunity } = require('../services/buildrootzPublisher');

// ??????????????????????????????????????????????????????????????????????????? helpers ???????????????????????????????????????????????????????????????????????????
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });
const READ_ROLES   = ['READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const WRITE_ROLES  = ['USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const ADMIN_ROLES  = ['MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
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

function normalizePlanKeys(raw) {
  const base = trimValue(raw).toLowerCase();
  if (!base) return [];
  const withoutPrefix = base.replace(/^plan\s*/i, '').trim();
  const keys = [base];
  if (withoutPrefix && withoutPrefix !== base) keys.push(withoutPrefix);
  return Array.from(new Set(keys));
}

function buildPlanKeyMap(plans = []) {
  const map = new Map();
  const add = (key, id) => { if (key) map.set(key, id); };
  plans.forEach((p) => {
    const id = p?._id ? p._id.toString() : null;
    normalizePlanKeys(p?.name).forEach((k) => add(k, id));
    normalizePlanKeys(p?.planNumber).forEach((k) => add(k, id));
  });
  return map;
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

function formatDate(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function escapeCsvValue(value) {
  const str = value == null ? '' : String(value);
  if (!str.length) return '';
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function listToString(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean)
      .join(' | ');
  }
  return value == null ? '' : String(value);
}

function sanitizeFilename(base, fallback = 'community') {
  const cleaned = trimValue(base).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

const mapUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowedExt = new Set(['.svg', '.json', '.png', '.jpg', '.jpeg']);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowedExt.has(ext)) return cb(null, true);
    return cb(new Error(`Unsupported map file type: ${ext}`));
  }
});

const mapsBaseDir = path.join(process.cwd(), 'public', 'maps', 'communities');

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(prefix, original) {
  const ext = path.extname(original || '').toLowerCase() || '.dat';
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}-${stamp}-${rand}${ext}`;
}

function writeFileToDir(dir, filename, buffer) {
  ensureDirSync(dir);
  const target = path.join(dir, filename);
  fs.writeFileSync(target, buffer);
  return target;
}

function getMapDir(communityId) {
  return path.join(mapsBaseDir, String(communityId));
}

function readCommunityMapManifest(communityId) {
  const dir = getMapDir(communityId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Expose via the existing /public static mount
  const basePath = `/public/maps/communities/${communityId}`;
  const files = data?.files || {};
  return {
    ...data,
    files,
    paths: {
      basePath,
      overlayPath: files.overlay ? `${basePath}/${files.overlay}` : null,
      linksPath: files.links ? `${basePath}/${files.links}` : null,
      backgroundPath: files.background ? `${basePath}/${files.background}` : null,
      combinedPath: files.overlay ? `/api/communities/${communityId}/map/combined.svg` : null
    }
  };
}

async function buildLotsPayload(req, community, searchTerm = '') {
  const q = String(searchTerm || '').toLowerCase();
  const allLots = community.lots || [];
  const baseLots = q
    ? allLots.filter((l) => (l.address || '').toLowerCase().includes(q))
    : allLots;

  const lotMetaPairs = baseLots.map((lot) => ({ lot, meta: derivePurchaserMeta(lot) }));
  const purchaserIds = Array.from(new Set(
    lotMetaPairs
      .map(({ meta }) => meta.id)
      .filter(Boolean)
      .map((id) => String(id))
  ));

  let contactNameById = new Map();
  let contactById = new Map();
  let closingByContactId = new Map();
  if (purchaserIds.length) {
    const objectIds = purchaserIds
      .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const lookupIds = objectIds.length ? objectIds : purchaserIds;
    const contacts = await Contact.find({
      _id: { $in: lookupIds },
      ...companyFilter(req)
    })
      .select('firstName lastName fullName name email phone status notes lenders.isPrimary lenders.closingDateTime lenders.closingStatus')
      .lean({ virtuals: true });
    contactNameById = new Map();
    contactById = new Map();
    closingByContactId = new Map();
    for (const contact of contacts) {
      const contactId = toStringId(contact._id);
      if (!contactId) continue;
      contactById.set(contactId, contact);

      const name = trimValue(buildContactName(contact));
      if (name) contactNameById.set(contactId, name);

      const lenders = Array.isArray(contact.lenders) ? contact.lenders : [];
      const primary = lenders.find((entry) => entry?.isPrimary) || lenders[0] || null;
      if (primary && (primary.closingDateTime || primary.closingStatus)) {
        closingByContactId.set(contactId, {
          closingDateTime: primary.closingDateTime || null,
          closingStatus: primary.closingStatus || null
        });
      }
    }
  }

  const floorPlanIds = Array.from(new Set(
    baseLots
      .map((lot) => {
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
      .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      .map((id) => new mongoose.Types.ObjectId(id));
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

    if (meta.id) {
      const closing = closingByContactId.get(String(meta.id));
      if (closing) {
        if (!result.closingDateTime && closing.closingDateTime) result.closingDateTime = closing.closingDateTime;
        if (!result.closeDateTime && closing.closingDateTime) result.closeDateTime = closing.closingDateTime;
        if (!result.closeDate && closing.closingDateTime) result.closeDate = closing.closingDateTime;
        if (!result.closingDate && closing.closingDateTime) result.closingDate = closing.closingDateTime;
        if (!result.closingStatus && closing.closingStatus) result.closingStatus = closing.closingStatus;
      }
    }

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

  return lots;
}

function buildCommunityCsv(community, lots) {
  const headers = [
    'Company ID',
    'Community ID',
    'Community Name',
    'Project Number',
    'Market',
    'City',
    'State',
    'Community Created At',
    'Community Updated At',
    'Lot ID',
    'Job Number',
    'Lot',
    'Block',
    'Phase',
    'Address',
    'Elevation',
    'Building Status',
    'Status',
    'General Status',
    'Floor Plan Name',
    'Floor Plan Number',
    'Floor Plan Code',
    'Floor Plan ID',
    'Purchaser Name',
    'Purchaser Email',
    'Purchaser Phone',
    'Purchaser Status',
    'Purchaser Notes',
    'Purchaser ID',
    'Release Date',
    'Expected Completion Date',
    'Close Month',
    'Sales Date',
    'Closing Date/Time',
    'Closing Status',
    'Walk Status',
    'Third Party Date',
    'First Walk Date',
    'Final Sign Off Date',
    'Earnest Amount',
    'Earnest Additional Amount',
    'Earnest Collected Date',
    'Earnest Total',
    'Earnest Entries',
    'Lender',
    'Close DateTime',
    'List Price',
    'Sales Price',
    'Is Published',
    'Is Listed',
    'Published At',
    'Content Synced At',
    'Buildrootz Id',
    'Publish Version',
    'Promo Text',
    'Listing Description',
    'Hero Image',
    'Listing Photos',
    'Live Elevation Photo',
    'Sales Contact Name',
    'Sales Contact Phone',
    'Sales Contact Email',
    'Latitude',
    'Longitude'
  ];

  const rows = lots.map((lot) => {
    const purchaser =
      lot?.purchaser && typeof lot.purchaser === 'object' && !lot.purchaser._bsontype
        ? lot.purchaser
        : null;
    const floorPlan =
      lot?.floorPlan && typeof lot.floorPlan === 'object' && !lot.floorPlan._bsontype
        ? lot.floorPlan
        : null;

    const purchaserName = trimValue(
      lot.purchaserDisplayName ||
      buildContactName(purchaser) ||
      buildContactName(lot?.purchaser)
    );
    const earnestEntries = Array.isArray(lot.earnestEntries)
      ? lot.earnestEntries
          .map((entry) => {
            if (!entry) return '';
            const parts = [];
            if (entry.amount != null) parts.push(entry.amount);
            if (entry.dueDate) parts.push(`due:${formatDate(entry.dueDate)}`);
            if (entry.collectedDate) parts.push(`collected:${formatDate(entry.collectedDate)}`);
            return parts.join(' | ');
          })
          .filter(Boolean)
          .join('; ')
      : '';

    return [
      toStringId(community.company),
      toStringId(community._id),
      trimValue(community.name || community.communityName),
      trimValue(community.projectNumber),
      trimValue(community.market),
      trimValue(community.city),
      trimValue(community.state),
      formatDate(community.createdAt),
      formatDate(community.updatedAt),
      toStringId(lot._id),
      trimValue(lot.jobNumber),
      trimValue(lot.lot),
      trimValue(lot.block),
      trimValue(lot.phase),
      trimValue(lot.address),
      trimValue(lot.elevation),
      trimValue(lot.buildingStatus),
      trimValue(lot.status),
      trimValue(lot.generalStatus),
      trimValue(lot.floorPlanName || deriveFloorPlanName(floorPlan)),
      trimValue(floorPlan?.planNumber),
      trimValue(floorPlan?.code || floorPlan?.title),
      toStringId(floorPlan?._id),
      purchaserName,
      trimValue(purchaser?.email || lot.email),
      trimValue(purchaser?.phone || lot.phone),
      trimValue(purchaser?.status),
      trimValue(purchaser?.notes),
      trimValue(lot.purchaserId || toStringId(purchaser?._id)),
      formatDate(lot.releaseDate),
      formatDate(lot.expectedCompletionDate),
      trimValue(lot.closeMonth),
      formatDate(lot.salesDate),
      formatDate(lot.closingDateTime || lot.closeDateTime || lot.closingDate || lot.closeDate),
      trimValue(lot.closingStatus),
      trimValue(lot.walkStatus),
      formatDate(lot.thirdParty),
      formatDate(lot.firstWalk),
      formatDate(lot.finalSignOff),
      lot.earnestAmount ?? '',
      lot.earnestAdditionalAmount ?? '',
      formatDate(lot.earnestCollectedDate),
      lot.earnestTotal ?? '',
      earnestEntries,
      trimValue(lot.lender),
      formatDate(lot.closeDateTime || lot.closeDate),
      lot.listPrice ?? '',
      lot.salesPrice ?? '',
      lot.isPublished === true ? 'true' : lot.isPublished === false ? 'false' : '',
      lot.isListed === true ? 'true' : lot.isListed === false ? 'false' : '',
      formatDate(lot.publishedAt),
      formatDate(lot.contentSyncedAt),
      listToString(lot.buildrootzId),
      lot.publishVersion ?? '',
      trimValue(lot.promoText),
      trimValue(lot.listingDescription),
      trimValue(lot.heroImage),
      listToString(lot.listingPhotos),
      trimValue(lot.liveElevationPhoto),
      trimValue(lot.salesContactName),
      trimValue(lot.salesContactPhone),
      trimValue(lot.salesContactEmail),
      lot.latitude ?? '',
      lot.longitude ?? ''
    ].map(escapeCsvValue).join(',');
  });

  return [headers.map(escapeCsvValue).join(','), ...rows].join('\r\n');
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
  requireRole(...ADMIN_ROLES),
  upload.single('file'),
  async (req, res) => {
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      // Preload plans for lookup by name/number (supports "Plan 220" or "220")
      const plans = await FloorPlan.find({}, 'name planNumber').lean();
      const planKeyMap = buildPlanKeyMap(plans);

      const grouped = new Map(); // key: name|projectNumber
      for (const row of rows) {
        const name = row['Community Name'];
        const projectNumber = row['Project Number'];

        if (!name || !projectNumber) continue;

        const fpRaw = row['Floor Plan'] || row['Plan'] || row['Plan Number'] || row.plan || '';
        const fpId = normalizePlanKeys(fpRaw)
          .map((k) => planKeyMap.get(k))
          .find(Boolean) || null;

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
  requireRole(...WRITE_ROLES),
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
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const roles = req.user?.roles || [];
      const isSuperAdmin = roles.includes('SUPER_ADMIN');
      const scope = String(req.query.scope || '').toLowerCase();
      const wantCompanyScope = ['company', 'all'].includes(scope);

      const q = String(req.query.q || '').trim();
      const base = { company: req.user.company };
      const accessFilter = isSuperAdmin ? {} : base;

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

      const scoped = (isSuperAdmin || wantCompanyScope)
        ? communities
        : filterCommunitiesForUser(req.user, communities);

      res.json(scoped);
    } catch (err) {
      console.error('Fetch communities error:', err);
      res.status(500).json({ error: 'Failed to fetch communities' });
    }
  }
);

// Map manifest (READONLY+)
router.get('/:communityId/map',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid community id' });
      if (!hasCommunityAccess(req.user, communityId)) return res.status(404).json({ error: 'Community not found' });
      const manifest = readCommunityMapManifest(communityId);
      if (!manifest) return res.status(404).json({ error: 'Map not found for community' });
      res.json(manifest);
    } catch (err) {
      console.error('Get community map manifest failed:', err);
      res.status(500).json({ error: 'Failed to load community map' });
    }
  }
);

// Upload map assets (MANAGER+)
router.post('/:communityId/map',
  requireRole(...ADMIN_ROLES),
  mapUpload.any(),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid community id' });
      if (!hasCommunityAccess(req.user, communityId)) return res.status(404).json({ error: 'Community not found' });

      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

      const dir = getMapDir(communityId);
      const manifest = readCommunityMapManifest(communityId) || {
        mapId: communityId,
        versionId: crypto.randomUUID ? crypto.randomUUID() : new mongoose.Types.ObjectId().toString(),
        exportedAt: new Date().toISOString(),
        files: {}
      };

      const filesMeta = manifest.files || {};
      const jsonCandidates = [];

      files.forEach((file) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ext === '.svg') {
          const fname = safeName('overlay', file.originalname);
          writeFileToDir(dir, fname, file.buffer);
          filesMeta.overlay = fname;
        } else if (ext === '.json') {
          jsonCandidates.push(file);
        } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
          const fname = safeName('background', file.originalname);
          writeFileToDir(dir, fname, file.buffer);
          filesMeta.background = fname;
        }
      });

      // Pick the most link-like JSON (prefer files that actually contain a links array)
      if (jsonCandidates.length) {
        const pickScore = (file) => {
          const name = (file.originalname || '').toLowerCase();
          let score = /links/.test(name) ? 1 : 0;
          try {
            const parsed = JSON.parse(file.buffer.toString('utf8'));
            if (Array.isArray(parsed)) score += 2;
            if (Array.isArray(parsed?.links)) score += 2;
            if (Array.isArray(parsed?.data?.links)) score += 2;
          } catch (_) {
            // ignore parse issues; keep current score
          }
          return score;
        };
        const best = jsonCandidates.reduce((winner, file) => {
          const score = pickScore(file);
          if (!winner || score > winner.score) return { file, score };
          return winner;
        }, null);
        const selected = best?.file || jsonCandidates[0];
        if (selected) {
          const fname = safeName('links', selected.originalname);
          writeFileToDir(dir, fname, selected.buffer);
          filesMeta.links = fname;
        }
      }

      manifest.files = filesMeta;
      manifest.exportedAt = new Date().toISOString();
      ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      const full = readCommunityMapManifest(communityId);
      res.json(full);
    } catch (err) {
      console.error('Upload community map failed:', err);
      res.status(500).json({ error: err.message || 'Failed to upload map' });
    }
  }
);

// Combined SVG with background (READONLY+)
router.get('/:communityId/map/combined.svg',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).send('Invalid community id');
      if (!hasCommunityAccess(req.user, communityId)) return res.status(404).send('Community not found');

      const manifest = readCommunityMapManifest(communityId);
      if (!manifest?.files?.overlay) return res.status(404).send('Map not found');

      const dir = getMapDir(communityId);
      const overlayPath = path.join(dir, manifest.files.overlay);
      const backgroundPath = manifest.files.background ? path.join(dir, manifest.files.background) : null;

      try {
        const overlaySvg = fs.readFileSync(overlayPath, 'utf8');
        if (!backgroundPath || !fs.existsSync(backgroundPath)) {
          res.type('image/svg+xml').send(overlaySvg);
          return;
        }
        const backgroundBuffer = fs.readFileSync(backgroundPath);
        const bgBase64 = backgroundBuffer.toString('base64');

        const svgTagMatch = overlaySvg.match(/<svg[^>]*>/i);
        if (!svgTagMatch) {
          console.warn('combined.svg: <svg> tag not found');
          return res.status(500).send('Invalid SVG');
        }

        let svgTag = svgTagMatch[0];
        const svgStartIdx = svgTagMatch.index;
        const afterSvgOpen = overlaySvg.slice(svgStartIdx + svgTag.length);

        let viewBoxWidth = null;
        let viewBoxHeight = null;
        const viewBoxMatch = svgTag.match(/viewBox\s*=\s*["']([^"']+)["']/i);
        if (viewBoxMatch) {
          const parts = viewBoxMatch[1].trim().split(/\s+/);
          if (parts.length === 4) {
            viewBoxWidth = parts[2];
            viewBoxHeight = parts[3];
          }
        } else {
          const widthMatch = svgTag.match(/width\s*=\s*["']([^"']+)["']/i);
          const heightMatch = svgTag.match(/height\s*=\s*["']([^"']+)["']/i);
          viewBoxWidth = widthMatch ? widthMatch[1] : null;
          viewBoxHeight = heightMatch ? heightMatch[1] : null;
        }

        if (!/preserveAspectRatio\s*=/.test(svgTag)) {
          svgTag = svgTag.replace(/>$/, ' preserveAspectRatio="xMidYMid meet">');
        }

        const imageTag = `<image href="data:image/png;base64,${bgBase64}" x="0" y="0" width="${viewBoxWidth || '100%'}" height="${viewBoxHeight || '100%'}" />`;
        const combinedSvg =
          overlaySvg.slice(0, svgStartIdx) +
          svgTag +
          '\n  ' +
          imageTag +
          '\n' +
          afterSvgOpen;

        res.type('image/svg+xml').send(combinedSvg);
      } catch (err) {
        console.error('Failed to build combined SVG for community map', err);
        res.status(500).send('Failed to build combined SVG');
      }
    } catch (err) {
      console.error('Community combined map error:', err);
      res.status(500).send('Server error');
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? lots search ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/:id/lots?q=address  (READONLY+)
router.get('/:id/lots',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const community = await loadScopedCommunity(req, res);
      if (!community) return;

      const lots = await buildLotsPayload(req, community, req.query.q || '');
      const wantsCsv = String(req.query.format || req.query.export || '').toLowerCase() === 'csv';

      if (wantsCsv) {
        const csv = buildCommunityCsv(community, lots);
        const safeName = sanitizeFilename(community.name || community.communityName || community._id);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}-lots.csv"`);
        return res.send(csv);
      }

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
  requireRole(...READ_ROLES),
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
  requireRole(...WRITE_ROLES),
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
  requireRole(...READ_ROLES),
  async (req, res, next) => {
    try {
      const scope = String(req.query.scope || '').toLowerCase();
      const wantCompanyScope = ['company', 'all'].includes(scope);

      const rows = await Community.find({ ...companyFilter(req) })
        .select('name communityName builder builderName')
        .sort({ name: 1, communityName: 1 })
        .lean();

      const filtered = (isSuper(req) || wantCompanyScope)
        ? rows
        : filterCommunitiesForUser(req.user, rows);

      const data = filtered.map(c => {
        const name = c.name || c.communityName || '(unnamed)';
        const builder = c.builder || c.builderName || '';
        return { id: c._id, label: builder ? `${builder} ??? ${name}` : name };
      });
      res.json(data);
    } catch (e) { next(e); }
  }
);

// BuildRootz community profile (description/hero image)
router.get('/:id/buildrootz-profile',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid community id' });
      if (!hasCommunityAccess(req.user, id)) return res.status(404).json({ error: 'Community not found' });

      const community = await Community.findOne({ _id: id, ...companyFilter(req) }).select('name city state').lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const profile = await CommunityCompetitionProfile.findOne({ community: id, ...companyFilter(req) })
        .select('buildrootzDescription heroImage')
        .lean();

      return res.json({
        communityId: String(community._id),
        name: community.name || '',
        city: community.city || '',
        state: community.state || '',
        buildrootzDescription: profile?.buildrootzDescription || '',
        heroImage: profile?.heroImage || ''
      });
    } catch (err) {
      console.error('[buildrootz-profile:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id/buildrootz-profile',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid community id' });
      if (!hasCommunityAccess(req.user, id)) return res.status(404).json({ error: 'Community not found' });

      const { buildrootzDescription, heroImage } = req.body || {};
      const update = {};
      if (buildrootzDescription !== undefined) update.buildrootzDescription = trimValue(buildrootzDescription);
      if (heroImage !== undefined) update.heroImage = trimValue(heroImage);

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: id },
        { $set: { ...update, company: req.user.company } },
        { new: true, upsert: true }
      ).select('buildrootzDescription heroImage');

      const community = await Community.findOne({ _id: id, ...companyFilter(req) }).select('name city state').lean();

      return res.json({
        communityId: id,
        name: community?.name || '',
        city: community?.city || '',
        state: community?.state || '',
        buildrootzDescription: profile?.buildrootzDescription || '',
        heroImage: profile?.heroImage || ''
      });
    } catch (err) {
      console.error('[buildrootz-profile:put]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post('/:id/buildrootz/publish',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid community id' });
      if (!hasCommunityAccess(req.user, id)) return res.status(404).json({ error: 'Community not found' });

      // Optionally persist incoming fields before publish
      const { buildrootzDescription, heroImage } = req.body || {};
      const update = {};
      if (buildrootzDescription !== undefined) update.buildrootzDescription = trimValue(buildrootzDescription);
      if (heroImage !== undefined) update.heroImage = trimValue(heroImage);
      if (Object.keys(update).length) {
        await CommunityCompetitionProfile.findOneAndUpdate(
          { community: id },
          { $set: { ...update, company: req.user.company } },
          { new: true, upsert: true }
        );
      }

      const result = await publishCommunity(id, req.user.company, req.user?._id);
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error('[buildrootz-profile:publish]', err);
      const status = err?.status || 500;
      res.status(status).json({ error: err.message || 'Publish failed' });
    }
  }
);

// ??????????????????????????????????????????????????????????????????????????? plans for community ???????????????????????????????????????????????????????????????????????????
// GET /api/communities/:id/floorplans  (READONLY+)
router.get('/:id/floorplans',
  requireRole(...READ_ROLES),
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
  requireRole(...READ_ROLES),
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
  requireRole(...WRITE_ROLES),
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
  requireRole(...WRITE_ROLES),
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
  requireRole(...ADMIN_ROLES),
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
      await syncInternalCompetitions(updated);
      res.json(updated);
    } catch (err) {
      console.error('Update community failed:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// DELETE /api/communities/:id  (MANAGER+)
router.delete('/:id',
  requireRole(...ADMIN_ROLES),
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
  requireRole(...WRITE_ROLES),
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
  requireRole(...ADMIN_ROLES),
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


