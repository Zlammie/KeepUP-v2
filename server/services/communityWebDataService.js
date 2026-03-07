const mongoose = require('mongoose');

const CONTACT_VISIBILITY_DEFAULT = Object.freeze({
  showName: true,
  showPhone: true,
  showEmail: false
});

const HOA_CADENCE_VALUES = new Set(['monthly', 'annual', 'unknown']);
const VISIBILITY_VALUES = new Set(['hidden', 'public', 'gated']);
const COMMISSION_UNIT_VALUES = new Set(['percent', 'flat', 'unknown']);
const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
  'WY'
]);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const trimString = (value) => (value == null ? '' : String(value).trim());
const normalizeState = (value) => {
  const text = trimString(value).toUpperCase();
  if (!text) return '';
  if (!/^[A-Z]{2}$/.test(text)) return '';
  return STATE_CODES.has(text) ? text : '';
};
const toNumberOrNull = (value) => {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const toObjectIdStringOrNull = (value) => {
  if (value == null || value === '') return null;
  const id = String(value).trim();
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const normalizeHoaCadence = (value, fallback = 'unknown') => {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return fallback;
  if (HOA_CADENCE_VALUES.has(normalized)) return normalized;
  if (['month', 'mo', 'monthly'].includes(normalized)) return 'monthly';
  if (['annual', 'annually', 'yearly', 'year', 'bi-annually', 'biannually'].includes(normalized)) return 'annual';
  return fallback;
};

const normalizeVisibility = (value, fallback = 'hidden') => {
  const normalized = trimString(value).toLowerCase();
  if (VISIBILITY_VALUES.has(normalized)) return normalized;
  return fallback;
};

const normalizeCommissionUnit = (value, fallback = 'unknown') => {
  const normalized = trimString(value).toLowerCase();
  if (COMMISSION_UNIT_VALUES.has(normalized)) return normalized;
  if (normalized === '%') return 'percent';
  return fallback;
};

const mapLegacyHoaFrequencyToCadence = (value) => {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return 'unknown';
  if (['monthly', 'month'].includes(normalized)) return 'monthly';
  if (['annually', 'annual', 'yearly', 'year', 'bi-annually', 'biannually'].includes(normalized)) return 'annual';
  return 'unknown';
};

const mapCadenceToLegacyHoaFrequency = (value) => {
  const cadence = normalizeHoaCadence(value);
  if (cadence === 'monthly') return 'Monthly';
  if (cadence === 'annual') return 'Annually';
  return '';
};

const toRoundedNumber = (value, digits = 6) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(digits));
};

const toAmenityLabel = (value) => {
  const compact = trimString(value).replace(/\s+/g, ' ');
  if (!compact) return '';
  const first = compact.charAt(0);
  if (first >= 'a' && first <= 'z') {
    return `${first.toUpperCase()}${compact.slice(1)}`;
  }
  return compact;
};

const normalizeCommunityAmenities = (input) => {
  if (!Array.isArray(input)) return [];

  const results = [];
  const seen = new Set();
  const pushLabel = (value) => {
    const label = toAmenityLabel(value);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ label });
  };

  input.forEach((entry) => {
    if (typeof entry === 'string') {
      pushLabel(entry);
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    if (typeof entry.label === 'string') {
      pushLabel(entry.label);
      return;
    }
    if (Array.isArray(entry.items)) {
      entry.items.forEach((item) => pushLabel(item));
    }
  });

  return results;
};

const normalizeProductTypes = (input) => {
  if (input == null) return [];

  const list = Array.isArray(input) ? input : [input];
  const results = [];
  const seen = new Set();
  const pushLabel = (value) => {
    const label = toAmenityLabel(value);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ label });
  };

  list.forEach((entry) => {
    if (typeof entry === 'string') {
      pushLabel(entry);
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    if (typeof entry.label === 'string') {
      pushLabel(entry.label);
    }
  });

  return results;
};

