const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

require('./setup');

const SignupRequest = require('../../server/models/SignupRequest');
const { KEEPUP_LEGAL_VERSIONS } = require('../../server/constants/legalVersions');
const signupRequestMailer = require('../../server/services/signupRequestMailer');

let originalSendSignupRequestEmail = null;
let app = null;

const buildValidSignupPayload = (overrides = {}) => ({
  firstName: 'Taylor',
  lastName: 'Builder',
  companyName: 'KeepUp Test Homes',
  workEmail: 'legal-test@example.com',
  phone: '512-555-0100',
  salesTeamSize: '12',
  interestedProducts: 'Interactive Maps',
  ...overrides
});

const makeRequest = async ({ method = 'GET', route = '/', form = null } = {}) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const init = { method, headers: {} };

    if (form) {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }

    const response = await fetch(`http://127.0.0.1:${port}${route}`, init);
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

before(() => {
  originalSendSignupRequestEmail = signupRequestMailer.sendSignupRequestEmail;
  signupRequestMailer.sendSignupRequestEmail = async () => {};

  delete require.cache[require.resolve('../../server/routes/marketingRoutes')];
  const marketingRoutes = require('../../server/routes/marketingRoutes');

  app = express();
  app.use(express.urlencoded({ extended: true }));
  app.set('views', path.join(process.cwd(), 'client', 'views'));
  app.set('view engine', 'ejs');
  app.use('/', marketingRoutes);
});

after(() => {
  signupRequestMailer.sendSignupRequestEmail = originalSendSignupRequestEmail;
});

test('signup request rejects submission without legal acceptance', async () => {
  const response = await makeRequest({
    method: 'POST',
    route: '/signup-request',
    form: buildValidSignupPayload()
  });

  assert.equal(response.status, 400);
  assert.match(response.text, /You must agree to the Terms of Service and Privacy Policy\./);

  const count = await SignupRequest.countDocuments();
  assert.equal(count, 0);
});

test('signup request persists legal acceptance metadata when accepted', async () => {
  const acceptedEmail = 'accepted-legal@example.com';
  const response = await makeRequest({
    method: 'POST',
    route: '/signup-request',
    form: buildValidSignupPayload({
      workEmail: acceptedEmail,
      termsAccepted: 'true'
    })
  });

  assert.equal(response.status, 200);
  assert.match(response.text, /Thanks for your interest in KeepUp\./);

  const record = await SignupRequest.findOne({ workEmail: acceptedEmail }).lean();
  assert.ok(record, 'Expected signup request to be persisted');
  assert.equal(record.termsAccepted, true);
  assert.ok(record.termsAcceptedAt instanceof Date, 'Expected termsAcceptedAt to be a Date');
  assert.equal(record.termsVersion, KEEPUP_LEGAL_VERSIONS.terms);
  assert.equal(record.privacyVersion, KEEPUP_LEGAL_VERSIONS.privacy);
});

test('GET /terms responds with the KeepUp terms page', async () => {
  const response = await makeRequest({ route: '/terms' });

  assert.equal(response.status, 200);
  assert.match(response.text, /<title>KeepUp Terms of Service<\/title>/);
  assert.match(response.text, /<h1[^>]*>Terms of Service<\/h1>/);
});

test('GET /privacy responds with the KeepUp privacy page', async () => {
  const response = await makeRequest({ route: '/privacy' });

  assert.equal(response.status, 200);
  assert.match(response.text, /<title>KeepUp Privacy Policy<\/title>/);
  assert.match(response.text, /<h1[^>]*>Privacy Policy<\/h1>/);
});

test('GET /billing-terms responds with the KeepUp billing terms page', async () => {
  const response = await makeRequest({ route: '/billing-terms' });

  assert.equal(response.status, 200);
  assert.match(response.text, /<title>KeepUp Billing Terms<\/title>/);
  assert.match(response.text, /<h1[^>]*>Billing Terms<\/h1>/);
});
