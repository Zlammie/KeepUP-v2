const {
  normalizeHomeAddress,
  normalizeHomeGeo,
  normalizeHomeFacts,
  normalizeHomePricing
} = require('../services/brzInventoryNormalize');

const trimString = (value) => (value == null ? '' : String(value).trim());

const toNullableNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '').trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = trimString(value);
    if (text) return text;
  }
  return '';
};

const hasValue = (...values) => values.some((value) => trimString(value));

const readLotNumber = (lot, paths = []) => {
  for (const path of paths) {
    const parsed = toNullableNumber(lot?.[path]);
    if (parsed != null) return parsed;
  }
  return null;
};

const collectListingPhotoUrls = (lot) => {
  const values = [
    trimString(lot?.heroImage),
    ...(Array.isArray(lot?.listingPhotos) ? lot.listingPhotos.map((photo) => trimString(photo)) : []),
    trimString(lot?.liveElevationPhoto)
  ];
  return values.filter(Boolean);
};

function computeBrzReadiness({ community = null, lot = null, floorPlan = null } = {}) {
  const missing = [];
  const warnings = [];
  let hardMissingCount = 0;
  let softMissingCount = 0;
  let score = 100;

  const addHardMissing = (label) => {
    missing.push(label);
    hardMissingCount += 1;
    score -= 40;
  };

  const addSoftMissing = (labels) => {
    const values = Array.isArray(labels) ? labels : [labels];
    const normalized = values.map((label) => trimString(label)).filter(Boolean);
    if (!normalized.length) return;
    missing.push(...normalized);
    softMissingCount += 1;
    score -= 10;
  };

  const addWarning = (message, penalty = 0) => {
    const normalized = trimString(message);
    if (!normalized || warnings.includes(normalized)) return;
    warnings.push(normalized);
    score -= penalty;
  };

  const { address } = normalizeHomeAddress(lot, community, null);
  if (!trimString(address?.line1)) {
    addHardMissing('Address line 1');
  }

  const citySourceExists = hasValue(lot?.city, community?.city);
  const stateSourceExists = hasValue(lot?.state, community?.state);
  const zipSourceExists = hasValue(
    lot?.zip,
    lot?.postalCode,
    lot?.postal,
    community?.zip
  );

  if (citySourceExists && !trimString(address?.city)) {
    addHardMissing('City');
  }
  if (stateSourceExists && !trimString(address?.state)) {
    addHardMissing('State');
  }
  if (zipSourceExists && !trimString(address?.zip)) {
    addHardMissing('ZIP code');
  }

  if (!collectListingPhotoUrls(lot).length) {
    addHardMissing('Hero image');
  }

  const { warnings: geoWarnings } = normalizeHomeGeo(lot);
  if (geoWarnings.includes('MISSING_GEO')) {
    addSoftMissing('Map coordinates');
  }

  const {
    listPrice,
    salePrice,
    warnings: pricingWarnings
  } = normalizeHomePricing(lot);
  if (pricingWarnings.includes('MISSING_PRICE') || (listPrice == null && salePrice == null)) {
    addSoftMissing('Price');
  }

  const {
    beds,
    baths,
    sqft
  } = normalizeHomeFacts(lot, floorPlan);
  const missingSpecs = [];
  if (beds == null) missingSpecs.push('Beds');
  if (baths == null) missingSpecs.push('Baths');
  if (sqft == null) missingSpecs.push('Sqft');
  if (missingSpecs.length) {
    addSoftMissing(missingSpecs);
  }

  const lotBeds = readLotNumber(lot, ['beds', 'bedrooms']);
  const lotBaths = readLotNumber(lot, ['baths', 'bathrooms']);
  const lotSqft = readLotNumber(lot, ['sqft', 'squareFeet', 'sqFeet']);
  const planBeds = toNullableNumber(floorPlan?.specs?.beds);
  const planBaths = toNullableNumber(floorPlan?.specs?.baths);
  const planSqft = toNullableNumber(floorPlan?.specs?.squareFeet);

  const usedFloorPlanSpecs = (
    (lotBeds == null && planBeds != null && beds != null) ||
    (lotBaths == null && planBaths != null && baths != null) ||
    (lotSqft == null && planSqft != null && sqft != null)
  );
  if (usedFloorPlanSpecs) {
    addWarning('Using floor plan specs', 5);
  }

  const description = firstNonEmpty(
    lot?.listingDescription,
    lot?.description,
    community?.listingDescription,
    community?.description,
    community?.buildrootzDescription
  );
  if (!description) {
    addSoftMissing('Description');
  }

  score = Math.max(0, Math.min(100, score));

  let status = 'ready';
  if (hardMissingCount > 0) {
    status = 'incomplete';
  } else if (softMissingCount > 0) {
    status = 'warning';
  }

  return {
    status,
    score,
    missing,
    warnings
  };
}

module.exports = {
  computeBrzReadiness
};