const normalizePromoString = (value) => {
  const normalized = trimString(value).replace(/\s+/g, ' ');
  return normalized || '';
};

const normalizePromo = (input) => {
  if (input == null) return null;
  if (typeof input === 'string') {
    const headline = normalizePromoString(input);
    return headline ? { headline } : null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const headline = normalizePromoString(input.headline);
  const description = normalizePromoString(input.description);
  const disclaimer = normalizePromoString(input.disclaimer);

  if (!headline && !description && !disclaimer) {
    return null;
  }
  const promo = {};
  if (headline) promo.headline = headline;
  if (description) promo.description = description;
  if (disclaimer) promo.disclaimer = disclaimer;
  return promo;
};

const promoToLegacyText = (promo) => {
  const normalized = normalizePromo(promo);
  return normalized?.headline || '';
};

const normalizeTaxRateInput = (value, { throwOnInvalid = false } = {}) => {
  if (value === undefined) return undefined;
  if (value == null || trimString(value) === '') return null;

  const rawText = typeof value === 'string' ? trimString(value) : '';
  const hasPercentSuffix = typeof value === 'string' && rawText.endsWith('%');
  const numericText = hasPercentSuffix ? rawText.slice(0, -1).trim() : rawText;
  const parsed = typeof value === 'number' ? value : Number(numericText);

  if (!Number.isFinite(parsed)) {
    if (throwOnInvalid) {
      const err = new Error('Tax Rate must be a valid number');
      err.status = 400;
      throw err;
    }
    return null;
  }

  if (parsed < 0) {
    if (throwOnInvalid) {
      const err = new Error('Tax Rate cannot be negative');
      err.status = 400;
      throw err;
    }
    return null;
  }

  const decimalValue = (hasPercentSuffix || parsed >= 1) ? (parsed / 100) : parsed;
  return toRoundedNumber(decimalValue, 6);
};

const normalizeMudTaxRateInput = (value) => {
  if (value === undefined) return undefined;
  if (value == null || trimString(value) === '') return null;

  const rawText = typeof value === 'string' ? trimString(value) : '';
  const hasPercentSuffix = typeof value === 'string' && rawText.endsWith('%');
  const numericText = hasPercentSuffix ? rawText.slice(0, -1).trim() : rawText;
  const parsed = typeof value === 'number' ? value : Number(numericText);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  const decimalValue = (hasPercentSuffix || parsed > 1) ? (parsed / 100) : parsed;
  return toRoundedNumber(decimalValue, 6);
};

const normalizePidFeeFrequency = (value, fallback = null) => {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'monthly' || normalized === 'month') return 'Monthly';
  if (normalized === 'yearly' || normalized === 'year' || normalized === 'annual' || normalized === 'annually') {
    return 'Yearly';
  }
  return fallback;
};

const readOptionalNumberField = (source, key) => (
  hasOwn(source, key) ? toNumberOrNull(source[key]) : undefined
);

const readOptionalNullableStringField = (source, key, normalizer = trimString) => {
  if (!hasOwn(source, key)) return undefined;
  const value = normalizer(source[key]);
  return value == null || value === '' ? null : value;
};

