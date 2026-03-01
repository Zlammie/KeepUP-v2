const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const {
  buildInventoryBundle,
  __test: {
    resolveInventoryUnpublishMissingHomes
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
