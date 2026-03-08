const express = require('express');
const multer = require('multer');

const requireRole = require('../../middleware/requireRole');
const EmailAsset = require('../../models/EmailAsset');
const { saveImage } = require('../../services/emailAssetsStorage');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const MAX_BYTES = Number(process.env.EMAIL_ASSET_MAX_BYTES) || 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES }
});

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const kind = String(req.query?.kind || 'image');
    const filter = { companyId: req.user.company, kind };
    if (String(req.query?.includeArchived || '').toLowerCase() !== 'true') {
      filter.isArchived = { $ne: true };
    }
    const assets = await EmailAsset.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({
      assets: assets.map((asset) => ({
        assetId: asset._id,
        url: asset.storage?.url,
        originalName: asset.originalName,
        createdAt: asset.createdAt,
        size: asset.size,
        width: asset.width,
        height: asset.height
      }))
    });
  } catch (err) {
    console.error('[email-assets] list failed', err);
    res.status(500).json({ error: 'Failed to load assets' });
  }
});

router.post('/upload', requireRole(...MANAGE_ROLES), upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Image file is required' });
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(400).json({ error: 'Unsupported image type' });
    }

    const stored = await saveImage({
      companyId: req.user.company,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname
    });

    const asset = await EmailAsset.create({
      companyId: req.user.company,
      uploadedBy: req.user._id,
      kind: 'image',
      originalName: stored.originalName,
      mimeType: file.mimetype,
      size: stored.size,
      storage: {
        provider: 'local',
        key: stored.key,
        url: stored.url
      }
    });

    res.status(201).json({
      assetId: asset._id,
      url: stored.url,
      originalName: stored.originalName,
      size: stored.size
    });
  } catch (err) {
    console.error('[email-assets] upload failed', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

module.exports = router;
