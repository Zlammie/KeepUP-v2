const mongoose = require('mongoose');
const Company = require('../../../server/models/Company');
const EmailTemplate = require('../../../server/models/EmailTemplate');
const EmailJob = require('../../../server/models/EmailJob');
const EmailEvent = require('../../../server/models/EmailEvent');
const EmailSettings = require('../../../server/models/EmailSettings');

const uniqueSuffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const createCompany = async (overrides = {}) => {
  const suffix = uniqueSuffix();
  return Company.create({
    name: `Test Company ${suffix}`,
    emailDailyCapEnabled: false,
    ...overrides
  });
};

const createTemplate = async ({ companyId, overrides = {} } = {}) => {
  if (!companyId) {
    const company = await createCompany();
    companyId = company._id;
  }
  const suffix = uniqueSuffix();
  return EmailTemplate.create({
    companyId,
    name: `Template ${suffix}`,
    subject: 'Test Subject',
    html: '<p>Test</p>',
    text: 'Test',
    ...overrides
  });
};

const createJob = async ({ companyId, templateId, overrides = {} } = {}) => {
  if (!companyId || !templateId) {
    const template = await createTemplate({ companyId });
    companyId = template.companyId;
    templateId = template._id;
  }
  return EmailJob.create({
    companyId,
    templateId,
    to: 'test@example.com',
    scheduledFor: new Date(),
    status: EmailJob.STATUS.QUEUED,
    ...overrides
  });
};

const createEmailEvent = async (overrides = {}) => {
  return EmailEvent.create({
    provider: 'sendgrid',
    event: 'bounce',
    email: 'event@example.com',
    ...overrides
  });
};

const createEmailSettings = async ({ companyId, overrides = {} } = {}) => {
  if (!companyId) {
    const company = await createCompany();
    companyId = company._id;
  }
  return EmailSettings.create({
    companyId,
    ...overrides
  });
};

const newObjectId = () => new mongoose.Types.ObjectId();

module.exports = {
  createCompany,
  createTemplate,
  createJob,
  createEmailEvent,
  createEmailSettings,
  newObjectId
};