const normalizeCompetitionWebData = (raw, { totalLotsFallback = null } = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};

  const primaryContactSource = source.primaryContact && typeof source.primaryContact === 'object'
    ? source.primaryContact
    : {};
  const visibilitySource = source.contactVisibility && typeof source.contactVisibility === 'object'
    ? source.contactVisibility
    : {};
  const schoolsSource = source.schools && typeof source.schools === 'object'
    ? source.schools
    : {};
  const locationSource = source.location && typeof source.location === 'object'
    ? source.location
    : {};
  const hoaSource = source.hoa && typeof source.hoa === 'object'
    ? source.hoa
    : {};
  const earnestSource = source.earnestMoney && typeof source.earnestMoney === 'object'
    ? source.earnestMoney
    : {};
  const commissionSource = source.realtorCommission && typeof source.realtorCommission === 'object'
    ? source.realtorCommission
    : {};

  const totalLotsValue = hasOwn(source, 'totalLots') ? source.totalLots : totalLotsFallback;
  const normalized = {
    primaryContact: {
      name: trimString(primaryContactSource.name),
      phone: trimString(primaryContactSource.phone),
      email: trimString(primaryContactSource.email)
    },
    contactVisibility: {
      showName: toBoolean(visibilitySource.showName, CONTACT_VISIBILITY_DEFAULT.showName),
      showPhone: toBoolean(visibilitySource.showPhone, CONTACT_VISIBILITY_DEFAULT.showPhone),
      showEmail: toBoolean(visibilitySource.showEmail, CONTACT_VISIBILITY_DEFAULT.showEmail)
    },
    modelListingId: toObjectIdStringOrNull(source.modelListingId),
    modelFloorPlanId: toObjectIdStringOrNull(source.modelFloorPlanId),
    totalLots: toNumberOrNull(totalLotsValue),
    city: trimString(source.city || locationSource.city),
    state: normalizeState(source.state || locationSource.state),
    postalCode: trimString(
      source.postalCode
      || source.zip
      || locationSource.postalCode
      || locationSource.zip
    ),
    schools: {
      elementary: trimString(schoolsSource.elementary),
      middle: trimString(schoolsSource.middle),
      high: trimString(schoolsSource.high)
    },
    hoa: {
      amount: toNumberOrNull(hoaSource.amount),
      cadence: normalizeHoaCadence(hoaSource.cadence, 'unknown')
    },
    hasPID: toBoolean(source.hasPID, false),
    hasMUD: toBoolean(source.hasMUD, false),
    earnestMoney: {
      amount: toNumberOrNull(earnestSource.amount),
      visibility: normalizeVisibility(earnestSource.visibility, 'hidden')
    },
    realtorCommission: {
      amount: toNumberOrNull(commissionSource.amount),
      unit: normalizeCommissionUnit(commissionSource.unit, 'unknown'),
      visibility: normalizeVisibility(commissionSource.visibility, 'hidden')
    },
    notesInternal: trimString(source.notesInternal)
  };

  const taxRate = hasOwn(source, 'taxRate')
    ? normalizeTaxRateInput(source.taxRate)
    : undefined;
  if (taxRate !== undefined) normalized.taxRate = taxRate;

  const mudTaxRate = hasOwn(source, 'mudTaxRate')
    ? normalizeMudTaxRateInput(source.mudTaxRate)
    : undefined;
  if (mudTaxRate !== undefined) normalized.mudTaxRate = mudTaxRate;

  const mudFeeAmount = readOptionalNumberField(source, 'mudFeeAmount');
  if (mudFeeAmount !== undefined) normalized.mudFeeAmount = mudFeeAmount;

  const pidFeeAmount = readOptionalNumberField(source, 'pidFeeAmount');
  if (pidFeeAmount !== undefined) normalized.pidFeeAmount = pidFeeAmount;

  const pidFeeFrequency = readOptionalNullableStringField(
    source,
    'pidFeeFrequency',
    (value) => normalizePidFeeFrequency(value, null)
  );
  if (pidFeeFrequency !== undefined) normalized.pidFeeFrequency = pidFeeFrequency;

  const amenities = hasOwn(source, 'amenities')
    ? normalizeCommunityAmenities(source.amenities)
    : undefined;
  if (amenities !== undefined) normalized.amenities = amenities;

  const promo = hasOwn(source, 'promo')
    ? normalizePromo(source.promo)
    : undefined;
  if (promo !== undefined) normalized.promo = promo;

  const productTypes = hasOwn(source, 'productTypes')
    ? normalizeProductTypes(source.productTypes)
    : undefined;
  if (productTypes !== undefined) normalized.productTypes = productTypes;

  return normalized;
};

