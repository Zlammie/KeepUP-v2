const BLOCKED_REASONS = [
  'BLAST_PAUSED',
  'SENDING_DISABLED',
  'ALLOWLIST_BLOCKED',
  'DAILY_CAP_REACHED',
  'COMPANY_SENDING_PAUSED',
  'UNSUBSCRIBE_CONFIG_MISSING'
  // add more here if you introduce other "held" states later
];

module.exports = { BLOCKED_REASONS };
