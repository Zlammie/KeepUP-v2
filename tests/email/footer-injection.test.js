const assert = require('assert');
const { test } = require('node:test');

require('./setup');
const { resetEmailModuleCache } = require('./helpers/testHarness');
const { createCompany, createTemplate, createJob, createEmailSettings, newObjectId } = require('./helpers/factories');

process.env.EMAIL_UNSUBSCRIBE_SECRET = 'footer-secret';
process.env.EMAIL_UNSUBSCRIBE_BASE_URL = 'http://localhost:3000';
process.env.EMAIL_SENDING_ENABLED = 'true';
process.env.EMAIL_ALLOWLIST_ENABLED = 'false';
process.env.EMAIL_PROVIDER = 'mock';

resetEmailModuleCache();

const { buildUnsubscribeUrl } = require('../../server/services/email/unsubscribeToken');
const { appendUnsubscribeFooter } = require('../../server/services/email/unsubscribeFooter');
const scheduler = require('../../server/services/email/scheduler');
const provider = require('../../server/services/email/provider');
const EmailJob = require('../../server/models/EmailJob');


test('blast footer injection adds unsubscribe footer and List-Unsubscribe header', async () => {
  const company = await createCompany();
  const template = await createTemplate({ companyId: company._id });
  await createEmailSettings({
    companyId: company._id,
    overrides: {
      allowedDays: [],
      quietHoursEnabled: false
    }
  });

  const email = 'footer@example.com';
  const unsubscribeUrl = buildUnsubscribeUrl({ companyId: company._id, email });
  assert.ok(unsubscribeUrl, 'Expected unsubscribe URL');

  const footer = appendUnsubscribeFooter({
    html: '<p>Hello</p>',
    text: 'Hello',
    unsubscribeUrl
  });

  assert.ok(footer.html.includes('data-keepup-unsubscribe'), 'Footer HTML should include unsubscribe marker');
  assert.ok(footer.html.includes(unsubscribeUrl), 'Footer HTML should include unsubscribe URL');
  assert.ok(footer.text.includes(unsubscribeUrl), 'Footer text should include unsubscribe URL');

  const job = await createJob({
    companyId: company._id,
    templateId: template._id,
    overrides: {
      blastId: newObjectId(),
      status: EmailJob.STATUS.QUEUED,
      to: email
    }
  });

  let captured = null;
  const originalSend = provider.sendEmail;
  provider.sendEmail = async (payload) => {
    captured = payload;
    return { messageId: 'test' };
  };

  await scheduler.processDueEmailJobs({ limit: 1 });
  provider.sendEmail = originalSend;

  assert.ok(captured, 'Expected provider payload to be captured');
  assert.ok(captured.headers, 'Expected List-Unsubscribe header to be set');
  assert.ok(captured.headers['List-Unsubscribe'], 'List-Unsubscribe header missing');
  assert.ok(
    String(captured.headers['List-Unsubscribe']).includes('/email/unsubscribe?token='),
    'List-Unsubscribe header should include unsubscribe URL'
  );

  const updated = await EmailJob.findById(job._id).lean();
  assert.strictEqual(updated.status, EmailJob.STATUS.SENT, 'Blast job should be sent in test');
});
