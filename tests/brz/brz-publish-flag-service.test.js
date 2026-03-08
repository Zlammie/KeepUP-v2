const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const {
  MAX_BULK_FLAG_ITEMS,
  bulkUpdateLotPublishFlags
} = require('../../server/services/brzPublishFlagService');

let mongod;

const alwaysAllow = () => true;

async function createCompany(nameSuffix) {
  return Company.create({
    name: `BRZ Flags ${nameSuffix}`,
    slug: `brz-flags-${nameSuffix}`
  });
}

async function createCommunityWithLots({ companyId, nameSuffix, published = false }) {
  return Community.create({
    company: companyId,
    name: `Queue ${nameSuffix}`,
    city: 'Dallas',
    state: 'TX',
    lots: [
      {
        address: `100 ${nameSuffix} Main St`,
        isPublished: published,
        isListed: published,
        buildrootz: { isPublished: published },
        publishedAt: published ? new Date('2026-02-01T00:00:00.000Z') : null,
        contentSyncedAt: new Date('2026-02-02T00:00:00.000Z')
      },
      {
        address: `101 ${nameSuffix} Main St`,
        isPublished: published,
        isListed: published,
        buildrootz: { isPublished: published },
        publishedAt: published ? new Date('2026-02-01T00:00:00.000Z') : null,
        contentSyncedAt: new Date('2026-02-02T00:00:00.000Z')
      }
    ]
  });
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await Community.deleteMany({});
  await Company.deleteMany({});
});

test('bulk publish sets BuildRootz and listing flags for multiple lots', async () => {
  const company = await createCompany(`publish-${Date.now()}`);
  const community = await createCommunityWithLots({
    companyId: company._id,
    nameSuffix: `publish-${Date.now()}`,
    published: false
  });

  const items = community.lots.map((lot) => ({
    communityId: String(community._id),
    lotId: String(lot._id)
  }));

  const result = await bulkUpdateLotPublishFlags({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'publish',
    items,
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() }
  });

  assert.equal(result.updatedCount, 2);
  assert.deepEqual(result.skipped, []);

  const refreshed = await Community.findById(community._id).lean();
  refreshed.lots.forEach((lot) => {
    assert.equal(lot.buildrootz?.isPublished, true);
    assert.equal(lot.isPublished, true);
    assert.equal(lot.isListed, true);
    assert.ok(lot.publishedAt instanceof Date);
    assert.ok(lot.contentSyncedAt instanceof Date);
  });
});

test('bulk unpublish clears publish flags for multiple lots', async () => {
  const company = await createCompany(`unpublish-${Date.now()}`);
  const community = await createCommunityWithLots({
    companyId: company._id,
    nameSuffix: `unpublish-${Date.now()}`,
    published: true
  });

  const items = community.lots.map((lot) => ({
    communityId: String(community._id),
    lotId: String(lot._id)
  }));

  const result = await bulkUpdateLotPublishFlags({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'unpublish',
    items,
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() }
  });

  assert.equal(result.updatedCount, 2);
  assert.deepEqual(result.skipped, []);

  const refreshed = await Community.findById(community._id).lean();
  refreshed.lots.forEach((lot) => {
    assert.equal(lot.buildrootz?.isPublished, false);
    assert.equal(lot.isPublished, false);
    assert.equal(lot.isListed, false);
    assert.equal(lot.publishedAt, null);
    assert.ok(lot.contentSyncedAt instanceof Date);
  });
});

test('bulk updates respect company scoping and do not touch another company community', async () => {
  const allowedCompany = await createCompany(`allowed-${Date.now()}`);
  const otherCompany = await createCompany(`other-${Date.now()}`);
  const otherCommunity = await createCommunityWithLots({
    companyId: otherCompany._id,
    nameSuffix: `other-${Date.now()}`,
    published: false
  });

  const targetLotId = String(otherCommunity.lots[0]._id);
  const result = await bulkUpdateLotPublishFlags({
    CommunityModel: Community,
    companyId: String(allowedCompany._id),
    action: 'publish',
    items: [{
      communityId: String(otherCommunity._id),
      lotId: targetLotId
    }],
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() }
  });

  assert.equal(result.updatedCount, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'Lot not found');

  const refreshed = await Community.findById(otherCommunity._id).lean();
  assert.equal(refreshed.lots[0].buildrootz?.isPublished, false);
  assert.equal(refreshed.lots[0].isPublished, false);
  assert.equal(refreshed.lots[0].isListed, false);
});

test('bulk updates cap the number of items per request', async () => {
  const company = await createCompany(`cap-${Date.now()}`);
  const items = Array.from({ length: MAX_BULK_FLAG_ITEMS + 1 }, () => ({
    communityId: new mongoose.Types.ObjectId().toHexString(),
    lotId: new mongoose.Types.ObjectId().toHexString()
  }));

  await assert.rejects(
    bulkUpdateLotPublishFlags({
      CommunityModel: Community,
      companyId: String(company._id),
      action: 'publish',
      items,
      hasCommunityAccess: alwaysAllow,
      user: { _id: new mongoose.Types.ObjectId() }
    }),
    (err) => err?.status === 400 && /Maximum/.test(err.message)
  );
});

test('bulk updates skip invalid lot ids and still process valid rows', async () => {
  const company = await createCompany(`skip-${Date.now()}`);
  const community = await createCommunityWithLots({
    companyId: company._id,
    nameSuffix: `skip-${Date.now()}`,
    published: false
  });

  const validLotId = String(community.lots[0]._id);
  const invalidLotId = 'not-a-real-lot-id';

  const result = await bulkUpdateLotPublishFlags({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'publish',
    items: [
      {
        communityId: String(community._id),
        lotId: validLotId
      },
      {
        communityId: String(community._id),
        lotId: invalidLotId
      }
    ],
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() }
  });

  assert.equal(result.updatedCount, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'Invalid lotId');

  const refreshed = await Community.findById(community._id).lean();
  assert.equal(refreshed.lots[0].buildrootz?.isPublished, true);
  assert.equal(refreshed.lots[1].buildrootz?.isPublished, false);
});
