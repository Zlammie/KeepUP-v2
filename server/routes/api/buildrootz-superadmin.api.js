const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const BuildRootzCommunityRequest = require('../../models/BuildRootzCommunityRequest');
const Community = require('../../models/Community');
const { buildrootzFetch } = require('../../services/buildrootzClient');

const router = express.Router();
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return '';
};

const resolvePublicCommunityIdFromPayload = (payload, fallbackCommunityId = '') =>
  firstNonEmptyString(
    payload?.publicCommunityId,
    payload?._id,
    payload?.communityId,
    fallbackCommunityId
  );

async function loadRequestOr404(id) {
  if (!isObjectId(id)) return null;
  return BuildRootzCommunityRequest.findById(id);
}

async function updateCommunityMapping({
  communityId,
  buildrootzCommunityId,
  publicCommunityId,
  canonicalName,
  mappedByUserId
}) {
  const community = await Community.findById(communityId);
  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  community.buildrootz = community.buildrootz || {};
  community.buildrootz.communityId = buildrootzCommunityId;
  community.buildrootz.publicCommunityId = publicCommunityId || null;
  community.buildrootz.canonicalName = canonicalName || '';
  community.buildrootz.mappedAt = new Date();
  community.buildrootz.mappedByUserId = mappedByUserId || null;
  community.markModified('buildrootz');
  await community.save();
}

