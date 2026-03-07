const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const Competition = require('../../server/models/Competition');
const CommunityCompetitionProfile = require('../../server/models/communityCompetitionProfile');
const FloorPlan = require('../../server/models/FloorPlan');
const BrzCommunityDraft = require('../../server/models/brz/BrzCommunityDraft');
const BrzFloorPlanDraft = require('../../server/models/brz/BrzFloorPlanDraft');
const BrzCommunityFloorPlanDraft = require('../../server/models/brz/BrzCommunityFloorPlanDraft');
const {
  bootstrapPublishingData,
  buildPackageBundle,
  buildInventoryBundle,
  syncCommunityDraftFromCompetition,
  updateCommunityWebData,
  __test: {
    resolveInventoryUnpublishMissingHomes,
    normalizeLegacyPercentTax
  }
} = require('../../server/services/brzPublishingService');

const {
  Types: { ObjectId }
} = mongoose;

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  delete process.env.KEEPUP_PUBLIC_BASE_URL;
  delete process.env.BASE_URL;
  await Competition.deleteMany({});
  await CommunityCompetitionProfile.deleteMany({});
  await BrzCommunityDraft.deleteMany({});
  await BrzCommunityFloorPlanDraft.deleteMany({});
  await BrzFloorPlanDraft.deleteMany({});
  await FloorPlan.deleteMany({});
  await Community.deleteMany({});
  await Company.deleteMany({});
});

test('inventory mode default: lotIds provided resolves unpublishMissingHomes=false', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: new Set(['a-lot-id']),
    requestedUnpublishMissingHomes: undefined
  });
  assert.equal(result.resolvedUnpublishMissingHomes, false);
  assert.equal(result.mode, 'PATCH');
});

test('inventory mode default: only communityIds scope resolves unpublishMissingHomes=true', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: null,
    requestedUnpublishMissingHomes: undefined
  });
  assert.equal(result.resolvedUnpublishMissingHomes, true);
  assert.equal(result.mode, 'RECONCILE');
});

test('inventory mode default: no scope resolves unpublishMissingHomes=true', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: null,
    requestedUnpublishMissingHomes: undefined
  });
  assert.equal(result.resolvedUnpublishMissingHomes, true);
  assert.equal(result.mode, 'RECONCILE');
});

test('inventory mode explicit: lotIds + unpublishMissingHomes=false stays false', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: new Set(['a-lot-id']),
    requestedUnpublishMissingHomes: false
  });
  assert.equal(result.resolvedUnpublishMissingHomes, false);
  assert.equal(result.mode, 'PATCH');
  assert.deepEqual(result.warnings, []);
});

test('inventory mode explicit: community scope + unpublishMissingHomes=false stays false', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: null,
    requestedUnpublishMissingHomes: false
  });
  assert.equal(result.resolvedUnpublishMissingHomes, false);
  assert.equal(result.mode, 'PATCH');
  assert.deepEqual(result.warnings, []);
});

test('inventory mode guardrail: lotIds + unpublishMissingHomes=true forces false with warning', () => {
  const result = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: new Set(['lot-1']),
    requestedUnpublishMissingHomes: true
  });
  assert.equal(result.resolvedUnpublishMissingHomes, false);
  assert.equal(result.mode, 'PATCH');
  assert.ok(
    result.warnings.some((warning) =>
      String(warning).includes('Guardrail: unpublishMissingHomes=true requested with lotIds scope; forced false.')
    )
  );
});

