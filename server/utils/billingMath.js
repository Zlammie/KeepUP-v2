const { pricingConfig, formatCents } = require('../config/pricingConfig');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const formatDateShort = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dateFormatter.format(date);
};

const getTrialCountdown = (trialEndsAt, now = new Date()) => {
  if (!trialEndsAt) {
    return { trialEndsAtFormatted: null, trialEndsInDays: null };
  }
  const end = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) {
    return { trialEndsAtFormatted: null, trialEndsInDays: null };
  }
  const diffMs = end.getTime() - now.getTime();
  const trialEndsInDays = Math.max(0, Math.ceil(diffMs / MS_PER_DAY));

  return {
    trialEndsAtFormatted: formatDateShort(end),
    trialEndsInDays
  };
};

const computeSeatBilling = (activeUsed = 0, minOverride = null) => {
  const used = Number.isFinite(activeUsed) && activeUsed >= 0 ? activeUsed : 0;
  const overrideValue = Number.isFinite(minOverride) ? Number(minOverride) : null;
  const minimum = overrideValue !== null
    ? Math.max(0, overrideValue)
    : Number.isFinite(pricingConfig.seats?.minBilled)
      ? Number(pricingConfig.seats.minBilled)
      : 0;
  const perSeat = Number.isFinite(pricingConfig.seats?.pricePerSeatMonthlyCents)
    ? Number(pricingConfig.seats.pricePerSeatMonthlyCents)
    : 0;
  const billed = Math.max(minimum, used);
  const monthlyCents = billed * perSeat;

  return {
    used,
    minimum,
    billed,
    monthlyCents,
    monthlyFormatted: formatCents(monthlyCents)
  };
};

const isTrialExpired = (websiteMap, now = new Date()) => {
  if (!websiteMap || websiteMap.status !== 'trial' || !websiteMap.trialEndsAt) {
    return false;
  }
  const end = new Date(websiteMap.trialEndsAt);
  if (Number.isNaN(end.getTime())) {
    return false;
  }
  return now.getTime() > end.getTime();
};

// Entitlements control access + quantities; billingPolicy adjusts cost only.
const computeEstimatedMonthlySummary = ({
  seatCounts,
  entitlements,
  communities,
  buildrootzStatus,
  billingPolicy
}) => {
  const policy = billingPolicy || {};
  const seatPolicy = policy.seats || {};
  const addonPolicy = policy.addons || {};
  const seatBilling = computeSeatBilling(seatCounts?.active || 0, seatPolicy.minBilledOverride);
  const seatBadges = [];
  let seatMonthlyCents = seatBilling.monthlyCents;
  let seatIsComped = false;
  if (seatPolicy.mode === 'waived') {
    seatMonthlyCents = 0;
    seatBadges.push('Comped');
    seatIsComped = true;
  } else if (seatPolicy.mode === 'internal') {
    seatMonthlyCents = 0;
    seatBadges.push('Internal');
    seatIsComped = true;
  }
  const seatsSummary = {
    ...seatBilling,
    monthlyCents: seatMonthlyCents,
    monthlyFormatted: formatCents(seatMonthlyCents)
  };
  const lineItems = [
    {
      key: 'seats',
      label: pricingConfig.seats.label,
      scope: 'Company',
      quantity: seatBilling.billed,
      quantityText: `Used ${seatBilling.used} - Billed ${seatBilling.billed} (min ${seatBilling.minimum})`,
      monthlyCents: seatsSummary.monthlyCents,
      monthlyFormatted: seatsSummary.monthlyFormatted,
      badges: seatBadges,
      isComped: seatIsComped
    }
  ];

  if (['active', 'trial'].includes(buildrootzStatus)) {
    let monthlyCents = Number(pricingConfig.buildrootz.monthlyCents || 0);
    const badges = [];
    let isComped = false;
    if (addonPolicy.buildrootz === 'comped') {
      monthlyCents = 0;
      badges.push('Comped');
      isComped = true;
    }
    lineItems.push({
      key: 'buildrootz',
      label: pricingConfig.buildrootz.label,
      scope: 'Company',
      quantity: 1,
      quantityText: '1',
      monthlyCents,
      monthlyFormatted: formatCents(monthlyCents),
      badges,
      isComped
    });
  }

  const websiteMapMonthlyCents = Number(pricingConfig.websiteMap.monthlyCents || 0);
  const mapCommunities = Array.isArray(communities) ? communities : [];
  const activeMapCount = mapCommunities.filter((community) => {
    const displayStatus = community.websiteMap?.displayStatus || community.websiteMap?.status;
    return displayStatus === 'active';
  }).length;

  if (activeMapCount) {
    const freeSetups = Number(entitlements?.websiteMap?.freeCommunitySetups || 0);
    const billableCount = Math.max(0, activeMapCount - freeSetups);
    let monthlyCents = billableCount * websiteMapMonthlyCents;
    const badges = [];
    let isComped = false;
    if (addonPolicy.websiteMap === 'comped') {
      monthlyCents = 0;
      badges.push('Comped');
      isComped = true;
    }
    lineItems.push({
      key: 'websiteMap',
      label: pricingConfig.websiteMap.label,
      scope: 'Per community',
      quantity: billableCount,
      quantityText: `${activeMapCount}`,
      monthlyCents,
      monthlyFormatted: formatCents(monthlyCents),
      badges,
      isComped
    });
  }

  const totalMonthlyCents = lineItems.reduce((sum, item) => sum + (item.monthlyCents || 0), 0);

  return {
    seats: seatsSummary,
    lineItems,
    totalMonthlyCents,
    totalMonthlyFormatted: formatCents(totalMonthlyCents)
  };
};

module.exports = {
  computeSeatBilling,
  computeEstimatedMonthlySummary,
  isTrialExpired,
  getTrialCountdown,
  formatDateShort
};
