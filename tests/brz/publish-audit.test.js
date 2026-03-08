const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const BrzPublishAudit = require('../../server/models/BrzPublishAudit');
const {
  publishCompanyInventory,
  __test
} = require('../../server/services/brzPublishingService');

const {
  Types: { ObjectId }
} = mongoose;

let mongod;

const buildMappedCommunity = async ({ companyId, suffix }) => (
  Community.create({
    company: companyId,
    name: `Audit Community ${suffix}`,
    slug: `audit-community-${suffix}`,
    city: 'Dallas',
    state: 'TX',
    buildrootz: {
      communityId: new ObjectId().toString(),
      publicCommunityId: new ObjectId().toString(),
      canonicalName: `Audit Community ${suffix}`
    },
    lots: [
      {
        address: `100 ${suffix} Main St`,
        generalStatus: 'Available',
        listPrice: 455000,
        beds: 4,
        baths: 3,
        sqft: 2450,
        latitude: 32.7767,
        longitude: -96.797,
        heroImage: '/uploads/hero.jpg',
        buildrootz: { isPublished: true }
      }
    ]
  })
);

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  __test.resetTestDoubles();
  await BrzPublishAudit.deleteMany({});
  await Community.deleteMany({});
  await Company.deleteMany({});
});

test('publishCompanyInventory creates an audit record', async () => {
  const company = await Company.create({
    name: `Audit Company ${Date.now()}`,
    slug: `audit-company-${Date.now()}`
  });
  const community = await buildMappedCommunity({
    companyId: company._id,
    suffix: Date.now()
  });
  const lotId = String(community.lots[0]._id);

  __test.setPublishBundleToBuildRootzImpl(async () => ({
    ok: true,
    message: 'Inventory synced',
    counts: {
      publishedCount: 1,
      deactivatedCount: 0
    },
    warnings: ['One inventory warning']
  }));

  const result = await publishCompanyInventory({
    companyId: company._id,
    communityIds: [String(community._id)],
    lotIds: [lotId],
    unpublishMissingHomes: false,
    ctx: {
      userId: new ObjectId(),
      source: 'user',
      route: '/listing-details/publish'
    }
  });

  assert.equal(result.status, 'success');

  const rows = await BrzPublishAudit.find({ companyId: company._id }).sort({ createdAt: -1 }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'inventory');
  assert.equal(rows[0].mode, 'PATCH');
  assert.equal(rows[0].scope.communityIdsCount, 1);
  assert.equal(rows[0].scope.lotIdsCount, 1);
  assert.equal(rows[0].result.publishedCount, 1);
  assert.equal(rows[0].result.deactivatedCount, 0);
  assert.ok(rows[0].warningsCount >= 1);
  assert.ok(rows[0].warningsSample.includes('One inventory warning'));
  assert.equal(rows[0].message, 'Inventory synced');
  assert.equal(rows[0].initiator.source, 'user');
  assert.equal(rows[0].initiator.route, '/listing-details/publish');
});

test('audit write failures do not fail publishing', async () => {
  const company = await Company.create({
    name: `Audit Fail Company ${Date.now()}`,
    slug: `audit-fail-company-${Date.now()}`
  });
  const community = await buildMappedCommunity({
    companyId: company._id,
    suffix: `${Date.now()}-fail`
  });

  __test.setPublishBundleToBuildRootzImpl(async () => ({
    ok: true,
    message: 'Inventory synced with audit failure',
    counts: {
      publishedCount: 1
    },
    warnings: []
  }));
  __test.setBrzPublishAuditModel({
    async create() {
      throw new Error('audit write failed');
    }
  });

  const result = await publishCompanyInventory({
    companyId: company._id,
    communityIds: [String(community._id)],
    lotIds: [String(community.lots[0]._id)],
    unpublishMissingHomes: false
  });

  assert.equal(result.status, 'success');
  const count = await BrzPublishAudit.countDocuments({ companyId: company._id });
  assert.equal(count, 0);
});

test('inventory audit log is capped at 100 newest records per company', async () => {
  const company = await Company.create({
    name: `Audit Cap Company ${Date.now()}`,
    slug: `audit-cap-company-${Date.now()}`
  });
  const community = await buildMappedCommunity({
    companyId: company._id,
    suffix: `${Date.now()}-cap`
  });

  const historicalRows = Array.from({ length: 100 }, (_, index) => ({
    companyId: company._id,
    createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, index)),
    kind: 'inventory',
    mode: 'PATCH',
    scope: {
      communityIdsCount: 1,
      lotIdsCount: 1,
      communityIdsSample: [String(community._id)],
      lotIdsSample: [String(community.lots[0]._id)]
    },
    meta: {
      unpublishMissingHomes: false
    },
    result: {
      publishedCount: 1,
      deactivatedCount: 0,
      skippedCount: 0
    },
    warningsCount: 0,
    warningsSample: [],
    message: `old-${index}`,
    initiator: {
      source: 'system',
      route: '/seed'
    }
  }));
  await BrzPublishAudit.insertMany(historicalRows);

  __test.setPublishBundleToBuildRootzImpl(async () => ({
    ok: true,
    message: 'Newest audit',
    counts: {
      publishedCount: 1,
      deactivatedCount: 0,
      skippedCount: 0
    },
    warnings: []
  }));

  await publishCompanyInventory({
    companyId: company._id,
    communityIds: [String(community._id)],
    lotIds: [String(community.lots[0]._id)],
    unpublishMissingHomes: false
  });

  const rows = await BrzPublishAudit.find({ companyId: company._id })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  assert.equal(rows.length, 100);
  assert.equal(rows[0].message, 'Newest audit');
  assert.equal(rows.some((row) => row.message === 'old-0'), false);
  assert.equal(rows.some((row) => row.message === 'old-99'), true);
});
