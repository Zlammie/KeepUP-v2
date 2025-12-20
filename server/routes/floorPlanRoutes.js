const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pdfjsLib = require('pdfjs-dist');
const { createCanvas } = require('@napi-rs/canvas');
const router  = express.Router();

const FloorPlan = require('../models/FloorPlan');
const Community = require('../models/Community');
const upload = require('../middleware/upload');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });
const READ_ROLES = ['READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const WRITE_ROLES = ['USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const ADMIN_ROLES = ['MANAGER','COMPANY_ADMIN','SUPER_ADMIN'];
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), 'uploads');

const toPublicPath = (absPath) => {
  if (!absPath) return '';
  const rel = path.relative(uploadsDir, absPath).replace(/\\/g, '/');
  return `/uploads/${rel}`;
};

async function buildPreview(inputPath, mimeType) {
  const ext = path.extname(inputPath).toLowerCase();
  const base = path.basename(inputPath, ext);
  const previewPath = path.join(path.dirname(inputPath), `${base}-preview.png`);

  const isPdf = ext === '.pdf' || (mimeType && mimeType.toLowerCase().includes('pdf'));

  // First try sharp (fast path if libvips has PDF support)
  try {
    const sharpInput = isPdf ? { density: 200, page: 0 } : {};
    await sharp(inputPath, sharpInput).png().toFile(previewPath);
    return previewPath;
  } catch (err) {
    if (!isPdf) throw err;
    console.warn('Sharp PDF preview failed, falling back to pdfjs/canvas:', err?.message || err);
  }

  // Fallback: render first page via pdfjs + canvas (no external binaries)
  try {
    const data = new Uint8Array(fs.readFileSync(inputPath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(previewPath, buffer);
    return previewPath;
  } catch (err) {
    console.error('PDF preview fallback failed:', err?.message || err);
    throw err;
  }
}

async function assertCommunitiesInTenant(req, ids = []) {
  if (!ids || !ids.length) return;
  const filter = { _id: { $in: ids } , ...companyFilter(req) };
  const count = await Community.countDocuments(filter);
  if (count !== ids.length) {
    const err = new Error('One or more communities are not in your company');
    err.status = 400;
    throw err;
  }
}

function sanitizeAsset(asset = {}) {
  if (!asset || typeof asset !== 'object') return null;
  const cleaned = {
    fileUrl: typeof asset.fileUrl === 'string' ? asset.fileUrl : '',
    previewUrl: typeof asset.previewUrl === 'string' ? asset.previewUrl : '',
    originalFilename: typeof asset.originalFilename === 'string' ? asset.originalFilename : '',
    mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : ''
  };

  const hasContent = Object.values(cleaned).some((v) => v && String(v).trim().length);
  return hasContent ? cleaned : null;
}

function sanitizeElevations(elevations) {
  if (!Array.isArray(elevations)) return [];
  return elevations
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const asset = sanitizeAsset(item.asset || {});
      const sqftRaw = item.squareFeet ?? item.sqft ?? item.squarefeet;
      const sqftNum = Number(sqftRaw);
      const squareFeet =
        sqftRaw === '' || sqftRaw == null || Number.isNaN(sqftNum) ? null : sqftNum;
      if (!name && !asset && squareFeet == null) return null;
      const entry = { name };
      if (asset) entry.asset = asset;
      if (squareFeet != null) entry.squareFeet = squareFeet;
      return entry;
    })
    .filter(Boolean);
}

// all routes require auth
router.use(ensureAuth);

/**
 * GET /api/floorplans?q=2007
 * Read: READONLY+
 */