test('integration-ish: lot-scoped inventory publish stays PATCH and only includes requested lot', async () => {
  const company = await Company.create({
    name: `Test Company ${Date.now()}`,
    slug: `test-company-${Date.now()}`
  });

  const lots = [
    {
      address: '100 Alpha St',
      generalStatus: 'Available',
      listPrice: 400000,
      buildrootz: { isPublished: true }
    },
    {
      address: '200 Beta St',
      generalStatus: 'Available',
      listPrice: 410000,
      buildrootz: { isPublished: true }
    },
    {
      address: '300 Gamma St',
      generalStatus: 'Available',
      listPrice: 420000,
      buildrootz: { isPublished: true }
    }
  ];

  const community = await Community.create({
    company: company._id,
    name: 'Scoped Community',
    slug: `scoped-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Scoped Community'
    },
    lots
  });

  const targetLotId = String(community.lots[0]._id);

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    lotIds: [targetLotId],
    unpublishMissingHomes: false
  });

  assert.equal(bundle.meta.unpublishMissingHomes, false);
  assert.equal(bundle.meta.publishMode, 'PATCH');
  assert.equal(bundle.publicHomes.length, 1);
  assert.equal(bundle.publicHomes[0].keepupLotId, targetLotId);
});

test('inventory bundle maps canonical split location fields when listing already has split values', async () => {
  const company = await Company.create({
    name: `Location Split Company ${Date.now()}`,
    slug: `location-split-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Location Split Community',
    slug: `location-split-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Location Split Community'
    },
    lots: [
      {
        address: '100 Split St',
        address1: '100 Split St',
        city: 'Frisco',
        state: 'tx',
        postalCode: '75034 1234',
        generalStatus: 'Available',
        listPrice: 500000,
        buildrootz: { isPublished: true }
      }
    ]
  });

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.equal(bundle.publicHomes[0].address1, '100 Split St');
  assert.equal(bundle.publicHomes[0].city, 'Frisco');
  assert.equal(bundle.publicHomes[0].state, 'TX');
  assert.equal(bundle.publicHomes[0].postalCode, '75034-1234');
  assert.equal(bundle.publicHomes[0].formattedAddress, '100 Split St, Frisco, TX 75034-1234');
  assert.equal(bundle.publicHomes[0].address?.line1, '100 Split St');
  assert.equal(bundle.publicHomes[0].address?.city, 'Frisco');
  assert.equal(bundle.publicHomes[0].address?.state, 'TX');
  assert.equal(bundle.publicHomes[0].address?.zip, '75034-1234');
});

test('inventory bundle derives split location fields from formatted address and persists canonical fields', async () => {
  const company = await Company.create({
    name: `Location Parse Company ${Date.now()}`,
    slug: `location-parse-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Location Parse Community',
    slug: `location-parse-community-${Date.now()}`,
    city: 'Celina',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Location Parse Community'
    },
    lots: [
      {
        address: '123 Main St, Celina, tx 75009',
        generalStatus: 'Available',
        listPrice: 510000,
        buildrootz: { isPublished: true }
      }
    ]
  });

  const lotId = String(community.lots[0]._id);

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.equal(bundle.publicHomes[0].keepupLotId, lotId);
  assert.equal(bundle.publicHomes[0].address1, '123 Main St');
  assert.equal(bundle.publicHomes[0].city, 'Celina');
  assert.equal(bundle.publicHomes[0].state, 'TX');
  assert.equal(bundle.publicHomes[0].postalCode, '75009');

  const refreshed = await Community.findById(community._id).lean();
  const updatedLot = refreshed?.lots?.find((entry) => String(entry?._id) === lotId);
  assert.ok(updatedLot);
  assert.equal(updatedLot.address1, '123 Main St');
  assert.equal(updatedLot.city, 'Celina');
  assert.equal(updatedLot.state, 'TX');
  assert.equal(updatedLot.postalCode, '75009');
});

