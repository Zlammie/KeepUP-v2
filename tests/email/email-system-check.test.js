const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany } = require('./helpers/factories');

process.env.SENDGRID_API_KEY = '';
process.env.SENDGRID_WEBHOOK_SECRET = '';
process.env.SENDGRID_WEBHOOK_TOKEN = '';
process.env.SENDGRID_WEBHOOK_PUBLIC_KEY = '';
process.env.EMAIL_UNSUBSCRIBE_SECRET = '';
process.env.EMAIL_UNSUBSCRIBE_BASE_URL = '';
process.env.BASE_URL = '';
process.env.EMAIL_SCHEDULER_HEARTBEAT_MINUTES = '5';

resetEmailModuleCache();

const { getEmailSystemCheck } = require('../../server/services/email/emailSystemCheck');
const { getEmailReadiness } = require('../../server/services/email/emailReadiness');
const { setSchedulerHeartbeat } = require('../../server/services/email/scheduler');


test('email system check surfaces missing config and stale heartbeat', async () => {
  const company = await createCompany();
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  setSchedulerHeartbeat(stale);

  const check = await getEmailSystemCheck({ company });

  assert.strictEqual(check.sendgrid.apiKeyPresent, false, 'apiKeyPresent should be false');
  assert.strictEqual(check.unsubscribe.secretPresent, false, 'unsubscribe secret should be missing');
  assert.strictEqual(check.unsubscribe.baseUrlResolved, false, 'baseUrlResolved should be false');
  assert.strictEqual(check.scheduler.heartbeatOk, false, 'heartbeat should be stale');

  const readiness = await getEmailReadiness({ company });
  assert.strictEqual(
    check.readiness.transactionalEnabled,
    readiness.transactional.enabled,
    'transactional readiness should match service'
  );
  assert.strictEqual(
    check.readiness.blastEnabled,
    readiness.blast.enabled,
    'blast readiness should match service'
  );
  const expectedBlockers =
    readiness.transactional.blockers.length + readiness.blast.blockers.length;
  assert.strictEqual(
    check.readiness.blockers.length,
    expectedBlockers,
    'blockers should match readiness service'
  );
});
