const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany } = require('./helpers/factories');

process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret';
process.env.EMAIL_UNSUBSCRIBE_BASE_URL = 'http://localhost:3000';

resetEmailModuleCache();

const { buildUnsubscribeToken } = require('../../server/services/email/unsubscribeToken');
const { processUnsubscribeToken } = require('../../server/services/email/unsubscribeHandler');
const Suppression = require('../../server/models/Suppression');


test('unsubscribe token validation creates suppression and rejects invalid token', async () => {
  const company = await createCompany();

  const email = 'valid@example.com';
  const token = buildUnsubscribeToken({ companyId: company._id, email });
  assert.ok(token, 'Expected unsubscribe token to be generated');

  const validResult = await processUnsubscribeToken(token);
  assert.strictEqual(validResult.ok, true, 'Valid token should succeed');

  const suppressionCount = await Suppression.countDocuments({ companyId: company._id, email });
  assert.strictEqual(suppressionCount, 1, 'Suppression record should be created');

  const invalidResult = await processUnsubscribeToken('invalid-token');
  assert.strictEqual(invalidResult.ok, false, 'Invalid token should fail');

  const suppressionCountAfter = await Suppression.countDocuments({ companyId: company._id, email: 'invalid@example.com' });
  assert.strictEqual(suppressionCountAfter, 0, 'Invalid token should not create suppression');
});
