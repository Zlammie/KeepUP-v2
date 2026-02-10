(function emailErrorLabelsFactory() {
  const LABELS = {
    RULE_STATUS_EXIT: 'Canceled (no longer matched rule)',
    SCHEDULE_STOP_STATUS: 'Canceled (stop status reached)',
    SCHEDULE_UNENROLLED: 'Canceled (schedule un-enrolled)',
    CONTACT_PAUSED: 'Skipped (contact paused)',
    REALTOR_PAUSED: 'Skipped (realtor paused)',
    BLAST_PAUSED: 'Blast paused',
    SUPPRESSED: 'Skipped (suppressed)',
    INVALID_EMAIL: 'Skipped (invalid email)',
    OUTSIDE_SEND_WINDOW: 'Rescheduled (outside send window)',
    DAILY_CAP: 'Rescheduled (daily limit reached)',
    RATE_LIMIT: 'Rescheduled (rate limited)'
  };

  function getEmailErrorLabel(lastError) {
    if (!lastError) return null;
    const key = String(lastError).trim();
    if (!key) return null;
    return LABELS[key] || key;
  }

  if (typeof window !== 'undefined') {
    window.getEmailErrorLabel = getEmailErrorLabel;
  }
})();
