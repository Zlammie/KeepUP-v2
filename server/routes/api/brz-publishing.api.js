const fs = require('fs/promises');
const express = require('express');
const mongoose = require('mongoose');
const upload = require('../../middleware/upload');
const requireCompanyAdmin = require('../../middleware/requireCompanyAdmin');
const {
  bootstrapPublishingData,
  updateBuilderProfileDraft,
  updateCommunityDraft,
  updateFloorPlanDraft,
  publishCompanySnapshot,
  sanitizeImageMeta
} = require('../../services/brzPublishingService');
const { saveImage } = require('../../services/imageStorage');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const safeUnlink = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {
    // best effort
  }
};

const resolveCompanyId = (req) => req.user?.company || null;

router.use(requireCompanyAdmin);

router.get('/bootstrap', async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }
    const payload = await bootstrapPublishingData({ companyId });
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }
    const draft = await updateBuilderProfileDraft({
      companyId,
      updates: req.body || {}
    });
    return res.json({ ok: true, profileDraft: draft });
  } catch (err) {
    return next(err);
  }
});

router.put('/community/:communityId', async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }
    const data = await updateCommunityDraft({
      companyId,
      communityId: req.params.communityId,
      updates: req.body || {}
    });
    return res.json({ ok: true, ...data });
  } catch (err) {
    return next(err);
  }
});

router.put('/floorplan/:floorPlanId', async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }
    const data = await updateFloorPlanDraft({
      companyId,
      floorPlanId: req.params.floorPlanId,
      updates: req.body || {}
    });
    return res.json({ ok: true, ...data });
  } catch (err) {
    return next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      if (req.file?.path) await safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Invalid company context' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }
    const mime = String(req.file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      await safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Only image uploads are supported' });
    }

    const type = String(req.query.type || '').trim().toLowerCase();
    let metadata = null;
    let updated = null;

    if (type === 'hero') {
      metadata = await saveImage(req.file, 'builder-profile');
      const profileDraft = await updateBuilderProfileDraft({
        companyId,
        updates: { heroImage: metadata }
      });
      updated = { profileDraft };
    } else if (type === 'floorplan') {
      const floorPlanId = req.query.floorPlanId;
      if (!isObjectId(floorPlanId)) {
        await safeUnlink(req.file.path);
        return res.status(400).json({ error: 'floorPlanId is required for floorplan upload' });
      }
      metadata = await saveImage(req.file, 'floor-plans');
      const floorPlan = await updateFloorPlanDraft({
        companyId,
        floorPlanId,
        updates: { primaryImage: metadata }
      });
      updated = { floorPlan };
    } else if (type === 'community') {
      const communityId = req.query.communityId;
      if (!isObjectId(communityId)) {
        await safeUnlink(req.file.path);
        return res.status(400).json({ error: 'communityId is required for community upload' });
      }
      metadata = await saveImage(req.file, 'communities');
      const community = await updateCommunityDraft({
        companyId,
        communityId,
        updates: { heroImage: sanitizeImageMeta(metadata) }
      });
      updated = { community };
    } else {
      await safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Invalid upload type. Use hero, floorplan, or community.' });
    }

    return res.json({
      ok: true,
      type,
      image: metadata,
      ...updated
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/publish', async (req, res, next) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company context' });
    }
    const result = await publishCompanySnapshot({
      companyId,
      publishedBy: req.user?._id || null
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
