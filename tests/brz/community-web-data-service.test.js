const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCommunityAmenities,
  normalizeCompetitionWebData,
  normalizePromo,
  normalizeState,
  normalizeTaxRateInput,
  competitionProfileToWebData,
  mergeCompetitionWebData,
  competitionWebDataToProfileSet
} = require('../../server/services/communityWebDataService');

test('normalizeCommunityAmenities normalizes strings and de-dupes case-insensitively', () => {
  const normalized = normalizeCommunityAmenities([' Pool ', '', 'Trails', 'pool']);

  assert.deepEqual(normalized, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('normalizePromo converts strings into the canonical promo object', () => {
  assert.deepEqual(normalizePromo(' Spring Savings '), {
    headline: 'Spring Savings'
  });
});

test('normalizeState uppercases valid state codes and rejects invalid values', () => {
  assert.equal(normalizeState(' tx '), 'TX');
  assert.equal(normalizeState('Texas'), '');
  assert.equal(normalizeState(''), '');
});

test('normalizeTaxRateInput accepts percent and decimal formats and stores a decimal', () => {
  assert.equal(normalizeTaxRateInput('2.15'), 0.0215);
  assert.equal(normalizeTaxRateInput('2.15%'), 0.0215);
  assert.equal(normalizeTaxRateInput('0.0215'), 0.0215);
  assert.equal(normalizeTaxRateInput(''), null);
});

test('normalizeTaxRateInput rejects invalid values when validation is required', () => {
  assert.throws(() => normalizeTaxRateInput('abc', { throwOnInvalid: true }), /Tax Rate must be a valid number/);
  assert.throws(() => normalizeTaxRateInput('-1', { throwOnInvalid: true }), /Tax Rate cannot be negative/);
});

test('normalizeCompetitionWebData retains canonical tax and explicit PID/MUD fee fields', () => {
  const normalized = normalizeCompetitionWebData({
    taxRate: '2.73',
    mudTaxRate: 0.0078,
    mudFeeAmount: '1200',
    pidFeeAmount: '4800',
    pidFeeFrequency: 'monthly',
    amenities: [' Pool ', '', 'Trails', 'pool']
  });

  assert.equal(normalized.taxRate, 0.0273);
  assert.equal(normalized.mudTaxRate, 0.0078);
  assert.equal(normalized.mudFeeAmount, 1200);
  assert.equal(normalized.pidFeeAmount, 4800);
  assert.equal(normalized.pidFeeFrequency, 'Monthly');
  assert.deepEqual(normalized.amenities, [
    { label: 'Pool' },
    { label: 'Trails' }
  ]);
});

test('competitionProfileToWebData restores legacy tax and explicit PID/MUD fee fields', () => {
  const webData = competitionProfileToWebData({
    tax: 2.91,
    feeTypes: ['PID', 'MUD'],
    mudFee: 1500,
    pidFee: 5300,
    pidFeeFrequency: 'Yearly'
  });

  assert.equal(webData.taxRate, 0.0291);
  assert.equal(webData.mudFeeAmount, 1500);
  assert.equal(webData.pidFeeAmount, 5300);
  assert.equal(webData.pidFeeFrequency, 'Yearly');
  assert.equal(webData.hasMUD, true);
  assert.equal(webData.hasPID, true);
});

test('competitionProfileToWebData keeps canonical mudTaxRate and does not infer a rate from legacy mudFee', () => {
  const canonicalRate = competitionProfileToWebData({
    mudFee: 1500,
    webData: {
      mudTaxRate: 0.0078
    }
  });
  assert.equal(canonicalRate.mudTaxRate, 0.0078);
  assert.equal(canonicalRate.mudFeeAmount, 1500);

  const legacyOnly = competitionProfileToWebData({
    mudFee: 1500,
    webData: {}
  });
  assert.equal(legacyOnly.mudTaxRate, undefined);
  assert.equal(legacyOnly.mudFeeAmount, 1500);
});

test('competitionProfileToWebData restores legacy promotion into canonical webData.promo', () => {
  const webData = competitionProfileToWebData({
    promotion: 'Save up to $15k'
  });

  assert.deepEqual(webData.promo, {
    headline: 'Save up to $15k'
  });
});

test('competitionProfileToWebData falls back to legacy state when canonical state is missing', () => {
  const webData = competitionProfileToWebData({
    state: 'tx',
    webData: {
      primaryContact: { name: 'Sales Team' }
    }
  });

  assert.equal(webData.state, 'TX');
});

test('competitionProfileToWebData falls back to legacy state when canonical state is empty', () => {
  const webData = competitionProfileToWebData({
    state: 'ok',
    webData: {
      state: '',
      primaryContact: { name: 'Sales Team' }
    }
  });

  assert.equal(webData.state, 'OK');
});

test('competitionProfileToWebData prefers canonical city/state/postalCode when present', () => {
  const webData = competitionProfileToWebData({
    city: 'Legacy City',
    state: 'tx',
    zip: '79999',
    webData: {
      city: 'Frisco',
      state: 'ok',
      postalCode: '75034'
    }
  });

  assert.equal(webData.city, 'Frisco');
  assert.equal(webData.state, 'OK');
  assert.equal(webData.postalCode, '75034');
});

test('competitionProfileToWebData prefers canonical PID/MUD fee fields over legacy values', () => {
  const webData = competitionProfileToWebData({
    feeTypes: ['PID', 'MUD'],
    mudFee: 1500,
    pidFee: 5300,
    pidFeeFrequency: 'Yearly',
    webData: {
      mudFeeAmount: 900,
      pidFeeAmount: 4200,
      pidFeeFrequency: 'Monthly'
    }
  });

  assert.equal(webData.mudFeeAmount, 900);
  assert.equal(webData.pidFeeAmount, 4200);
  assert.equal(webData.pidFeeFrequency, 'Monthly');
});

test('mergeCompetitionWebData keeps tax and fee values when patch omits them', () => {
  const merged = mergeCompetitionWebData(
    {
      taxRate: 0.025,
      mudTaxRate: 0.0075,
      mudFeeAmount: 900,
      pidFeeAmount: 4200,
      pidFeeFrequency: 'Monthly'
    },
    {
      primaryContact: { name: 'Sales Rep' }
    }
  );

  assert.equal(merged.taxRate, 0.025);
  assert.equal(merged.mudTaxRate, 0.0075);
  assert.equal(merged.mudFeeAmount, 900);
  assert.equal(merged.pidFeeAmount, 4200);
  assert.equal(merged.pidFeeFrequency, 'Monthly');
});

test('competitionWebDataToProfileSet converts decimal taxRate back to legacy percent', () => {
  const profileSet = competitionWebDataToProfileSet({
    taxRate: 0.0215
  });

  assert.equal(profileSet.tax, 2.15);
});

test('competitionWebDataToProfileSet mirrors canonical promo headline back to legacy promotion', () => {
  const profileSet = competitionWebDataToProfileSet({
    promo: {
      headline: 'Limited-time financing'
    }
  });

  assert.equal(profileSet.promotion, 'Limited-time financing');
});

test('competitionWebDataToProfileSet mirrors canonical state back to legacy state', () => {
  const profileSet = competitionWebDataToProfileSet({
    state: 'tx'
  });

  assert.equal(profileSet.state, 'TX');
});

test('competitionWebDataToProfileSet omits missing tax and fee values so they do not overwrite existing fields', () => {
  const profileSet = competitionWebDataToProfileSet({
    primaryContact: { name: 'Sales Rep' }
  });

  assert.equal('tax' in profileSet, false);
  assert.equal('mudFee' in profileSet, false);
  assert.equal('pidFee' in profileSet, false);
  assert.equal('pidFeeFrequency' in profileSet, false);
});
