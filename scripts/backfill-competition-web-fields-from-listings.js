/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const Community = require('../server/models/Community');
const CommunityCompetitionProfile = require('../server/models/communityCompetitionProfile');
const {
  competitionProfileToWebData,
  mergeCompetitionWebData,
  competitionWebDataToProfileSet
} = require('../server/services/communityWebDataService');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log(`[backfill] connected (${DRY_RUN ? 'DRY_RUN' : 'WRITE'})`);

  const cursor = Community.find({})
    .select('_id company name lots._id lots.address lots.floorPlan lots.generalStatus lots.status lots.salesContactName lots.salesContactPhone lots.salesContactEmail')
    .cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const community of cursor) {
    scanned += 1;
    const profile = await CommunityCompetitionProfile.findOne({
      company: community.company,
      community: community._id
    }).lean();

    const current = competitionProfileToWebData(profile, community);
    const lots = Array.isArray(community.lots) ? community.lots : [];

    const needsContact = !current.primaryContact?.name && !current.primaryContact?.phone && !current.primaryContact?.email;
    const contactLot = needsContact
      ? lots.find((lot) => lot?.salesContactName || lot?.salesContactPhone || lot?.salesContactEmail)
      : null;

    const needsModel = !current.modelListingId;
    const modelLot = needsModel
      ? (lots.find((lot) => String(lot?.generalStatus || lot?.status || '').toLowerCase() === 'model')
        || lots.find((lot) => lot?.floorPlan)
        || lots[0])
      : null;

    const patch = {};
    if (contactLot) {
      patch.primaryContact = {
        name: contactLot.salesContactName || '',
        phone: contactLot.salesContactPhone || '',
        email: contactLot.salesContactEmail || ''
      };
    }
    if (modelLot && modelLot?._id) {
      patch.modelListingId = String(modelLot._id);
      if (!current.modelFloorPlanId && modelLot.floorPlan) {
        patch.modelFloorPlanId = String(modelLot.floorPlan);
      }
    }

    if (!Object.keys(patch).length) {
      skipped += 1;
      continue;
    }

    const next = mergeCompetitionWebData(current, patch);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (!changed) {
      skipped += 1;
      continue;
    }

    if (!DRY_RUN) {
      await CommunityCompetitionProfile.findOneAndUpdate(
        { company: community.company, community: community._id },
        {
          $set: competitionWebDataToProfileSet(next),
          $setOnInsert: {
            company: community.company,
            community: community._id
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    updated += 1;
    console.log(`[backfill] ${DRY_RUN ? 'would update' : 'updated'} community ${community.name || community._id}`);
  }

  console.log(`[backfill] scanned=${scanned} updated=${updated} skipped=${skipped} mode=${DRY_RUN ? 'DRY_RUN' : 'WRITE'}`);
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[backfill] failed', err);
  process.exitCode = 1;
});
