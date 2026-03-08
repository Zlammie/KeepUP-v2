const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const myCommunityCompetitionRouter = require('../../server/routes/myCommunityCompetitionRoutes');
const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const User = require('../../server/models/User');
const CommunityCompetitionProfile = require('../../server/models/communityCompetitionProfile');
const BrzCommunityDraft = require('../../server/models/brz/BrzCommunityDraft');

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
  await BrzCommunityDraft.deleteMany({});
  await CommunityCompetitionProfile.deleteMany({});
  await Community.deleteMany({});
  await User.deleteMany({});
  await Company.deleteMany({});
});

async function makeRequest({ userId, communityId, payload }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId };
    next();
  });
  app.use('/api', myCommunityCompetitionRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/my-community-competition/${communityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('MCC save route writes canonical and legacy location fields and preserves state on blank input', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `MCC Route Company ${now}`,
    slug: `mcc-route-company-${now}`
  });
  const user = await User.create({
    email: `mcc-route-${now}@example.com`,
    passwordHash: 'test-hash',
    company: company._id,
    roles: ['USER'],
    isActive: true
  });
  const community = await Community.create({
    company: company._id,
    name: 'MCC Route Community',
    city: 'Dallas',
    state: 'TX',
    lots: []
  });

  const firstSave = await makeRequest({
    userId: String(user._id),
    communityId: String(community._id),
    payload: {
      city: 'Frisco',
      state: 'tx',
      zip: '75034'
    }
  });
  assert.equal(firstSave.status, 200);

  let profile = await CommunityCompetitionProfile.findOne({
    company: company._id,
    community: community._id
  }).lean();
  assert.equal(profile?.city, 'Frisco');
  assert.equal(profile?.state, 'TX');
  assert.equal(profile?.zip, '75034');
  assert.equal(profile?.webData?.city, 'Frisco');
  assert.equal(profile?.webData?.state, 'TX');
  assert.equal(profile?.webData?.postalCode, '75034');

  const secondSave = await makeRequest({
    userId: String(user._id),
    communityId: String(community._id),
    payload: {
      city: 'Frisco',
      state: '',
      zip: '75034'
    }
  });
  assert.equal(secondSave.status, 200);

  profile = await CommunityCompetitionProfile.findOne({
    company: company._id,
    community: community._id
  }).lean();
  assert.equal(profile?.city, 'Frisco');
  assert.equal(profile?.state, 'TX');
  assert.equal(profile?.zip, '75034');
  assert.equal(profile?.webData?.city, 'Frisco');
  assert.equal(profile?.webData?.state, 'TX');
  assert.equal(profile?.webData?.postalCode, '75034');

  const draft = await BrzCommunityDraft.findOne({
    companyId: company._id,
    communityId: community._id
  }).lean();
  assert.equal(draft?.competitionWebData?.city, 'Frisco');
  assert.equal(draft?.competitionWebData?.state, 'TX');
  assert.equal(draft?.competitionWebData?.postalCode, '75034');
});

test('MCC save route writes canonical and legacy PID/MUD fee fields and syncs draft webData', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `MCC Fee Company ${now}`,
    slug: `mcc-fee-company-${now}`
  });
  const user = await User.create({
    email: `mcc-fee-${now}@example.com`,
    passwordHash: 'test-hash',
    company: company._id,
    roles: ['USER'],
    isActive: true
  });
  const community = await Community.create({
    company: company._id,
    name: 'MCC Fee Community',
    city: 'Dallas',
    state: 'TX',
    lots: []
  });

  const response = await makeRequest({
    userId: String(user._id),
    communityId: String(community._id),
    payload: {
      feeTypes: ['MUD', 'PID'],
      mudFee: '1400',
      pidFee: '4800',
      pidFeeFrequency: 'monthly'
    }
  });

  assert.equal(response.status, 200);

  const profile = await CommunityCompetitionProfile.findOne({
    company: company._id,
    community: community._id
  }).lean();
  assert.equal(profile?.mudFee, 1400);
  assert.equal(profile?.pidFee, 4800);
  assert.equal(profile?.pidFeeFrequency, 'Monthly');
  assert.equal(profile?.webData?.mudFeeAmount, 1400);
  assert.equal(profile?.webData?.pidFeeAmount, 4800);
  assert.equal(profile?.webData?.pidFeeFrequency, 'Monthly');

  const draft = await BrzCommunityDraft.findOne({
    companyId: company._id,
    communityId: community._id
  }).lean();
  assert.equal(draft?.competitionWebData?.mudFeeAmount, 1400);
  assert.equal(draft?.competitionWebData?.pidFeeAmount, 4800);
  assert.equal(draft?.competitionWebData?.pidFeeFrequency, 'Monthly');
});

test('MCC save route stores mudTaxRate as decimal and preserves legacy mudFee when mudFee is not provided', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `MCC Mud Rate Company ${now}`,
    slug: `mcc-mud-rate-company-${now}`
  });
  const user = await User.create({
    email: `mcc-mud-rate-${now}@example.com`,
    passwordHash: 'test-hash',
    company: company._id,
    roles: ['USER'],
    isActive: true
  });
  const community = await Community.create({
    company: company._id,
    name: 'MCC Mud Rate Community',
    city: 'Dallas',
    state: 'TX',
    lots: []
  });

  await CommunityCompetitionProfile.create({
    company: company._id,
    community: community._id,
    feeTypes: ['MUD'],
    mudFee: 1500,
    webData: {
      mudFeeAmount: 1500
    }
  });

  const response = await makeRequest({
    userId: String(user._id),
    communityId: String(community._id),
    payload: {
      feeTypes: ['MUD'],
      mudTaxRate: 0.78
    }
  });
  assert.equal(response.status, 200);

  const profile = await CommunityCompetitionProfile.findOne({
    company: company._id,
    community: community._id
  }).lean();
  assert.equal(profile?.webData?.mudTaxRate, 0.0078);
  assert.equal(profile?.mudFee, 1500);
  assert.equal(profile?.webData?.mudFeeAmount, 1500);

  const draft = await BrzCommunityDraft.findOne({
    companyId: company._id,
    communityId: community._id
  }).lean();
  assert.equal(draft?.competitionWebData?.mudTaxRate, 0.0078);
  assert.equal(draft?.competitionWebData?.mudFeeAmount, 1500);
});
