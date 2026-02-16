const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany, createTemplate, newObjectId } = require('./helpers/factories');

resetEmailModuleCache();

const { getBlockedEmailJobsReport } = require('../../server/services/email/emailJobDebug');
const EmailJob = require('../../server/models/EmailJob');


test('blocked jobs endpoint summary and samples are consistent', async () => {
  const company = await createCompany();
  const template = await createTemplate({ companyId: company._id });

  const now = new Date();
  const jobs = [
    { lastError: 'SENDING_DISABLED', to: 'a@example.com' },
    { lastError: 'SENDING_DISABLED', to: 'b@example.com' },
    { lastError: 'SENDING_DISABLED', to: 'c@example.com' },
    { lastError: 'ALLOWLIST_BLOCKED', to: 'd@example.com' }
  ].map((entry) => ({
    companyId: company._id,
    to: entry.to,
    templateId: template._id,
    scheduledFor: now,
    status: EmailJob.STATUS.QUEUED,
    lastError: entry.lastError,
    blastId: newObjectId()
  }));

  await EmailJob.insertMany(jobs, { ordered: false });

  const report = await getBlockedEmailJobsReport({ companyId: company._id, limit: 2 });
  assert.strictEqual(report.summary[0].reason, 'SENDING_DISABLED', 'Summary should order by count desc');
  assert.strictEqual(report.summary[0].count, 3, 'Summary count should match');
  assert.strictEqual(report.samples.length, 2, 'Samples should respect limit');
  assert.ok(report.samples[0].lastError, 'Samples should include lastError');
  assert.ok(Object.prototype.hasOwnProperty.call(report.samples[0], 'fromMode'), 'Samples should include fromMode');
});
