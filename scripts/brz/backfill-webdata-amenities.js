/* eslint-disable no-console */
const mongoose = require('mongoose');

require('../../server/bootstrap/env');

const CommunityCompetitionProfile = require('../../server/models/communityCompetitionProfile');
const { normalizeCommunityAmenities } = require('../../server/services/communityWebDataService');
const { syncCommunityDraftFromCompetition } = require('../../server/services/brzPublishingService');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log(`[backfill-webdata-amenities] connected (${DRY_RUN ? 'DRY_RUN' : 'WRITE'})`);

  const cursor = CommunityCompetitionProfile.find({
    'communityAmenities.0': { $exists: true }
  })
    .select('_id company community communityAmenities webData.amenities')
    .cursor();

  const stats = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    syncCalled: 0,
    syncFailed: 0
  };

  for await (const profile of cursor) {
    stats.scanned += 1;

    const normalizedLegacyAmenities = normalizeCommunityAmenities(profile?.communityAmenities);
    const existingCanonicalAmenities = normalizeCommunityAmenities(profile?.webData?.amenities);

    if (!normalizedLegacyAmenities.length || existingCanonicalAmenities.length) {
      stats.skipped += 1;
      continue;
    }

    const profileId = String(profile._id);
    const communityId = String(profile.community || '');
    const companyId = profile.company;

    if (DRY_RUN) {
      stats.updated += 1;
      console.log('[backfill-webdata-amenities] would update', {
        profileId,
        communityId,
        amenities: normalizedLegacyAmenities
      });
      continue;
    }

    await CommunityCompetitionProfile.updateOne(
      { _id: profile._id },
      {
        $set: {
          'webData.amenities': normalizedLegacyAmenities,
          webDataUpdatedAt: new Date()
        }
      }
    );
    stats.updated += 1;

    try {
      await syncCommunityDraftFromCompetition({
        companyId,
        communityId
      });
      stats.syncCalled += 1;
    } catch (err) {
      stats.syncFailed += 1;
      console.error('[backfill-webdata-amenities] sync failed', {
        profileId,
        communityId,
        error: err?.message || err
      });
    }

    console.log('[backfill-webdata-amenities] updated', {
      profileId,
      communityId,
      amenitiesCount: normalizedLegacyAmenities.length
    });
  }

  console.log('[backfill-webdata-amenities] complete', stats);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[backfill-webdata-amenities] failed', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // no-op
  }
  process.exitCode = 1;
});
