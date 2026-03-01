const mongoose = require('mongoose');

const CONTACT_VISIBILITY_DEFAULT = Object.freeze({
  showName: true,
  showPhone: true,
  showEmail: false
});

const HOA_CADENCE_VALUES = new Set(['monthly', 'annual', 'unknown']);
const VISIBILITY_VALUES = new Set(['hidden', 'public', 'gated']);
const COMMISSION_UNIT_VALUES = new Set(['percent', 'flat', 'unknown']);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const trimString = (value) => (value == null ? '' : String(value).trim());
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

  return {
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

  if (trimString(normalized.schools.elementary)) return true;
  if (trimString(normalized.schools.middle)) return true;
  if (trimString(normalized.schools.high)) return true;

  if (normalized.hoa.amount != null) return true;
  if (normalized.hoa.cadence !== 'unknown') return true;
  if (normalized.hasPID) return true;
  if (normalized.hasMUD) return true;

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

  const rawCanonical = profile?.webData && typeof profile.webData === 'object' ? profile.webData : null;
  if (!hasMeaningfulCanonicalWebData(rawCanonical)) {
    return normalizeCompetitionWebData(legacyFallback, { totalLotsFallback: legacyFallback.totalLots });
  }

  return mergeCompetitionWebData(legacyFallback, rawCanonical);
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
  if (hasOwn(incoming, 'schools') && incoming.schools && typeof incoming.schools === 'object') {
    merged.schools = { ...merged.schools, ...incoming.schools };
  }
  if (hasOwn(incoming, 'hoa') && incoming.hoa && typeof incoming.hoa === 'object') {
    merged.hoa = { ...merged.hoa, ...incoming.hoa };
  }
  if (hasOwn(incoming, 'hasPID')) {
    merged.hasPID = incoming.hasPID;
  }
  if (hasOwn(incoming, 'hasMUD')) {
    merged.hasMUD = incoming.hasMUD;
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
    elementarySchool: normalized.schools.elementary,
    middleSchool: normalized.schools.middle,
    highSchool: normalized.schools.high,
    hoaFee: normalized.hoa.amount,
    hoaFrequency: mapCadenceToLegacyHoaFrequency(normalized.hoa.cadence),
    feeTypes,
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
  normalizeCompetitionWebData
};