router.get('/',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const filter = {
        ...companyFilter(req),
        ...(q ? { $or: [
          { planNumber: { $regex: q, $options: 'i' } },
          { name:       { $regex: q, $options: 'i' } },
        ] } : {})
      };

      const plans = await FloorPlan
        .find(filter)
        .populate({ path: 'communities', select: 'name city state company' })
        .lean();

      res.json(plans);
    } catch (err) {
      console.error('Error fetching floor plans:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST /api/floorplans/upload
 * Upload a floor plan file (PDF/image) and generate a PNG preview for use in UI.
 */
router.post('/upload',
  requireRole(...WRITE_ROLES),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File is required' });

      const mime = req.file.mimetype || '';
      if (!(mime.includes('pdf') || mime.startsWith('image/'))) {
        return res.status(400).json({ error: 'Only PDF or image files are allowed' });
      }

      const absPath = req.file.path;
      let previewPath = '';
      let previewError = null;

      try {
        previewPath = await buildPreview(absPath, req.file.mimetype);
      } catch (err) {
        console.error('Failed to generate preview, returning original file:', err.message);
        previewPath = '';
        previewError = err?.message || 'Preview generation failed';
      }

      res.json({
        fileUrl: toPublicPath(absPath),
        previewUrl: previewPath ? toPublicPath(previewPath) : '',
        originalFilename: req.file.originalname || '',
        mimeType: req.file.mimetype || '',
        previewError
      });
    } catch (err) {
      console.error('Error uploading floor plan file:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

/**
 * GET /api/floorplans/:id
 * Read: READONLY+
 */
router.get('/:id',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const plan = await FloorPlan
        .findOne({ _id: id, ...companyFilter(req) })
        .populate({ path: 'communities', select: 'name city state company' })
        .lean();

      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
      res.json(plan);
    } catch (err) {
      console.error('Error fetching floor plan:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST /api/floorplans
 * Create: USER+
 * Body: { planNumber, name, specs, communities? }
 * - stamps company server-side
 * - validates community ids belong to same tenant
 */
router.post('/',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { planNumber, name, specs = {}, communities = [], asset = null, elevations = null } = req.body;
      if (!planNumber || !name) return res.status(400).json({ error: 'planNumber and name are required' });

      // ensure linked communities are in caller's company
      const communityIds = communities.filter(isObjectId);
      await assertCommunitiesInTenant(req, communityIds);

      // stamp company (non-super cannot spoof)
      const body = {
        planNumber: String(planNumber).trim(),
        name: String(name).trim(),
        specs,
        communities: communityIds,
        company: isSuper(req) ? (req.body.company || req.user.company) : req.user.company
      };

      const normalizedAsset = sanitizeAsset(asset);
      if (normalizedAsset) body.asset = normalizedAsset;
      const normalizedElevations = sanitizeElevations(elevations);
      if (normalizedElevations.length) body.elevations = normalizedElevations;

      const newPlan = await FloorPlan.create(body);
      res.status(201).json(newPlan);
    } catch (err) {
      console.error('Error creating floor plan:', err);
      const code = err?.code === 11000 ? 409 : 400; // duplicate key → 409
      res.status(code).json({ error: err.message || 'Failed to create floor plan' });
    }
  }
);

/**
 * PUT /api/floorplans/:id
 * Update: USER+
 * - blocks cross-tenant moves
 * - validates communities belong to same tenant when provided
 */
router.put('/:id',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const updates = { ...req.body };
      delete updates.company; // never allow company to change

      if (Array.isArray(updates.communities)) {
        const communityIds = updates.communities.filter(isObjectId);
        await assertCommunitiesInTenant(req, communityIds);
        updates.communities = communityIds;
      }

      const removeAsset = String(updates.removeAsset || '').toLowerCase();
      const shouldRemoveAsset = ['true', '1', 'yes', 'on'].includes(removeAsset);
      delete updates.removeAsset;

      const normalizedAsset = sanitizeAsset(updates.asset);
      if (normalizedAsset) {
        updates.asset = normalizedAsset;
      } else if (shouldRemoveAsset) {
        updates.asset = {
          fileUrl: '',
          previewUrl: '',
          originalFilename: '',
          mimeType: ''
        };
      } else {
        delete updates.asset;
      }
      const normalizedElevations = sanitizeElevations(updates.elevations);
      updates.elevations = normalizedElevations;

      const plan = await FloorPlan.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        updates,
        { new: true, runValidators: true }
      );

      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
      res.json(plan);
    } catch (err) {
      console.error('Error updating floor plan:', err);
      const code = err?.code === 11000 ? 409 : 400;
      res.status(code).json({ error: err.message || 'Failed to update floor plan' });
    }
  }
);

/**
 * DELETE /api/floorplans/:id
 * Delete: MANAGER+
 */
router.delete('/:id',
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

      const plan = await FloorPlan.findOneAndDelete({ _id: id, ...companyFilter(req) });
      if (!plan) return res.status(404).json({ error: 'Floor plan not found' });

      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting floor plan:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