test('inventory bundle derives state from postalCode when state is missing', async () => {
  const company = await Company.create({
    name: `Location Zip Company ${Date.now()}`,
    slug: `location-zip-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Location Zip Community',
    slug: `location-zip-community-${Date.now()}`,
    city: 'Frisco',
    state: '',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Location Zip Community'
    },
    lots: [
      {
        address1: '500 Legacy Dr',
        city: 'Frisco',
        postalCode: '75034',
        generalStatus: 'Available',
        listPrice: 520000,
        buildrootz: { isPublished: true }
      }
    ]
  });

  const lotId = String(community.lots[0]._id);

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.equal(bundle.publicHomes[0].keepupLotId, lotId);
  assert.equal(bundle.publicHomes[0].city, 'Frisco');
  assert.equal(bundle.publicHomes[0].state, 'TX');
  assert.equal(bundle.publicHomes[0].postalCode, '75034');

  const refreshed = await Community.findById(community._id).lean();
  const updatedLot = refreshed?.lots?.find((entry) => String(entry?._id) === lotId);
  assert.ok(updatedLot);
  assert.equal(updatedLot.state, 'TX');
});

test('inventory bundle falls back to MCC canonical location and backfills missing lot split fields', async () => {
  const company = await Company.create({
    name: `Location Canonical Fallback Company ${Date.now()}`,
    slug: `location-canonical-fallback-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Location Canonical Fallback Community',
    slug: `location-canonical-fallback-community-${Date.now()}`,
    city: '',
    state: '',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Location Canonical Fallback Community'
    },
    lots: [
      {
        address1: '2001 Aldrich Mews',
        generalStatus: 'SPEC',
        listPrice: 389900,
        buildrootz: { isPublished: true },
        city: '',
        state: '',
        postalCode: ''
      }
    ]
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    webData: {
      city: 'Celina',
      state: 'TX',
      postalCode: '75009'
    }
  });

  const lotId = String(community.lots[0]._id);

  const firstBundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(firstBundle.publicHomes.length, 1);
  assert.equal(firstBundle.publicHomes[0].keepupLotId, lotId);
  assert.equal(firstBundle.publicHomes[0].city, 'Celina');
  assert.equal(firstBundle.publicHomes[0].state, 'TX');
  assert.equal(firstBundle.publicHomes[0].postalCode, '75009');
  assert.ok(
    firstBundle.meta.warnings.some((warning) =>
      String(warning).includes(`Lot ${lotId}`) && String(warning).includes('used community canonical fallback')
    )
  );
  assert.ok(
    firstBundle.meta.warnings.some((warning) =>
      String(warning).includes('Backfilled location for 1 lot(s) using community canonical location')
    )
  );

  const refreshedAfterFirst = await Community.findById(community._id).lean();
  const lotAfterFirst = refreshedAfterFirst?.lots?.find((entry) => String(entry?._id) === lotId);
  assert.ok(lotAfterFirst);
  assert.equal(lotAfterFirst.city, 'Celina');
  assert.equal(lotAfterFirst.state, 'TX');
  assert.equal(lotAfterFirst.postalCode, '75009');

  const secondBundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(secondBundle.publicHomes.length, 1);
  assert.equal(secondBundle.publicHomes[0].city, 'Celina');
  assert.equal(secondBundle.publicHomes[0].state, 'TX');
  assert.equal(secondBundle.publicHomes[0].postalCode, '75009');
  assert.ok(
    !secondBundle.meta.warnings.some((warning) =>
      String(warning).includes('missing normalized city/state/postalCode')
    )
  );
});

