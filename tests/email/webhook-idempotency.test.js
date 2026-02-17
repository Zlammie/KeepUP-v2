const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany, createTemplate, createJob } = require('./helpers/factories');
const { buildSendgridEvent } = require('./helpers/webhook');

process.env.EMAIL_ADMIN_ALERTS_ENABLED = 'false';
resetEmailModuleCache();

const { processSendgridEvents } = require('../../server/services/email/sendgridWebhookProcessor');
const EmailEvent = require('../../server/models/EmailEvent');
const Suppression = require('../../server/models/Suppression');
const Company = require('../../server/models/Company');
const EmailJob = require('../../server/models/EmailJob');


test('webhook idempotency dedupes duplicate events', async () => {
  const company = await createCompany({ emailAutoPauseOnSpamReport: true, emailAutoPauseOnBounceRate: false });
  const template = await createTemplate({ companyId: company._id });
  const job = await createJob({
    companyId: company._id,
    templateId: template._id,
    overrides: { status: EmailJob.STATUS.SENT, to: 'spam@example.com' }
  });

  const eventPayload = buildSendgridEvent({
    event: 'spamreport',
    email: 'spam@example.com',
    companyId: company._id,
    jobId: job._id,
    sgEventId: `evt_${Date.now().toString(36)}`,
    sgMessageId: `msg_${Date.now().toString(36)}`
  });

  const first = await processSendgridEvents([eventPayload]);
  assert.strictEqual(first.processed, 1, 'First webhook should process one event');

  const second = await processSendgridEvents([eventPayload]);
  assert.strictEqual(second.processed, 0, 'Second webhook should not process the duplicate');
  assert.strictEqual(second.deduped, 1, 'Second webhook should report deduped=1');

  const eventsCount = await EmailEvent.countDocuments({ sgEventId: eventPayload.sg_event_id });
  assert.strictEqual(eventsCount, 1, 'Only one EmailEvent should be stored for dedupe key');

  const suppressionCount = await Suppression.countDocuments({ companyId: company._id, email: 'spam@example.com' });
  assert.strictEqual(suppressionCount, 1, 'Suppression should be stored once');

  const updatedCompany = await Company.findById(company._id).lean();
  assert.strictEqual(updatedCompany.emailSendingPaused, true, 'Company should be paused on spamreport');
});
