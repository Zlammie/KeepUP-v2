const formatCents = (cents) => {
  const value = Number.isFinite(cents) ? cents : 0;
  const dollars = value / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars);
};

const centsToDollars = (cents) => {
  const value = Number.isFinite(cents) ? cents : 0;
  return value / 100;
};

const pricingConfig = {
  seats: {
    minBilled: 3,
    pricePerSeatMonthlyCents: 4999,
    label: 'Seats'
  },
  buildrootz: {
    monthlyCents: 9900,
    label: 'BuildRootz'
  },
  websiteMap: {
    monthlyCents: 12500,
    annualCents: 120000,
    setupFeeCents: 30000,
    defaultTrialDays: 30,
    label: 'Website Map'
  }
};

module.exports = {
  pricingConfig,
  formatCents,
  centsToDollars
};
