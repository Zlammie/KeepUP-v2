const KEEPUP_LEGAL_VERSIONS = Object.freeze({
  terms: 'v1.0',
  privacy: 'v1.0',
  termsLastUpdated: 'March 30, 2026',
  privacyLastUpdated: 'March 30, 2026',
  billingTermsLastUpdated: 'March 30, 2026'
});

const buildSignupLegalAcceptance = ({ acceptedAt = new Date() } = {}) => ({
  termsAccepted: true,
  termsAcceptedAt: acceptedAt,
  termsVersion: KEEPUP_LEGAL_VERSIONS.terms,
  privacyVersion: KEEPUP_LEGAL_VERSIONS.privacy
});

module.exports = {
  KEEPUP_LEGAL_VERSIONS,
  buildSignupLegalAcceptance
};