const hasMeaningfulCanonicalWebData = (raw) => {
  if (!raw || typeof raw !== 'object') return false;
  const normalized = normalizeCompetitionWebData(raw, { totalLotsFallback: null });

  if (trimString(normalized.primaryContact.name)) return true;
  if (trimString(normalized.primaryContact.phone)) return true;
  if (trimString(normalized.primaryContact.email)) return true;

  if (normalized.modelListingId) return true;
  if (normalized.modelFloorPlanId) return true;
  if (normalized.totalLots != null) return true;
  if (trimString(normalized.city)) return true;
  if (trimString(normalized.state)) return true;
  if (trimString(normalized.postalCode)) return true;

  if (trimString(normalized.schools.elementary)) return true;
  if (trimString(normalized.schools.middle)) return true;
  if (trimString(normalized.schools.high)) return true;

  if (normalized.hoa.amount != null) return true;
  if (normalized.hoa.cadence !== 'unknown') return true;
  if (normalized.taxRate != null) return true;
  if (normalized.mudTaxRate != null) return true;
  if (normalized.hasPID) return true;
  if (normalized.hasMUD) return true;
  if (normalized.mudFeeAmount != null) return true;
  if (normalized.pidFeeAmount != null) return true;
  if (trimString(normalized.pidFeeFrequency)) return true;
  if (Array.isArray(normalized.amenities) && normalized.amenities.length) return true;
  if (normalized.promo && typeof normalized.promo === 'object') return true;
  if (Array.isArray(normalized.productTypes) && normalized.productTypes.length) return true;

  if (normalized.earnestMoney.amount != null) return true;
  if (normalized.earnestMoney.visibility !== 'hidden') return true;

  if (normalized.realtorCommission.amount != null) return true;
  if (normalized.realtorCommission.unit !== 'unknown') return true;
  if (normalized.realtorCommission.visibility !== 'hidden') return true;

  if (trimString(normalized.notesInternal)) return true;

  const contactVisibilityRaw =
    raw.contactVisibility && typeof raw.contactVisibility === 'object' ? raw.contactVisibility : null;
  if (contactVisibilityRaw) {
    const showName = hasOwn(contactVisibilityRaw, 'showName')
      ? toBoolean(contactVisibilityRaw.showName, CONTACT_VISIBILITY_DEFAULT.showName)
      : CONTACT_VISIBILITY_DEFAULT.showName;
    const showPhone = hasOwn(contactVisibilityRaw, 'showPhone')
      ? toBoolean(contactVisibilityRaw.showPhone, CONTACT_VISIBILITY_DEFAULT.showPhone)
      : CONTACT_VISIBILITY_DEFAULT.showPhone;
    const showEmail = hasOwn(contactVisibilityRaw, 'showEmail')
      ? toBoolean(contactVisibilityRaw.showEmail, CONTACT_VISIBILITY_DEFAULT.showEmail)
      : CONTACT_VISIBILITY_DEFAULT.showEmail;
    if (
      showName !== CONTACT_VISIBILITY_DEFAULT.showName
      || showPhone !== CONTACT_VISIBILITY_DEFAULT.showPhone
      || showEmail !== CONTACT_VISIBILITY_DEFAULT.showEmail
    ) {
      return true;
    }
  }

  return false;
};

