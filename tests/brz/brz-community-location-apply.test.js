const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const brzPublishingApiRouter = require('../../server/routes/api/brz-publishing.api');
const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const CommunityCompetitionProfile = require('../../server/models/communityCompetitionProfile');
const { bootstrapPublishingData } = require('../../server/services/brzPublishingService');

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
  await CommunityCompetitionProfile.deleteMany({});
  await Community.deleteMany({});
  await Company.deleteMany({});
});

async function applyCommunityLocation({ companyId, communityId }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      company: companyId,
      roles: ['COMPANY_ADMIN']
    };
    next();
  });
  app.use('/api/brz/publishing', brzPublishingApiRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/brz/publishing/community/${communityId}/apply-location-to-listings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }
    );
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('bulk apply endpoint fills only missing listing city/state/postalCode from community canonical webData', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `Location Apply Co ${now}`,
    slug: `location-apply-co-${now}`
  });
  const community = await Community.create({
    company: company._id,
    name: 'Location Apply Community',
    city: 'Dallas',
    state: 'TX',
    lots: [
      {
        address: '100 Oak St',
        city: '',
        state: '',
        postalCode: ''
      },
      {
        address: '101 Oak St',
        city: 'Plano',
        state: '',
        postalCode: ''
      },
      {
        address: '102 Oak St',
        city: 'McKinney',
        state: 'TX',
        postalCode: '75069'
      }
    ]
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    city: 'Legacy City',
    state: 'TX',
    zip: '79999',
    webData: {
      city: 'Celina',
      state: 'tx',
      postalCode: '75009'
    }
  });

  const result = await applyCommunityLocation({
    companyId: String(company._id),
    communityId: String(community._id)
  });

  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
  assert.equal(result.body?.attemptedCount, 2);
  assert.equal(result.body?.updatedCount, 2);
  assert.equal(result.body?.skippedCount, 1);
  assert.deepEqual(result.body?.sourceLocation, {
    city: 'Celina',
    state: 'TX',
    postalCode: '75009'
  });

  const refreshed = await Community.findById(community._id).lean();
  assert.equal(refreshed.lots[0].city, 'Celina');
  assert.equal(refreshed.lots[0].state, 'TX');
  assert.equal(refreshed.lots[0].postalCode, '75009');

  assert.equal(refreshed.lots[1].city, 'Plano');
  assert.equal(refreshed.lots[1].state, 'TX');
  assert.equal(refreshed.lots[1].postalCode, '75009');

  assert.equal(refreshed.lots[2].city, 'McKinney');
  assert.equal(refreshed.lots[2].state, 'TX');
  assert.equal(refreshed.lots[2].postalCode, '75069');
});

test('bulk apply updates expected listing id when location fields are null and keeps existing values', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `Location Apply Target Co ${now}`,
    slug: `location-apply-target-co-${now}`
  });
  const targetListingId = new mongoose.Types.ObjectId('69a4eb5dce74156a76d736d6');
  const community = await Community.create({
    company: company._id,
    name: 'Location Apply Target Community',
    city: 'Dallas',
    state: 'TX',
    lots: [
      {
        _id: targetListingId,
        address: '2001 Aldrich Mews',
        formattedAddress: '2001 Aldrich Mews',
        city: null,
        state: null,
        postalCode: null
      },
      {
        address: '2003 Aldrich Mews',
        city: 'Allen',
        state: 'TX',
        postalCode: '75013'
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

  const result = await applyCommunityLocation({
    companyId: String(company._id),
    communityId: String(community._id)
  });

  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
  assert.equal(result.body?.updatedCount, 1);
  assert.ok(Array.isArray(result.body?.updatedLotIds));
  assert.ok(result.body.updatedLotIds.includes(String(targetListingId)));

  const refreshed = await Community.findById(community._id).lean();
  const updatedTargetLot = refreshed.lots.find((lot) => String(lot._id) === String(targetListingId));
  assert.ok(updatedTargetLot);
  assert.equal(updatedTargetLot.city, 'Celina');
  assert.equal(updatedTargetLot.state, 'TX');
  assert.equal(updatedTargetLot.postalCode, '75009');

  const untouchedLot = refreshed.lots.find((lot) => String(lot._id) !== String(targetListingId));
  assert.ok(untouchedLot);
  assert.equal(untouchedLot.city, 'Allen');
  assert.equal(untouchedLot.state, 'TX');
  assert.equal(untouchedLot.postalCode, '75013');

  const bootstrap = await bootstrapPublishingData({ companyId: company._id });
  const communityEntry = (bootstrap.communities || []).find(
    (entry) => String(entry?.keepupCommunityId) === String(community._id)
  );
  assert.ok(communityEntry);
  const inventoryLot = (communityEntry.inventoryLots || []).find(
    (lot) => String(lot?.id) === String(targetListingId)
  );
  assert.ok(inventoryLot);
  assert.equal(inventoryLot.city, 'Celina');
  assert.equal(inventoryLot.state, 'TX');
  assert.equal(inventoryLot.postalCode, '75009');
  assert.equal(inventoryLot.missingLocation, false);
});
