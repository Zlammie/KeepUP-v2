const computeDeliverabilityHealth = ({
  company,
  warmup,
  capReached,
  domainConfigured,
  domainVerified
}) => {
  if (company?.emailSendingPaused) {
    return {
      state: 'PAUSED',
      reason: company.emailSendingPausedReason || 'paused',
      recommendedAction: 'Review deliverability and resume when ready.',
      cta: { label: 'Resume sending', action: 'resume' }
    };
  }

  if (warmup?.active) {
    return {
      state: 'WARMING_UP',
      reason: 'Domain warm-up in progress.',
      recommendedAction: 'Allow ramp-up to protect reputation.',
      cta: { label: 'Reset warm-up', action: 'warmup_reset' }
    };
  }

  if (capReached) {
    return {
      state: 'LIMITED',
      reason: 'Daily cap reached.',
      recommendedAction: 'Will resume automatically at reset time.',
      cta: { label: null, action: null }
    };
  }

  if (domainConfigured && !domainVerified) {
    return {
      state: 'MISCONFIGURED',
      reason: 'Domain not verified; using platform sender.',
      recommendedAction: 'Verify domain to send from user addresses.',
      cta: { label: 'Verify domain', action: 'verify_domain' }
    };
  }

  return {
    state: 'ACTIVE',
    reason: 'Sending active.',
    recommendedAction: 'No action needed.',
    cta: { label: null, action: null }
  };
};

module.exports = { computeDeliverabilityHealth };