function competitionProfileToWebData(profile, community = null) {
  const feeTypes = Array.isArray(profile?.feeTypes) ? profile.feeTypes : [];
  const hasLegacyPID = feeTypes.includes('PID') || profile?.pidFee != null;
  const hasLegacyMUD = feeTypes.includes('MUD') || profile?.mudFee != null;
  const legacyAmenities = normalizeCommunityAmenities(profile?.communityAmenities);
  const defaultTotalLots = Number.isFinite(Number(community?.totalLots))
    ? Number(community.totalLots)
    : (Array.isArray(community?.lots) ? community.lots.length : null);

  const legacyFallback = {
    primaryContact: {
      name: profile?.salesPerson || '',
      phone: profile?.salesPersonPhone || '',
      email: profile?.salesPersonEmail || ''
    },
    contactVisibility: { ...CONTACT_VISIBILITY_DEFAULT },
    modelListingId: null,
    modelFloorPlanId: null,
    totalLots: defaultTotalLots,
    city: profile?.city || community?.city || '',
    state: normalizeState(profile?.state || community?.state || ''),
    postalCode: profile?.zip || '',
    schools: {
      elementary: profile?.elementarySchool || '',
      middle: profile?.middleSchool || '',
      high: profile?.highSchool || ''
    },
    hoa: {
      amount: profile?.hoaFee ?? null,
      cadence: mapLegacyHoaFrequencyToCadence(profile?.hoaFrequency)
    },
    hasPID: hasLegacyPID,
    hasMUD: hasLegacyMUD,
    earnestMoney: {
      amount: profile?.earnestAmount ?? null,
      visibility: 'hidden'
    },
    realtorCommission: {
      amount: profile?.realtorCommission ?? null,
      unit: profile?.realtorCommission != null ? 'percent' : 'unknown',
      visibility: 'hidden'
    },
    notesInternal: profile?.notesInternal || ''
  };
  if (profile?.tax != null) {
    legacyFallback.taxRate = normalizeTaxRateInput(profile.tax);
  }
  if (profile?.mudFee != null) {
    legacyFallback.mudFeeAmount = toNumberOrNull(profile.mudFee);
  }
  if (profile?.pidFee != null) {
    legacyFallback.pidFeeAmount = toNumberOrNull(profile.pidFee);
  }
  if (trimString(profile?.pidFeeFrequency)) {
    legacyFallback.pidFeeFrequency = normalizePidFeeFrequency(profile.pidFeeFrequency, null);
  }
  if (legacyAmenities.length) {
    legacyFallback.amenities = legacyAmenities;
  }
  const legacyProductTypes = normalizeProductTypes(profile?.lotSize);
  if (legacyProductTypes.length) {
    legacyFallback.productTypes = legacyProductTypes;
  }
  const legacyPromo = normalizePromo(profile?.promotion);
  if (legacyPromo) {
    legacyFallback.promo = legacyPromo;
  }

  const rawCanonical = profile?.webData && typeof profile.webData === 'object' ? profile.webData : null;
  if (!hasMeaningfulCanonicalWebData(rawCanonical)) {
    return normalizeCompetitionWebData(legacyFallback, { totalLotsFallback: legacyFallback.totalLots });
  }
  const merged = mergeCompetitionWebData(legacyFallback, rawCanonical);
  const canonicalAmenities = rawCanonical && hasOwn(rawCanonical, 'amenities')
    ? normalizeCommunityAmenities(rawCanonical.amenities)
    : undefined;
  const canonicalProductTypes = rawCanonical && hasOwn(rawCanonical, 'productTypes')
    ? normalizeProductTypes(rawCanonical.productTypes)
    : undefined;
  const needsLegacyStateFallback =
    !trimString(merged.state) && trimString(legacyFallback.state);
  if (
    needsLegacyStateFallback
    || (
    ((!canonicalAmenities || !canonicalAmenities.length) && legacyAmenities.length)
    || ((!canonicalProductTypes || !canonicalProductTypes.length) && legacyProductTypes.length)
    )
  ) {
    return normalizeCompetitionWebData({
      ...merged,
      ...(needsLegacyStateFallback ? { state: legacyFallback.state } : {}),
      ...((!canonicalAmenities || !canonicalAmenities.length) && legacyAmenities.length
        ? { amenities: legacyAmenities }
        : {}),
      ...((!canonicalProductTypes || !canonicalProductTypes.length) && legacyProductTypes.length
        ? { productTypes: legacyProductTypes }
        : {})
    });
  }
  return merged;
}

