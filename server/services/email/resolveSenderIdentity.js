const CompanyEmailDomain = require('../../models/CompanyEmailDomain');
const { normalizeEmail } = require('../../utils/normalizeEmail');
const { getSendgridConfig } = require('./emailConfig');

const DEFAULT_FROM_NAME = 'KeepUp CRM';

async function resolveSenderIdentity({ companyId, senderEmail, senderName }) {
  const config = getSendgridConfig();
  const fallbackFromEmail = config.fromEmail || '';
  const fallbackFromName = config.fromName || DEFAULT_FROM_NAME;

  const normalizedSender = normalizeEmail(senderEmail);
  const baseResult = {
    fromEmail: fallbackFromEmail,
    fromName: fallbackFromName,
    replyTo: normalizedSender || null,
    mode: 'platform'
  };

  if (!normalizedSender || !companyId) {
    return baseResult;
  }

  let verified = null;
  try {
    verified = await CompanyEmailDomain.findOne({
      companyId,
      status: CompanyEmailDomain.STATUS.VERIFIED
    }).lean();
  } catch (err) {
    console.warn('[email] resolveSenderIdentity failed to load verified domain', err?.message || err);
    return baseResult;
  }

  if (!verified?.domain) {
    return baseResult;
  }

  const senderDomain = normalizedSender.split('@')[1] || '';
  const verifiedDomain = String(verified.domain || '').toLowerCase();

  if (senderDomain && verifiedDomain && senderDomain === verifiedDomain) {
    return {
      fromEmail: normalizedSender,
      fromName: senderName || fallbackFromName,
      replyTo: normalizedSender,
      mode: 'user_verified_domain'
    };
  }

  return baseResult;
}

module.exports = { resolveSenderIdentity };