test('inventory bundle keeps warning and does not backfill when lot and MCC canonical location are missing', async () => {
  const company = await Company.create({
    name: `Location Missing Canonical Company ${Date.now()}`,
    slug: `location-missing-canonical-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Location Missing Canonical Community',
    slug: `location-missing-canonical-community-${Date.now()}`,
    city: '',
    state: '',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Location Missing Canonical Community'
    },
    lots: [
      {
        address1: '3001 Missing Way',
        generalStatus: 'Available',
        listPrice: 359900,
        buildrootz: { isPublished: true },
        city: '',
        state: '',
        postalCode: ''
      }
    ]
  });

  const lotId = String(community.lots[0]._id);

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.equal(bundle.publicHomes[0].keepupLotId, lotId);
  assert.equal(bundle.publicHomes[0].city, null);
  assert.equal(bundle.publicHomes[0].state, null);
  assert.equal(bundle.publicHomes[0].postalCode, null);
  assert.ok(
    bundle.meta.warnings.some((warning) =>
      String(warning).includes(`Lot ${lotId}`) && String(warning).includes('missing normalized city/state/postalCode')
    )
  );
  assert.ok(
    !bundle.meta.warnings.some((warning) =>
      String(warning).includes('Backfilled location for')
    )
  );

  const refreshed = await Community.findById(community._id).lean();
  const lotAfter = refreshed?.lots?.find((entry) => String(entry?._id) === lotId);
  assert.ok(lotAfter);
  assert.equal(lotAfter.city || '', '');
  assert.equal(lotAfter.state || '', '');
  assert.equal(lotAfter.postalCode || '', '');
});

test('inventory bundle maps hero and listing photos into PublicHome media fields in order', async () => {
  process.env.KEEPUP_PUBLIC_BASE_URL = 'https://keepup.test';

  const company = await Company.create({
    name: `Media Company ${Date.now()}`,
    slug: `media-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Media Community',
    slug: `media-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Media Community'
    },
    lots: [
      {
        address: '100 Media St',
        generalStatus: 'Available',
        listPrice: 450000,
        heroImage: '/uploads/hero.jpg',
        liveElevationPhoto: '/uploads/live.jpg',
        listingPhotos: [
          '/uploads/hero.jpg',
          'https://cdn.example.com/gallery-1.jpg',
          '/uploads/gallery-2.jpg'
        ],
        buildrootz: { isPublished: true }
      }
    ]
  });

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.deepEqual(bundle.publicHomes[0].heroImages, ['https://keepup.test/uploads/hero.jpg']);
  assert.deepEqual(bundle.publicHomes[0].images, [
    'https://keepup.test/uploads/hero.jpg',
    'https://keepup.test/uploads/live.jpg',
    'https://cdn.example.com/gallery-1.jpg',
    'https://keepup.test/uploads/gallery-2.jpg'
  ]);
  assert.deepEqual(bundle.publicHomes[0].photos, [
    { url: 'https://keepup.test/uploads/hero.jpg' },
    { url: 'https://keepup.test/uploads/live.jpg' },
    { url: 'https://cdn.example.com/gallery-1.jpg' },
    { url: 'https://keepup.test/uploads/gallery-2.jpg' }
  ]);
  assert.equal(bundle.publicHomes[0].primaryPhotoUrl, 'https://keepup.test/uploads/hero.jpg');
});

test('inventory bundle includes live elevation photo when it is the only listing media', async () => {
  process.env.KEEPUP_PUBLIC_BASE_URL = 'https://keepup.test';

  const company = await Company.create({
    name: `Live Media Company ${Date.now()}`,
    slug: `live-media-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Live Media Community',
    slug: `live-media-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Live Media Community'
    },
    lots: [
      {
        address: '200 Media St',
        generalStatus: 'Available',
        listPrice: 460000,
        liveElevationPhoto: '/uploads/live-only.jpg',
        buildrootz: { isPublished: true }
      }
    ]
  });

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.deepEqual(bundle.publicHomes[0].heroImages, []);
  assert.deepEqual(bundle.publicHomes[0].images, ['https://keepup.test/uploads/live-only.jpg']);
  assert.deepEqual(bundle.publicHomes[0].photos, [{ url: 'https://keepup.test/uploads/live-only.jpg' }]);
});

test('inventory bundle includes listing promo and promoMode for PublicHome payloads', async () => {
  const company = await Company.create({
    name: `Promo Inventory Company ${Date.now()}`,
    slug: `promo-inventory-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Promo Inventory Community',
    slug: `promo-inventory-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Promo Inventory Community'
    },
    lots: [
      {
        address: '400 Promo St',
        generalStatus: 'Available',
        listPrice: 480000,
        promoText: '3.99% fixed rate special',
        promoMode: 'override',
        buildrootz: { isPublished: true }
      }
    ]
  });

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.deepEqual(bundle.publicHomes[0].promo, {
    headline: '3.99% fixed rate special'
  });
  assert.equal(bundle.publicHomes[0].promoMode, 'override');
});

test('inventory bundle leaves relative upload URLs when no public base URL is configured and emits warnings', async () => {
  const company = await Company.create({
    name: `Relative Media Company ${Date.now()}`,
    slug: `relative-media-company-${Date.now()}`
  });

  const community = await Community.create({
    company: company._id,
    name: 'Relative Media Community',
    slug: `relative-media-community-${Date.now()}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: 'Relative Media Community'
    },
    lots: [
      {
        address: '300 Media St',
        generalStatus: 'Available',
        listPrice: 470000,
        heroImage: '/uploads/relative-hero.jpg',
        listingPhotos: ['/uploads/relative-gallery.jpg'],
        buildrootz: { isPublished: true }
      }
    ]
  });

  const bundle = await buildInventoryBundle({
    companyId: company._id,
    communityIds: [String(community._id)],
    unpublishMissingHomes: true
  });

  assert.equal(bundle.publicHomes.length, 1);
  assert.deepEqual(bundle.publicHomes[0].heroImages, ['/uploads/relative-hero.jpg']);
  assert.deepEqual(bundle.publicHomes[0].images, [
    '/uploads/relative-hero.jpg',
    '/uploads/relative-gallery.jpg'
  ]);
  assert.ok(
    bundle.meta.warnings.some((warning) =>
      String(warning).includes('Relative upload URL; may not resolve in BRZ: /uploads/relative-hero.jpg')
    )
  );
});

