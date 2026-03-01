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

const readNumberFromPaths = (obj, paths = []) => {
  for (const path of paths) {
    const value = toNullableNumber(obj?.[path]);
    if (value != null) return value;
  }
  return null;
};

const normalizeHomeAddress = (lot, community, company) => {
  void company;
  const warnings = [];

  const assembledLine1 = firstNonEmpty(
    [
      trimString(lot?.streetNumber || lot?.addressNumber || lot?.houseNumber),
      trimString(lot?.streetName || lot?.roadName)
    ]
      .filter(Boolean)
      .join(' ')
  );

  const line1 = firstNonEmpty(
    lot?.address,
    lot?.street,
    lot?.streetAddress,
    lot?.address1,
    lot?.addressLine1,
    lot?.line1,
    lot?.propertyAddress,
    assembledLine1
  );
  const line2 = firstNonEmpty(
    lot?.address2,
    lot?.addressLine2,
    lot?.line2,
    lot?.unit,
    lot?.suite,
    lot?.apt
  );
  const city = firstNonEmpty(lot?.city, community?.city);
  const state = firstNonEmpty(lot?.state, community?.state);
  const zip = firstNonEmpty(lot?.zip, lot?.postalCode, lot?.postal, community?.zip);

  if (!line1) {
    warnings.push('MISSING_ADDRESS_LINE1');
  }

  const address = {
    line1,
    city,
    state
  };
  // Keep legacy key for compatibility with downstream handlers that still read `street`.
  if (line1) address.street = line1;
  if (line2) address.line2 = line2;
  if (zip) address.zip = zip;

  const cityStateZip = [
    city,
    [state, zip].filter(Boolean).join(' ').trim()
  ]
    .filter(Boolean)
    .join(', ');
  const displayAddress = [line1, cityStateZip].filter(Boolean).join(', ');

  return { address, displayAddress, warnings };
};

const normalizeHomeGeo = (lot) => {
  const warnings = [];
  const lat = toNullableNumber(lot?.latitude ?? lot?.lat);
  const lng = toNullableNumber(lot?.longitude ?? lot?.lng);
  const latValid = lat != null && lat >= -90 && lat <= 90;
  const lngValid = lng != null && lng >= -180 && lng <= 180;

  if (!latValid || !lngValid) {
    warnings.push('MISSING_GEO');
    return { geo: null, warnings };
  }

  return {
    geo: { lat, lng },
    warnings
  };
};

const normalizeHomeFacts = (lot, floorPlan) => {
  const warnings = [];
  const floorPlanSpecs = floorPlan?.specs || {};

  const beds = readNumberFromPaths(lot, ['beds', 'bedrooms']) ?? toNullableNumber(floorPlanSpecs?.beds);
  const baths = readNumberFromPaths(lot, ['baths', 'bathrooms']) ?? toNullableNumber(floorPlanSpecs?.baths);
  const sqft = readNumberFromPaths(lot, ['sqft', 'squareFeet', 'sqFeet']) ?? toNullableNumber(floorPlanSpecs?.squareFeet);
  const garage = readNumberFromPaths(lot, ['garage', 'garageSpaces']) ?? toNullableNumber(floorPlanSpecs?.garage);
  const stories = readNumberFromPaths(lot, ['stories']) ?? toNullableNumber(floorPlanSpecs?.stories);

  if (beds == null && baths == null && sqft == null) {
    warnings.push('MISSING_SPECS');
  }

  return {
    beds,
    baths,
    sqft,
    garage,
    stories,
    warnings
  };
};

const normalizeHomePricing = (lot) => {
  const warnings = [];
  const listPrice = toNullableNumber(lot?.listPrice ?? lot?.price);
  const salePrice = toNullableNumber(lot?.salesPrice ?? lot?.salePrice);

  let price = null;
  if (listPrice != null || salePrice != null) {
    price = {};
    if (listPrice != null) price.list = listPrice;
    if (salePrice != null) price.sale = salePrice;
  } else {
    warnings.push('MISSING_PRICE');
  }

  return {
    listPrice,
    salePrice,
    price,
    warnings
  };
};

module.exports = {
  normalizeHomeAddress,
  normalizeHomeGeo,
  normalizeHomeFacts,
  normalizeHomePricing
};
