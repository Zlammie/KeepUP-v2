const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const { processBrzReadinessBulkAction } = require('../../server/services/brzPublishFlagService');

let mongod;

const alwaysAllow = () => true;

async function createCompany(nameSuffix) {
  return Company.create({
    name: `BRZ Bulk Action ${nameSuffix}`,
    slug: `brz-bulk-action-${nameSuffix}`
  });
}

async function createCommunities(companyId, suffix) {
  const communityOne = await Community.create({
    company: companyId,
    name: `Community A ${suffix}`,
    city: 'Dallas',
    state: 'TX',
    lots: [
      {
        address: `100 ${suffix} Alpha St`,
        isPublished: false,
        isListed: false,
        buildrootz: { isPublished: false }
      },
      {
        address: `101 ${suffix} Alpha St`,
        isPublished: false,
        isListed: false,
        buildrootz: { isPublished: false }
      }
    ]
  });

  const communityTwo = await Community.create({
    company: companyId,
    name: `Community B ${suffix}`,
    city: 'Austin',
    state: 'TX',
    lots: [
      {
        address: `200 ${suffix} Beta St`,
        isPublished: false,
        isListed: false,
        buildrootz: { isPublished: false }
      }
    ]
  });

  return { communityOne, communityTwo };
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

test('alsoPublishInventory=false only updates flags and does not call inventory publish', async () => {
  const company = await createCompany(`flagsonly-${Date.now()}`);
  const { communityOne } = await createCommunities(company._id, `flagsonly-${Date.now()}`);

  let publishCallCount = 0;
  const result = await processBrzReadinessBulkAction({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'publish',
    items: communityOne.lots.map((lot) => ({
      communityId: String(communityOne._id),
      lotId: String(lot._id)
    })),
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() },
    alsoPublishInventory: false,
    publishCompanyInventoryImpl: async () => {
      publishCallCount += 1;
      return { status: 'success' };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.updatedCount, 2);
  assert.equal(result.inventoryPublish, null);
  assert.equal(publishCallCount, 0);
});

test('alsoPublishInventory=true calls community-scoped reconcile with unique community ids and ctx', async () => {
  const company = await createCompany(`sync-${Date.now()}`);
  const { communityOne, communityTwo } = await createCommunities(company._id, `sync-${Date.now()}`);

  const calls = [];
  const result = await processBrzReadinessBulkAction({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'publish',
    items: [
      {
        communityId: String(communityOne._id),
        lotId: String(communityOne.lots[0]._id)
      },
      {
        communityId: String(communityOne._id),
        lotId: String(communityOne.lots[1]._id)
      },
      {
        communityId: String(communityTwo._id),
        lotId: String(communityTwo.lots[0]._id)
      }
    ],
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() },
    alsoPublishInventory: true,
    ctx: {
      userId: 'user-1',
      source: 'user',
      route: '/admin/brz/readiness/bulk'
    },
    publishCompanyInventoryImpl: async (payload) => {
      calls.push(payload);
      return {
        status: 'success',
        message: 'Inventory reconciled',
        counts: {
          publishedCount: 3,
          deactivatedCount: 0,
          skippedCount: 0
        },
        warnings: ['One warning']
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    companyId: String(company._id),
    communityIds: [String(communityOne._id), String(communityTwo._id)],
    unpublishMissingHomes: true,
    ctx: {
      userId: 'user-1',
      source: 'user',
      route: '/admin/brz/readiness/bulk'
    }
  });
  assert.equal(result.inventoryPublish?.status, 'success');
  assert.equal(result.inventoryPublish?.counts?.publishedCount, 3);
});

test('inventory publish failure returns ok=false but keeps updated flags', async () => {
  const company = await createCompany(`fail-${Date.now()}`);
  const { communityOne } = await createCommunities(company._id, `fail-${Date.now()}`);

  const item = {
    communityId: String(communityOne._id),
    lotId: String(communityOne.lots[0]._id)
  };

  const result = await processBrzReadinessBulkAction({
    CommunityModel: Community,
    companyId: String(company._id),
    action: 'publish',
    items: [item],
    hasCommunityAccess: alwaysAllow,
    user: { _id: new mongoose.Types.ObjectId() },
    alsoPublishInventory: true,
    publishCompanyInventoryImpl: async () => {
      throw new Error('Inventory publish blew up');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.flagsUpdated, true);
  assert.equal(result.updatedCount, 1);
  assert.match(result.message, /Inventory publish blew up/);

  const refreshed = await Community.findById(communityOne._id).lean();
  assert.equal(refreshed.lots[0].buildrootz?.isPublished, true);
  assert.equal(refreshed.lots[0].isPublished, true);
  assert.equal(refreshed.lots[0].isListed, true);
});