async function createPackageBundleFixture({
  floorPlanAsset = {},
  companyNamePrefix = 'Package Media Company',
  communityName = 'Package Media Community',
  competitionWebData = null
} = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = await Company.create({
    name: `${companyNamePrefix} ${stamp}`,
    slug: `package-media-company-${stamp}`
  });

  const community = await Community.create({
    company: company._id,
    name: communityName,
    slug: `package-media-community-${stamp}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: communityName
    },
    lots: [{}]
  });

  const floorPlan = await FloorPlan.create({
    company: company._id,
    planNumber: `FP-${stamp}`,
    name: `Plan ${stamp}`,
    specs: {
      squareFeet: 1800,
      beds: 3,
      baths: 2,
      garage: 2,
      stories: 1
    },
    communities: [community._id],
    asset: floorPlanAsset
  });

  community.lots[0].floorPlan = floorPlan._id;
  await community.save();

  if (competitionWebData && typeof competitionWebData === 'object') {
    await BrzCommunityDraft.create({
      companyId: company._id,
      communityId: community._id,
      isIncluded: true,
      competitionWebData,
      draftSyncedAt: new Date(),
      draftSyncedFrom: 'competition'
    });
  }

  return { company, community, floorPlan };
}

test('bootstrap publishing data includes planOfferings[].basePriceFrom via plan draft fallback', async () => {
  const { company, community, floorPlan } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Plan Price Company',
    communityName: 'Bootstrap Plan Price Community'
  });

  await BrzFloorPlanDraft.findOneAndUpdate(
    { companyId: company._id, floorPlanId: floorPlan._id },
    {
      $set: {
        basePriceFrom: 409900,
        basePriceAsOf: new Date('2026-02-01T00:00:00.000Z')
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].planOfferings.length, 1);
  assert.equal(bootstrap.communities[0].planOfferings[0].basePriceFrom, 409900);
});

test('buildPackageBundle uses community plan basePriceFrom override before plan draft fallback', async () => {
  const { company, community, floorPlan } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Plan Price Company',
    communityName: 'Package Plan Price Community'
  });

  await BrzFloorPlanDraft.findOneAndUpdate(
    { companyId: company._id, floorPlanId: floorPlan._id },
    { $set: { basePriceFrom: 399900 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await BrzCommunityFloorPlanDraft.findOneAndUpdate(
    { companyId: company._id, communityId: community._id, floorPlanId: floorPlan._id },
    { $set: { basePriceFrom: 419900 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const bundle = await buildPackageBundle({ companyId: company._id });
  assert.equal(bundle.planOfferings.length, 1);
  assert.equal(bundle.planOfferings[0].basePriceFrom, 419900);
});

test('buildPackageBundle keeps planOfferings[].basePriceFrom null when no price exists', async () => {
  const { company } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Plan Price Missing Company',
    communityName: 'Package Plan Price Missing Community'
  });

  const bundle = await buildPackageBundle({ companyId: company._id });
  assert.equal(bundle.planOfferings.length, 1);
  assert.equal(bundle.planOfferings[0].basePriceFrom, null);
});

test('package bundle includes structured floor plan asset URLs when file and preview are present', async () => {
  process.env.KEEPUP_PUBLIC_BASE_URL = 'https://keepup.test';

  const { company } = await createPackageBundleFixture({
    floorPlanAsset: {
      fileUrl: '/uploads/floor-plan.pdf',
      previewUrl: '/uploads/floor-plan.png',
      originalFilename: 'floor-plan.pdf',
      mimeType: 'application/pdf'
    }
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.planCatalog.length, 1);
  assert.deepEqual(bundle.planCatalog[0].asset, {
    fileUrl: 'https://keepup.test/uploads/floor-plan.pdf',
    previewUrl: 'https://keepup.test/uploads/floor-plan.png',
    originalFilename: 'floor-plan.pdf',
    mimeType: 'application/pdf'
  });
  assert.deepEqual(bundle.meta.warnings, []);
});

test('package bundle leaves relative floor plan upload URLs when no public base URL is configured and emits warnings', async () => {
  const { company } = await createPackageBundleFixture({
    floorPlanAsset: {
      fileUrl: '/uploads/relative-plan.pdf',
      previewUrl: '/uploads/relative-plan.png',
      originalFilename: 'relative-plan.pdf',
      mimeType: 'application/pdf'
    },
    companyNamePrefix: 'Relative Package Media Company',
    communityName: 'Relative Package Media Community'
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.planCatalog.length, 1);
  assert.deepEqual(bundle.planCatalog[0].asset, {
    fileUrl: '/uploads/relative-plan.pdf',
    previewUrl: '/uploads/relative-plan.png',
    originalFilename: 'relative-plan.pdf',
    mimeType: 'application/pdf'
  });
  assert.ok(
    bundle.meta.warnings.some((warning) =>
      String(warning).includes('Plan') && String(warning).includes('/uploads/relative-plan.pdf')
    )
  );
  assert.ok(
    bundle.meta.warnings.some((warning) =>
      String(warning).includes('Plan') && String(warning).includes('/uploads/relative-plan.png')
    )
  );
});

test('package bundle falls back to uploaded preview helper when floor plan previewUrl is missing', async () => {
  process.env.KEEPUP_PUBLIC_BASE_URL = 'https://keepup.test';

  const { company } = await createPackageBundleFixture({
    floorPlanAsset: {
      fileUrl: '/uploads/fallback-plan.jpg',
      previewUrl: '',
      originalFilename: 'fallback-plan.jpg',
      mimeType: 'image/jpeg'
    },
    companyNamePrefix: 'Fallback Package Media Company',
    communityName: 'Fallback Package Media Community'
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.planCatalog.length, 1);
  assert.deepEqual(bundle.planCatalog[0].asset, {
    fileUrl: 'https://keepup.test/uploads/fallback-plan.jpg',
    previewUrl: 'https://keepup.test/uploads/fallback-plan.jpg',
    originalFilename: 'fallback-plan.jpg',
    mimeType: 'image/jpeg'
  });
});

test('package bundle includes canonical tax and explicit PID/MUD fee fields in community webData when present', async () => {
  const { company } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Fee Company',
    communityName: 'Package Fee Community',
    competitionWebData: {
      taxRate: 0.0283,
      hasMUD: true,
      mudTaxRate: 0.0078,
      mudFeeAmount: 1400,
      hasPID: true,
      pidFeeAmount: 6200,
      pidFeeFrequency: 'Yearly'
    }
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.equal(bundle.builderInCommunities[0].webData.taxRate, 0.0283);
  assert.equal(bundle.builderInCommunities[0].webData.hasMUD, true);
  assert.equal(bundle.builderInCommunities[0].webData.mudTaxRate, 0.0078);
  assert.equal(bundle.builderInCommunities[0].webData.mudFeeAmount, 1400);
  assert.equal(bundle.builderInCommunities[0].webData.hasPID, true);
  assert.equal(bundle.builderInCommunities[0].webData.pidFeeAmount, 6200);
  assert.equal(bundle.builderInCommunities[0].webData.pidFeeFrequency, 'Yearly');
});

test('package bundle includes community promo in builderInCommunities webData', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Promo Company',
    communityName: 'Package Promo Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    promotion: 'Save up to $15k'
  });

  await syncCommunityDraftFromCompetition({
    companyId: company._id,
    communityId: community._id
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.deepEqual(bundle.builderInCommunities[0].webData.promo, {
    headline: 'Save up to $15k'
  });
});

test('bootstrap publishing data includes productTypes via legacy lotSize fallback', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Product Types Company',
    communityName: 'Bootstrap Product Types'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    lotSize: "22' Townhomes",
    webData: {
      productTypes: []
    }
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.equal(bootstrap.communities.length, 1);
  assert.deepEqual(bootstrap.communities[0].webData.productTypes, [
    { label: "22' Townhomes" }
  ]);
});

test('package bundle includes productTypes in builderInCommunities webData', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Product Types Company',
    communityName: 'Package Product Types'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    lotSize: "55'",
    webData: {
      productTypes: []
    }
  });

  await syncCommunityDraftFromCompetition({
    companyId: company._id,
    communityId: community._id
  });

  const bundle = await buildPackageBundle({ companyId: company._id });
  assert.equal(bundle.builderInCommunities.length, 1);
  assert.deepEqual(bundle.builderInCommunities[0].webData.productTypes, [
    { label: "55'" }
  ]);
});

test('syncCommunityDraftFromCompetition normalizes canonical amenities into the BRZ snapshot', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Amenities Snapshot Company',
    communityName: 'Amenities Snapshot Community'
  });

  await CommunityCompetitionProfile.collection.insertOne({
    company: company._id,
    community: community._id,
    webData: {
      amenities: [' Pool ', '', 'Trails', { label: 'pool' }]
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await syncCommunityDraftFromCompetition({
    companyId: company._id,
    communityId: community._id
  });

  const draft = await BrzCommunityDraft.findOne({
    companyId: company._id,
    communityId: community._id
  }).lean();

  assert.deepEqual(draft?.competitionWebData?.amenities, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('package bundle preserves normalized amenities in builderInCommunities webData', async () => {
  const { company } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Amenities Company',
    communityName: 'Package Amenities Community',
    competitionWebData: {
      amenities: [' Pool ', '', 'Trails', 'pool']
    }
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.deepEqual(bundle.builderInCommunities[0].webData.amenities, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('bootstrap publishing data includes amenities via legacy communityAmenities fallback', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Legacy Amenities Company',
    communityName: 'Bootstrap Legacy Amenities'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    communityAmenities: [
      {
        category: 'Pools',
        items: ['Pool', 'Trails']
      }
    ],
    webData: {
      amenities: []
    }
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.equal(bootstrap.communities.length, 1);
  assert.deepEqual(bootstrap.communities[0].webData.amenities, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('package bundle includes amenities via legacy communityAmenities fallback', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Package Legacy Amenities Company',
    communityName: 'Package Legacy Amenities'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    communityAmenities: [
      {
        category: 'Parks',
        items: ['Pool', 'Trails']
      }
    ],
    webData: {
      amenities: []
    }
  });

  await syncCommunityDraftFromCompetition({
    companyId: company._id,
    communityId: community._id
  });

  const bundle = await buildPackageBundle({ companyId: company._id });
  assert.equal(bundle.builderInCommunities.length, 1);
  assert.deepEqual(bundle.builderInCommunities[0].webData.amenities, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('updateCommunityWebData accepts percent tax input, stores decimal taxRate, and package publish uses it', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Tax Rate Company',
    communityName: 'Tax Rate Community'
  });

  const updateResult = await updateCommunityWebData({
    companyId: company._id,
    communityId: community._id,
    updates: {
      taxRate: '2.15%'
    }
  });

  assert.equal(updateResult.competitionProfileWebData.taxRate, 0.0215);
  assert.equal(updateResult.outOfDate, false);

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.equal(bundle.builderInCommunities[0].webData.taxRate, 0.0215);
});

test('package bundle includes webData.taxRate for a Ten Mile Creek-like community after editor save', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Ten Mile Tax Company',
    communityName: 'Ten Mile Creek'
  });

  await updateCommunityWebData({
    companyId: company._id,
    communityId: community._id,
    updates: {
      taxRate: '2.06'
    }
  });

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.equal(bundle.builderInCommunities[0].keepupCommunityId, String(community._id));
  assert.equal(bundle.builderInCommunities[0].webData.taxRate, 0.0206);
});

test('bootstrap publishing data exposes resolved community webData taxRate for BRZ Publishing UI', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Tax Company',
    communityName: 'Bootstrap Tax Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    tax: 2.15
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.ok(Array.isArray(bootstrap.communities));
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].companyId, String(company._id));
  assert.equal(bootstrap.communities[0].keepupCommunityId, String(community._id));
  assert.equal(
    bootstrap.communities[0].publicCommunityId,
    String(community.buildrootz?.publicCommunityId || '')
  );
  assert.equal(bootstrap.communities[0].webData.taxRate, 0.0215);
  assert.equal(bootstrap.communities[0].competitionProfileTax, 2.15);
  assert.ok(Array.isArray(bootstrap.communities[0].modelsSummary));
});

test('bootstrap publishing data exposes resolved community webData.state for BRZ Publishing UI', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap State Company',
    communityName: 'Bootstrap State Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    state: 'tx'
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.ok(Array.isArray(bootstrap.communities));
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].webData.state, 'TX');
});

test('bootstrap publishing data exposes resolved PID/MUD fee fields via legacy fallback', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Fee Fallback Company',
    communityName: 'Bootstrap Fee Fallback Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    feeTypes: ['PID', 'MUD'],
    mudFee: 1400,
    pidFee: 6200,
    pidFeeFrequency: 'Yearly',
    webData: {}
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.ok(Array.isArray(bootstrap.communities));
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].webData.hasMUD, true);
  assert.equal(bootstrap.communities[0].webData.mudFeeAmount, 1400);
  assert.equal(bootstrap.communities[0].webData.hasPID, true);
  assert.equal(bootstrap.communities[0].webData.pidFeeAmount, 6200);
  assert.equal(bootstrap.communities[0].webData.pidFeeFrequency, 'Yearly');
});

test('bootstrap publishing data exposes canonical webData.mudTaxRate for BRZ preview', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Mud Tax Rate Company',
    communityName: 'Bootstrap Mud Tax Rate Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    webData: {
      mudTaxRate: 0.0078
    }
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.ok(Array.isArray(bootstrap.communities));
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].webData.mudTaxRate, 0.0078);
});

test('updateCommunityWebData persists canonical and legacy state fields', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'WebData State Save Company',
    communityName: 'WebData State Save Community'
  });

  const updateResult = await updateCommunityWebData({
    companyId: company._id,
    communityId: community._id,
    updates: {
      state: 'tx'
    }
  });

  assert.equal(updateResult.webData.state, 'TX');

  const profile = await CommunityCompetitionProfile.findOne({
    company: company._id,
    community: community._id
  }).lean();
  assert.equal(profile?.state, 'TX');
  assert.equal(profile?.webData?.state, 'TX');
});

test('normalizeLegacyPercentTax normalizes percent and decimal legacy values', () => {
  assert.equal(normalizeLegacyPercentTax(2.06), 2.06);
  assert.equal(normalizeLegacyPercentTax('2.06'), 2.06);
  assert.equal(normalizeLegacyPercentTax('2.06%'), 2.06);
  assert.equal(normalizeLegacyPercentTax(0.0206), 2.06);
  assert.equal(normalizeLegacyPercentTax(''), null);
  assert.equal(normalizeLegacyPercentTax(-1), null);
  assert.equal(normalizeLegacyPercentTax('abc'), null);
});

test('bootstrap publishing data exposes legacy competition tax fallback when profile tax is missing', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Legacy Tax Company',
    communityName: 'Bootstrap Legacy Tax Community'
  });

  await Competition.create({
    company: company._id,
    communityName: community.name,
    builderName: company.name,
    address: '123 Legacy Ln',
    city: community.city || 'Dallas',
    state: community.state || 'TX',
    zip: '75001',
    communityRef: community._id,
    isInternal: true,
    tax: 2.06
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.ok(Array.isArray(bootstrap.communities));
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].companyId, String(company._id));
  assert.equal(bootstrap.communities[0].publicCommunityId, String(community.buildrootz?.publicCommunityId || ''));
  assert.equal(bootstrap.communities[0].competitionProfileTax, null);
  assert.equal(bootstrap.communities[0].competitionLegacyTax, 2.06);
  assert.equal(bootstrap.communities[0].webData.taxRate, undefined);
});

test('bootstrap publishing data exposes legacy competition tax fallback when linked via community', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Legacy Community Link Company',
    communityName: 'Bootstrap Legacy Community Link'
  });

  await Competition.collection.insertOne({
    company: company._id,
    community: community._id,
    communityName: community.name,
    builderName: company.name,
    address: '456 Legacy Way',
    city: community.city || 'Dallas',
    state: community.state || 'TX',
    zip: '75002',
    tax: 2.11,
    isInternal: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z')
  });

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].competitionLegacyTax, 2.11);
});

test('bootstrap publishing data prefers legacy competition rows with tax and then newest updatedAt', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Bootstrap Legacy Selection Company',
    communityName: 'Bootstrap Legacy Selection'
  });

  await Competition.collection.insertMany([
    {
      company: company._id,
      communityRef: community._id,
      communityName: community.name,
      builderName: company.name,
      address: '100 Newest No Tax Ln',
      city: community.city || 'Dallas',
      state: community.state || 'TX',
      zip: '75003',
      tax: null,
      isInternal: true,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z')
    },
    {
      company: company._id,
      community: community._id,
      communityName: community.name,
      builderName: company.name,
      address: '101 Older Tax Ln',
      city: community.city || 'Dallas',
      state: community.state || 'TX',
      zip: '75004',
      tax: 2.05,
      isInternal: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    },
    {
      company: company._id,
      communityRef: community._id,
      communityName: community.name,
      builderName: company.name,
      address: '102 Newest Tax Ln',
      city: community.city || 'Dallas',
      state: community.state || 'TX',
      zip: '75005',
      tax: 2.08,
      isInternal: false,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z')
    }
  ]);

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  assert.equal(bootstrap.communities.length, 1);
  assert.equal(bootstrap.communities[0].competitionLegacyTax, 2.08);
});

test('package bundle falls back to competition-profile taxRate when an older draft snapshot omitted it', async () => {
  const { company, community } = await createPackageBundleFixture({
    companyNamePrefix: 'Tax Fallback Company',
    communityName: 'Tax Fallback Community'
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    tax: 2.15
  });

  await BrzCommunityDraft.findOneAndUpdate(
    { companyId: company._id, communityId: community._id },
    {
      $set: {
        isIncluded: true,
        competitionWebData: {
          primaryContact: {
            name: 'Sales Team'
          }
        },
        draftSyncedAt: new Date(),
        draftSyncedFrom: 'competition'
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const bundle = await buildPackageBundle({ companyId: company._id });

  assert.equal(bundle.builderInCommunities.length, 1);
  assert.equal(bundle.builderInCommunities[0].webData.taxRate, 0.0215);
});
