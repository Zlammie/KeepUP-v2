const EmailSettings = require('../../models/EmailSettings');
const { isEmailSendingEnabled, getUnsubscribeConfig } = require('./emailConfig');

const getEmailReadiness = async ({ company }) => {
  const blockersTransactional = [];
  const blockersBlast = [];

  if (!isEmailSendingEnabled()) {
    blockersTransactional.push({
      code: 'SENDING_DISABLED',
      message: 'EMAIL_SENDING_ENABLED is false.'
    });
  }

  if (company?.emailSendingPaused) {
    blockersTransactional.push({
      code: 'COMPANY_SENDING_PAUSED',
      message: 'Company sending is paused.'
    });
  }

  let settings = null;
  try {
    settings = await EmailSettings.findOne({ companyId: company?._id }).lean();
  } catch (_) {
    settings = null;
  }

  const behavior = settings?.unsubscribeBehavior || 'do_not_email';
  const validBehaviors = EmailSettings.UNSUBSCRIBE_BEHAVIOR
    ? Object.values(EmailSettings.UNSUBSCRIBE_BEHAVIOR)
    : ['do_not_email', 'set_not_interested', 'tag_unsubscribed'];

  if (!behavior || !validBehaviors.includes(behavior)) {
    blockersBlast.push({
      code: 'UNSUBSCRIBE_BEHAVIOR_INVALID',
      message: 'Unsubscribe behavior is missing or invalid.'
    });
  }

  const unsubscribeConfig = getUnsubscribeConfig();
  const hasSecret = Boolean(unsubscribeConfig.secret);
  const hasBaseUrl = Boolean(unsubscribeConfig.baseUrl);
  const baseUrlSource = unsubscribeConfig.baseUrl
    ? (process.env.EMAIL_UNSUBSCRIBE_BASE_URL ? 'email_unsubscribe_base_url' : 'base_url')
    : null;

  if (!hasSecret) {
    blockersBlast.push({
      code: 'MISSING_UNSUBSCRIBE_SECRET',
      message: 'EMAIL_UNSUBSCRIBE_SECRET is not set.'
    });
  }
  if (!hasBaseUrl) {
    blockersBlast.push({
      code: 'MISSING_UNSUBSCRIBE_BASE_URL',
      message: 'EMAIL_UNSUBSCRIBE_BASE_URL or BASE_URL is required.'
    });
  }

  const transactionalEnabled = blockersTransactional.length === 0;
  const blastEnabled = transactionalEnabled && blockersBlast.length === 0;

  return {
    transactional: {
      enabled: transactionalEnabled,
      blockers: blockersTransactional
    },
    blast: {
      enabled: blastEnabled,
      blockers: blockersBlast,
      unsubscribe: {
        hasSecret,
        hasBaseUrl,
        baseUrlSource
      }
    }
  };
};

module.exports = { getEmailReadiness };