router.post(
  '/community-requests/:id/link',
  requireRole('SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const brId = (req.body?.buildrootzCommunityId || '').toString().trim();
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid request id' });
      if (!isObjectId(brId)) return res.status(400).json({ error: 'Invalid BuildRootz community id' });

      const requestDoc = await loadRequestOr404(id);
      if (!requestDoc) return res.status(404).json({ error: 'Request not found' });
      if (requestDoc.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

      let brCommunity;
      try {
        brCommunity = await buildrootzFetch(`/api/internal/communities/${brId}`);
      } catch (err) {
        if (err.message === 'BUILDROOTZ_AUTH_FAILED') return res.status(500).json({ error: 'BUILDROOTZ_AUTH_FAILED' });
        if (err.status === 404) return res.status(404).json({ error: 'BUILDROOTZ_COMMUNITY_NOT_FOUND' });
        return res.status(err.status || 502).json({ error: err.message || 'BUILDROOTZ_UNAVAILABLE' });
      }
      const resolvedCommunityId = firstNonEmptyString(brCommunity?._id, brId);
      const resolvedPublicCommunityId = resolvePublicCommunityIdFromPayload(
        brCommunity,
        resolvedCommunityId
      );

      requestDoc.status = 'linked';
      requestDoc.decision = 'link';
      requestDoc.resolvedBuildRootzCommunityId = resolvedCommunityId;
      requestDoc.resolvedPublicCommunityId = resolvedPublicCommunityId;
      requestDoc.resolvedCanonicalName = brCommunity.canonicalName || brCommunity.name || '';
      requestDoc.reviewedByUserId = req.user?._id || null;
      requestDoc.reviewedAt = new Date();
      await requestDoc.save();

      await Community.findByIdAndUpdate(requestDoc.keepupCommunityId, {
        $set: {
          'buildrootz.request': {
            requestId: String(requestDoc._id),
            status: 'linked',
            requestedName: requestDoc.requestedName,
            requestedAt: requestDoc.submittedAt,
            lastCheckedAt: new Date(),
            resolvedCommunityId: resolvedCommunityId,
            resolvedPublicCommunityId: resolvedPublicCommunityId || null,
            resolvedAt: new Date(),
            rejectedReason: ''
          }
        }
      }).catch(() => {});

      await updateCommunityMapping({
        communityId: requestDoc.keepupCommunityId,
        buildrootzCommunityId: requestDoc.resolvedBuildRootzCommunityId,
        publicCommunityId: requestDoc.resolvedPublicCommunityId,
        canonicalName: requestDoc.resolvedCanonicalName,
        mappedByUserId: req.user?._id || null
      });

      return res.json({
        ok: true,
        communityId: requestDoc.resolvedBuildRootzCommunityId,
        publicCommunityId: requestDoc.resolvedPublicCommunityId || null
      });
    } catch (err) {
      console.error('[buildrootz request link]', err);
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

router.post(
  '/community-requests/:id/approve-create',
  requireRole('SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, city, state, notes } = req.body || {};
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid request id' });
      if (!name || !city || !state) {
        return res.status(400).json({ error: 'name, city, and state are required' });
      }

      const requestDoc = await loadRequestOr404(id);
      if (!requestDoc) return res.status(404).json({ error: 'Request not found' });
      if (requestDoc.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

      let brCommunity;
      let created = true;
      try {
        brCommunity = await buildrootzFetch('/api/internal/communities', {
          method: 'POST',
          body: { name, city, state, notes }
        });
      } catch (err) {
        if (err.message === 'BUILDROOTZ_AUTH_FAILED') return res.status(500).json({ error: 'BUILDROOTZ_AUTH_FAILED' });
        if (err.status === 409 && err.payload?.error === 'COMMUNITY_ALREADY_EXISTS') {
          created = false;
          brCommunity = {
            communityId: err.payload.communityId,
            publicCommunityId: err.payload.publicCommunityId || '',
            canonicalName: err.payload.canonicalName || name,
            city: err.payload.city || city,
            state: err.payload.state || state,
            slug: err.payload.slug || ''
          };
        } else {
          return res.status(err.status || 502).json({ error: err.message || 'BUILDROOTZ_UNAVAILABLE' });
        }
      }

      const resolvedCommunityId = firstNonEmptyString(brCommunity?.communityId, brCommunity?._id);
      const resolvedPublicCommunityId = resolvePublicCommunityIdFromPayload(
        brCommunity,
        resolvedCommunityId
      );
      if (!resolvedCommunityId) {
        return res.status(502).json({ error: 'BUILDROOTZ_COMMUNITY_ID_MISSING' });
      }
      const resolvedCanonicalName = brCommunity.canonicalName || brCommunity.name || name;

      requestDoc.status = created ? 'approved' : 'linked';
      requestDoc.decision = created ? 'create' : 'link';
      requestDoc.resolvedBuildRootzCommunityId = resolvedCommunityId;
      requestDoc.resolvedPublicCommunityId = resolvedPublicCommunityId;
      requestDoc.resolvedCanonicalName = resolvedCanonicalName;
      requestDoc.reviewedByUserId = req.user?._id || null;
      requestDoc.reviewedAt = new Date();
      requestDoc.buildrootzCreatePayload = { name, city, state, notes: notes || '' };
      await requestDoc.save();

      await Community.findByIdAndUpdate(requestDoc.keepupCommunityId, {
        $set: {
          'buildrootz.request': {
            requestId: String(requestDoc._id),
            status: requestDoc.status,
            requestedName: requestDoc.requestedName,
            requestedAt: requestDoc.submittedAt,
            lastCheckedAt: new Date(),
            resolvedCommunityId: resolvedCommunityId,
            resolvedPublicCommunityId: resolvedPublicCommunityId || null,
            resolvedAt: new Date(),
            rejectedReason: ''
          }
        }
      }).catch(() => {});

      await updateCommunityMapping({
        communityId: requestDoc.keepupCommunityId,
        buildrootzCommunityId: resolvedCommunityId,
        publicCommunityId: resolvedPublicCommunityId,
        canonicalName: resolvedCanonicalName,
        mappedByUserId: req.user?._id || null
      });

      return res.json({
        ok: true,
        communityId: resolvedCommunityId,
        publicCommunityId: resolvedPublicCommunityId || null,
        canonicalName: resolvedCanonicalName
      });
    } catch (err) {
      console.error('[buildrootz request approve-create]', err);
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

router.post(
  '/community-requests/:id/reject',
  requireRole('SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const reason = (req.body?.reason || '').toString().trim();
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid request id' });
      if (!reason) return res.status(400).json({ error: 'Reason is required' });

      const requestDoc = await loadRequestOr404(id);
      if (!requestDoc) return res.status(404).json({ error: 'Request not found' });
      if (requestDoc.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

      requestDoc.status = 'rejected';
      requestDoc.decision = 'reject';
      requestDoc.rejectedReason = reason;
      requestDoc.reviewedByUserId = req.user?._id || null;
      requestDoc.reviewedAt = new Date();
      await requestDoc.save();

      await Community.findByIdAndUpdate(requestDoc.keepupCommunityId, {
        $set: {
          'buildrootz.request': {
            requestId: String(requestDoc._id),
            status: 'rejected',
            requestedName: requestDoc.requestedName,
            requestedAt: requestDoc.submittedAt,
            lastCheckedAt: new Date(),
            resolvedCommunityId: null,
            resolvedPublicCommunityId: null,
            resolvedAt: null,
            rejectedReason: reason
          }
        }
      }).catch(() => {});

      return res.json({ ok: true });
    } catch (err) {
      console.error('[buildrootz request reject]', err);
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

module.exports = router;