function mergeCompetitionWebData(existingWebData, patch) {
  const base = normalizeCompetitionWebData(existingWebData || {});
  const incoming = patch && typeof patch === 'object' ? patch : {};

  const merged = {
    ...base,
    primaryContact: { ...base.primaryContact },
    contactVisibility: { ...base.contactVisibility },
    schools: { ...base.schools },
    hoa: { ...base.hoa },
    earnestMoney: { ...base.earnestMoney },
    realtorCommission: { ...base.realtorCommission }
  };

  if (hasOwn(incoming, 'primaryContact') && incoming.primaryContact && typeof incoming.primaryContact === 'object') {
    merged.primaryContact = { ...merged.primaryContact, ...incoming.primaryContact };
  }
  if (hasOwn(incoming, 'contactVisibility') && incoming.contactVisibility && typeof incoming.contactVisibility === 'object') {
    merged.contactVisibility = { ...merged.contactVisibility, ...incoming.contactVisibility };
  }
  if (hasOwn(incoming, 'modelListingId')) {
    merged.modelListingId = incoming.modelListingId;
  }
  if (hasOwn(incoming, 'modelFloorPlanId')) {
    merged.modelFloorPlanId = incoming.modelFloorPlanId;
  }
  if (hasOwn(incoming, 'totalLots')) {
    merged.totalLots = incoming.totalLots;
  }
  if (hasOwn(incoming, 'city')) {
    merged.city = incoming.city;
  }
  if (hasOwn(incoming, 'state')) {
    merged.state = incoming.state;
  }
  if (hasOwn(incoming, 'postalCode')) {
    merged.postalCode = incoming.postalCode;
  }
  if (hasOwn(incoming, 'schools') && incoming.schools && typeof incoming.schools === 'object') {
    merged.schools = { ...merged.schools, ...incoming.schools };
  }
  if (hasOwn(incoming, 'hoa') && incoming.hoa && typeof incoming.hoa === 'object') {
    merged.hoa = { ...merged.hoa, ...incoming.hoa };
  }
  if (hasOwn(incoming, 'taxRate')) {
    merged.taxRate = incoming.taxRate;
  }
  if (hasOwn(incoming, 'mudTaxRate')) {
    merged.mudTaxRate = incoming.mudTaxRate;
  }
  if (hasOwn(incoming, 'hasPID')) {
    merged.hasPID = incoming.hasPID;
  }
  if (hasOwn(incoming, 'hasMUD')) {
    merged.hasMUD = incoming.hasMUD;
  }
  if (hasOwn(incoming, 'mudFeeAmount')) {
    merged.mudFeeAmount = incoming.mudFeeAmount;
  }
  if (hasOwn(incoming, 'pidFeeAmount')) {
    merged.pidFeeAmount = incoming.pidFeeAmount;
  }
  if (hasOwn(incoming, 'pidFeeFrequency')) {
    merged.pidFeeFrequency = incoming.pidFeeFrequency;
  }
  if (hasOwn(incoming, 'amenities')) {
    merged.amenities = incoming.amenities;
  }
  if (hasOwn(incoming, 'promo')) {
    merged.promo = incoming.promo;
  }
  if (hasOwn(incoming, 'productTypes')) {
    merged.productTypes = incoming.productTypes;
  }
  if (hasOwn(incoming, 'earnestMoney') && incoming.earnestMoney && typeof incoming.earnestMoney === 'object') {
    merged.earnestMoney = { ...merged.earnestMoney, ...incoming.earnestMoney };
  }
  if (hasOwn(incoming, 'realtorCommission') && incoming.realtorCommission && typeof incoming.realtorCommission === 'object') {
    merged.realtorCommission = { ...merged.realtorCommission, ...incoming.realtorCommission };
  }
  if (hasOwn(incoming, 'notesInternal')) {
    merged.notesInternal = incoming.notesInternal;
  }

  return normalizeCompetitionWebData(merged);
}

