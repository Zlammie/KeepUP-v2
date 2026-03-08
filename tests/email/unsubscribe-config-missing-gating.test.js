const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany, createTemplate, createJob, newObjectId } = require('./helpers/factories');

process.env.EMAIL_SENDING_ENABLED = 'true';
process.env.EMAIL_ALLOWLIST_ENABLED = 'false';
process.env.EMAIL_PROVIDER = 'mock';
process.env.EMAIL_UNSUBSCRIBE_SECRET = '';
process.env.EMAIL_UNSUBSCRIBE_BASE_URL = 'http://localhost:3000';

resetEmailModuleCache();

const { processDueEmailJobs } = require('../../server/services/email/scheduler');
const EmailJob = require('../../server/models/EmailJob');


test('blast jobs are blocked when unsubscribe config is missing', async () => {
  const company = await createCompany({ emailDailyCapEnabled: false });
  const template = await createTemplate({ companyId: company._id });
  const job = await createJob({
    companyId: company._id,
    templateId: template._id,
    overrides: {
      blastId: newObjectId(),
      status: EmailJob.STATUS.QUEUED,
      to: 'test@example.com'
    }
  });

  await processDueEmailJobs({ limit: 1 });

  const updated = await EmailJob.findById(job._id).lean();
  assert.strictEqual(updated.status, EmailJob.STATUS.QUEUED, 'Job should remain queued');
  assert.strictEqual(updated.lastError, 'UNSUBSCRIBE_CONFIG_MISSING', 'Job should be blocked for missing config');
  assert.strictEqual(updated.attempts, 0, 'Attempts should not increment for blocked job');
});
