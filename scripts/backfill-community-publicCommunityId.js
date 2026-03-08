/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const Community = require('../server/models/Community');
const BuildRootzCommunityRequest = require('../server/models/BuildRootzCommunityRequest');
const { buildrootzFetch } = require('../server/services/buildrootzClient');

const DEFAULT_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
const COMPANY_ID = String(process.env.COMPANY_ID || '').trim();

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

async function fetchBrCommunity(legacyCommunityId) {
  try {
    return await buildrootzFetch(`/api/internal/communities/${encodeURIComponent(legacyCommunityId)}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

async function run() {
  if (COMPANY_ID && !isObjectId(COMPANY_ID)) {
    throw new Error('COMPANY_ID must be a valid ObjectId');
  }

  await mongoose.connect(DEFAULT_URI);

  const query = {
    'buildrootz.communityId': { $exists: true, $nin: [null, ''] },
    $or: [
      { 'buildrootz.publicCommunityId': { $exists: false } },
      { 'buildrootz.publicCommunityId': null },
      { 'buildrootz.publicCommunityId': '' }
    ]
  };
  if (COMPANY_ID) query.company = new mongoose.Types.ObjectId(COMPANY_ID);

  const cursor = Community.find(query)
    .select('_id company name buildrootz')
    .cursor();

  const stats = {
    scanned: 0,
    unresolved: 0,
    wouldUpdate: 0,
    updated: 0,
    requestDocsUpdated: 0,
    failed: 0
  };

  console.log(`[backfill-community-publicCommunityId] mode=${DRY_RUN ? 'DRY_RUN' : 'WRITE'}`);

  for await (const community of cursor) {
    stats.scanned += 1;
    const legacyCommunityId = firstNonEmptyString(community?.buildrootz?.communityId);
    if (!legacyCommunityId) {
      stats.unresolved += 1;
      continue;
    }

    let brCommunity = null;
    try {
      brCommunity = await fetchBrCommunity(legacyCommunityId);
    } catch (err) {
      stats.failed += 1;
      console.error('[backfill] lookup failed', {
        communityId: String(community._id),
        legacyCommunityId,
        error: err?.message || err
      });
      continue;
    }

    if (!brCommunity) {
      stats.unresolved += 1;
      console.log('[backfill] not found in BuildRootz', {
        communityId: String(community._id),
        legacyCommunityId
      });
      continue;
    }

    const resolvedPublicCommunityId = resolvePublicCommunityIdFromPayload(
      brCommunity,
      legacyCommunityId
    );
    if (!resolvedPublicCommunityId) {
      stats.unresolved += 1;
      console.log('[backfill] missing canonical id in response', {
        communityId: String(community._id),
        legacyCommunityId
      });
      continue;
    }

    if (DRY_RUN) {
      stats.wouldUpdate += 1;
      console.log('[backfill] would update', {
        communityId: String(community._id),
        legacyCommunityId,
        publicCommunityId: resolvedPublicCommunityId
      });
      continue;
    }

    const set = {
      'buildrootz.publicCommunityId': resolvedPublicCommunityId
    };
    if (community?.buildrootz?.request && typeof community.buildrootz.request === 'object') {
      set['buildrootz.request.resolvedPublicCommunityId'] = resolvedPublicCommunityId;
    }

    await Community.updateOne({ _id: community._id }, { $set: set });
    const requestResult = await BuildRootzCommunityRequest.updateMany(
      {
        keepupCommunityId: community._id,
        resolvedBuildRootzCommunityId: legacyCommunityId,
        $or: [
          { resolvedPublicCommunityId: { $exists: false } },
          { resolvedPublicCommunityId: null },
          { resolvedPublicCommunityId: '' }
        ]
      },
      { $set: { resolvedPublicCommunityId: resolvedPublicCommunityId } }
    );

    stats.updated += 1;
    stats.requestDocsUpdated += Number(requestResult?.modifiedCount || 0);
    console.log('[backfill] updated', {
      communityId: String(community._id),
      legacyCommunityId,
      publicCommunityId: resolvedPublicCommunityId,
      requestDocsUpdated: Number(requestResult?.modifiedCount || 0)
    });
  }

  console.log('[backfill-community-publicCommunityId] complete', stats);
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[backfill-community-publicCommunityId] failed', err);
  process.exitCode = 1;
});

