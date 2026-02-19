const KEEPUP_MANAGED_BILLING_MESSAGE = 'This account is managed by KeepUp; billing is not self-serve.';

const normalizePolicy = (companyOrPolicy = {}) => {
  const billingPolicy = companyOrPolicy?.billingPolicy || companyOrPolicy || {};
  const seatsMode = String(billingPolicy?.seats?.mode || 'normal').trim().toLowerCase();
  const addonBuildrootz = String(billingPolicy?.addons?.buildrootz || 'normal').trim().toLowerCase();
  const addonWebsiteMap = String(billingPolicy?.addons?.websiteMap || 'normal').trim().toLowerCase();
  return {
    seatsMode,
    addonBuildrootz,
    addonWebsiteMap
  };
};

const isSelfServeBillingBlocked = (companyOrPolicy = {}) => {
  const { seatsMode } = normalizePolicy(companyOrPolicy);
  if (seatsMode === 'waived' || seatsMode === 'internal') {
    return true;
  }
  return false;
};

const deriveStripeBillability = (companyOrPolicy = {}, computedState = {}) => {
  const { seatsMode, addonBuildrootz, addonWebsiteMap } = normalizePolicy(companyOrPolicy);
  const activeUsers = Math.max(0, Number(computedState?.activeUsers || 0));
  const buildrootzActive = !!computedState?.buildrootzActive;
  const websiteMapActiveQty = Math.max(0, Number(computedState?.websiteMapActiveQty || 0));
  const seatBillable = seatsMode === 'normal';
  const buildrootzBillable = buildrootzActive && addonBuildrootz !== 'comped';
  const websiteMapBillable = websiteMapActiveQty > 0 && addonWebsiteMap !== 'comped';

  return {
    seatsMode,
    activeUsers,
    buildrootzActive,
    websiteMapActiveQty,
    seatBillable,
    buildrootzBillable,
    websiteMapBillable,
    shouldUseStripe: seatBillable || buildrootzBillable || websiteMapBillable
  };
};

const shouldUseStripeForCompany = (companyOrPolicy = {}, computedState = {}) => {
  return deriveStripeBillability(companyOrPolicy, computedState).shouldUseStripe;
};

module.exports = {
  KEEPUP_MANAGED_BILLING_MESSAGE,
  isSelfServeBillingBlocked,
  deriveStripeBillability,
  shouldUseStripeForCompany,
  // Backward-compat alias for older callsites.
  isNonStripeManagedByPolicy: isSelfServeBillingBlocked
};
