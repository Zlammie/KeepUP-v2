const express = require('express');
const BrzPublishedSnapshot = require('../models/brz/BrzPublishedSnapshot');
const slugify = require('../utils/slugify');

const router = express.Router();

router.get('/builders/:builderSlug', async (req, res, next) => {
  try {
    const builderSlug = slugify(req.params.builderSlug || '');
    if (!builderSlug) {
      return res.status(400).json({ error: 'Invalid builder slug' });
    }

    const snapshot = await BrzPublishedSnapshot.findOne({ builderSlug })
      .sort({ version: -1, publishedAt: -1 })
      .lean();

    if (!snapshot) {
      return res.status(404).json({ error: 'No published snapshot found' });
    }

    const publishedAtMs = new Date(snapshot.publishedAt).getTime();
    const etag = `"brz-${snapshot.builderSlug}-${snapshot.version}-${publishedAtMs}"`;
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');

    return res.json({
      ...snapshot.payload,
      meta: {
        builderSlug: snapshot.builderSlug,
        version: snapshot.version,
        publishedAt: snapshot.publishedAt
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
