const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const pagesRouter = require('../../server/routes/pages');
const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const User = require('../../server/models/User');

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
  await Community.deleteMany({});
  await User.deleteMany({});
  await Company.deleteMany({});
});

async function postListingContent({ userId, payload }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId };
    next();
  });
  app.use('/', pagesRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/listing-details/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('listing content save persists lot city/state/postalCode', async () => {
  const now = Date.now();
  const company = await Company.create({
    name: `Listing Save Co ${now}`,
    slug: `listing-save-co-${now}`
  });
  const user = await User.create({
    email: `listing-save-${now}@example.com`,
    passwordHash: 'test-hash',
    company: company._id,
    roles: ['USER'],
    isActive: true
  });
  const community = await Community.create({
    company: company._id,
    name: 'Listing Save Community',
    city: 'Dallas',
    state: 'TX',
    lots: [
      {
        address: '123 Main St',
        generalStatus: 'Available',
        buildrootz: { isPublished: false },
        city: '',
        state: '',
        postalCode: ''
      }
    ]
  });
  const lotId = String(community.lots[0]._id);

  const result = await postListingContent({
    userId: String(user._id),
    payload: {
      communityId: String(community._id),
      lotId,
      promoText: 'Spring Incentive',
      listingDescription: 'Quick move-in home',
      city: ' Frisco ',
      state: 'tx',
      postalCode: '75034 1234'
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.body?.success, true);

  const refreshed = await Community.findById(community._id).lean();
  const lot = (refreshed?.lots || []).find((entry) => String(entry._id) === lotId);
  assert.ok(lot);
  assert.equal(lot.city, 'Frisco');
  assert.equal(lot.state, 'TX');
  assert.equal(lot.postalCode, '75034-1234');
});