function competitionWebDataToProfileSet(webData) {
  const normalized = normalizeCompetitionWebData(webData || {});
  const feeTypes = [];
  if (normalized.hasMUD) feeTypes.push('MUD');
  if (normalized.hasPID) feeTypes.push('PID');
  if (!feeTypes.length) feeTypes.push('None');

  return {
    webData: {
      ...normalized,
      modelListingId: normalized.modelListingId ? new mongoose.Types.ObjectId(normalized.modelListingId) : null,
      modelFloorPlanId: normalized.modelFloorPlanId ? new mongoose.Types.ObjectId(normalized.modelFloorPlanId) : null
    },
    salesPerson: normalized.primaryContact.name,
    salesPersonPhone: normalized.primaryContact.phone,
    salesPersonEmail: normalized.primaryContact.email,
    city: normalized.city,
    state: normalized.state,
    zip: normalized.postalCode,
    elementarySchool: normalized.schools.elementary,
    middleSchool: normalized.schools.middle,
    highSchool: normalized.schools.high,
    hoaFee: normalized.hoa.amount,
    hoaFrequency: mapCadenceToLegacyHoaFrequency(normalized.hoa.cadence),
    ...(hasOwn(normalized, 'taxRate')
      ? { tax: normalized.taxRate == null ? null : toRoundedNumber(normalized.taxRate * 100, 3) }
      : {}),
    feeTypes,
    ...(hasOwn(normalized, 'mudFeeAmount') ? { mudFee: normalized.mudFeeAmount } : {}),
    ...(hasOwn(normalized, 'pidFeeAmount') ? { pidFee: normalized.pidFeeAmount } : {}),
    ...(hasOwn(normalized, 'pidFeeFrequency')
      ? { pidFeeFrequency: normalized.pidFeeFrequency || '' }
      : {}),
    ...(hasOwn(normalized, 'promo')
      ? { promotion: promoToLegacyText(normalized.promo) }
      : {}),
    ...(hasOwn(normalized, 'productTypes')
      ? { lotSize: Array.isArray(normalized.productTypes) ? normalized.productTypes.map((item) => item?.label).filter(Boolean).join(', ') : '' }
      : {}),
    earnestAmount: normalized.earnestMoney.amount,
    realtorCommission: normalized.realtorCommission.amount
  };
}

function computeCommunityCompleteness({ webData, communityDraft, modelListings = [] }) {
  const resolved = normalizeCompetitionWebData(webData || {});
  const isIncluded = communityDraft ? Boolean(communityDraft.isIncluded) : true;
  const hasModelListings = Array.isArray(modelListings) && modelListings.length > 0;
  const flags = {
    missingContactName: Boolean(resolved.contactVisibility.showName) && !trimString(resolved.primaryContact.name),
    missingPhone: Boolean(resolved.contactVisibility.showPhone) && !trimString(resolved.primaryContact.phone),
    missingHeroImage: isIncluded && !trimString(communityDraft?.heroImage?.url),
    missingSchools: !trimString(resolved.schools.elementary) || !trimString(resolved.schools.middle) || !trimString(resolved.schools.high),
    missingHOA: resolved.hoa.amount == null,
    missingModelListing: !hasModelListings
  };

  const checks = Object.values(flags);
  const missingCount = checks.filter(Boolean).length;
  const score = checks.length ? Math.max(0, Math.round(((checks.length - missingCount) / checks.length) * 100)) : 100;

  return {
    score,
    flags,
    missingRequired: Boolean(flags.missingContactName || flags.missingPhone)
  };
}

module.exports = {
  CONTACT_VISIBILITY_DEFAULT,
  mapCadenceToLegacyHoaFrequency,
  competitionProfileToWebData,
  mergeCompetitionWebData,
  competitionWebDataToProfileSet,
  computeCommunityCompleteness,
  normalizeCommunityAmenities,
  normalizeCompetitionWebData,
  normalizePromo,
  normalizeProductTypes,
  normalizeState,
  normalizeTaxRateInput
};
