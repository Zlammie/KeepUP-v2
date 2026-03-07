const trimString = (value) => (value == null ? '' : String(value).trim());

const collapseWhitespace = (value) => trimString(value).replace(/\s+/g, ' ');

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = collapseWhitespace(value);
    if (text) return text;
  }
  return '';
};

const STATE_CODE_BY_NAME = new Map([
  ['alabama', 'AL'],
  ['alaska', 'AK'],
  ['arizona', 'AZ'],
  ['arkansas', 'AR'],
  ['california', 'CA'],
  ['colorado', 'CO'],
  ['connecticut', 'CT'],
  ['delaware', 'DE'],
  ['district of columbia', 'DC'],
  ['florida', 'FL'],
  ['georgia', 'GA'],
  ['hawaii', 'HI'],
  ['idaho', 'ID'],
  ['illinois', 'IL'],
  ['indiana', 'IN'],
  ['iowa', 'IA'],
  ['kansas', 'KS'],
  ['kentucky', 'KY'],
  ['louisiana', 'LA'],
  ['maine', 'ME'],
  ['maryland', 'MD'],
  ['massachusetts', 'MA'],
  ['michigan', 'MI'],
  ['minnesota', 'MN'],
  ['mississippi', 'MS'],
  ['missouri', 'MO'],
  ['montana', 'MT'],
  ['nebraska', 'NE'],
  ['nevada', 'NV'],
  ['new hampshire', 'NH'],
  ['new jersey', 'NJ'],
  ['new mexico', 'NM'],
  ['new york', 'NY'],
  ['north carolina', 'NC'],
  ['north dakota', 'ND'],
  ['ohio', 'OH'],
  ['oklahoma', 'OK'],
  ['oregon', 'OR'],
  ['pennsylvania', 'PA'],
  ['rhode island', 'RI'],
  ['south carolina', 'SC'],
  ['south dakota', 'SD'],
  ['tennessee', 'TN'],
  ['texas', 'TX'],
  ['utah', 'UT'],
  ['vermont', 'VT'],
  ['virginia', 'VA'],
  ['washington', 'WA'],
  ['west virginia', 'WV'],
  ['wisconsin', 'WI'],
  ['wyoming', 'WY']
]);

const normalizeState = (value) => {
  const text = collapseWhitespace(value);
  if (!text) return '';
  if (/^[a-z]{2}$/i.test(text)) return text.toUpperCase();
  const key = text.toLowerCase().replace(/\./g, '');
  return STATE_CODE_BY_NAME.get(key) || text.toUpperCase();
};

const normalizePostalCode = (value) => {
  const text = collapseWhitespace(value);
  if (!text) return '';
  const direct = text.match(/^(\d{5})(?:[-\s]?(\d{4}))?$/);
  if (direct) {
    return direct[2] ? `${direct[1]}-${direct[2]}` : direct[1];
  }
  const extracted = text.match(/(\d{5})(?:[-\s]?(\d{4}))?/);
  if (!extracted) return '';
  return extracted[2] ? `${extracted[1]}-${extracted[2]}` : extracted[1];
};

const toZip5 = (value) => {
  const normalized = normalizePostalCode(value);
  if (!normalized) return '';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 5) return '';
  return digits.slice(0, 5);
};

const deriveStateFromPostalCode = (value) => {
  const zip5 = toZip5(value);
  if (!zip5) return '';
  const zipNum = Number(zip5);
  if (!Number.isFinite(zipNum)) return '';

  // Texas-focused lookup (required baseline); avoids broad fuzzy mappings.
  if (zipNum === 73301 || zipNum === 88510) return 'TX';
  if (zipNum >= 75000 && zipNum <= 79999) return 'TX';

  return '';
};

const normalizeCity = (value) => collapseWhitespace(value);

const normalizeAddress1 = (value) => collapseWhitespace(value);

const normalizeFormattedAddress = (value) => collapseWhitespace(value);

const formatCityStatePostal = ({ city, state, postalCode } = {}) => {
  const normalizedCity = normalizeCity(city);
  const normalizedState = normalizeState(state);
  const normalizedPostal = normalizePostalCode(postalCode);
  const statePostal = [normalizedState, normalizedPostal].filter(Boolean).join(' ').trim();
  return [normalizedCity, statePostal].filter(Boolean).join(', ');
};

const buildFormattedAddress = ({ address1, city, state, postalCode } = {}) => {
  const normalizedAddress1 = normalizeAddress1(address1);
  const cityStatePostal = formatCityStatePostal({ city, state, postalCode });
  const result = [normalizedAddress1, cityStatePostal].filter(Boolean).join(', ');
  return result || '';
};

const parseTailStatePostal = (value) => {
  const tail = collapseWhitespace(value);
  if (!tail) return null;
  const match = tail.match(/^([A-Za-z]{2}|[A-Za-z][A-Za-z .'-]+?)\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) return null;
  return {
    state: normalizeState(match[1]),
    postalCode: normalizePostalCode(match[2])
  };
};

const parseFormattedAddress = (value) => {
  const text = normalizeFormattedAddress(value);
  if (!text) return null;

  const strictMatch = text.match(
    /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2}|[A-Za-z][A-Za-z .'-]+?)\s+(\d{5}(?:-\d{4})?)$/
  );
  if (strictMatch) {
    return {
      address1: normalizeAddress1(strictMatch[1]),
      city: normalizeCity(strictMatch[2]),
      state: normalizeState(strictMatch[3]),
      postalCode: normalizePostalCode(strictMatch[4]),
      formattedAddress: text
    };
  }

  const parts = text.split(',').map((part) => collapseWhitespace(part)).filter(Boolean);
  if (parts.length < 3) return null;
  const address1 = normalizeAddress1(parts[0]);
  const city = normalizeCity(parts.slice(1, -1).join(', '));
  const tail = parseTailStatePostal(parts[parts.length - 1]);
  if (!tail) return null;
  return {
    address1,
    city,
    state: tail.state,
    postalCode: tail.postalCode,
    formattedAddress: text
  };
};

const getByPath = (obj, path) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = String(path || '').split('.');
  let current = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
};

const extractFromAddressComponentArray = (components) => {
  if (!Array.isArray(components) || !components.length) return null;
  const readType = (type) => {
    const component = components.find((entry) =>
      Array.isArray(entry?.types) && entry.types.includes(type));
    if (!component) return '';
    return collapseWhitespace(component.short_name || component.long_name || '');
  };

  const streetNumber = readType('street_number');
  const route = readType('route');
  const city = firstNonEmpty(readType('locality'), readType('postal_town'));
  const state = readType('administrative_area_level_1');
  const postalCode = firstNonEmpty(readType('postal_code'), readType('postal_code_suffix'));

  const address1 = [streetNumber, route].filter(Boolean).join(' ').trim();
  const result = {
    address1: normalizeAddress1(address1),
    city: normalizeCity(city),
    state: normalizeState(state),
    postalCode: normalizePostalCode(postalCode)
  };
  if (!result.address1 && !result.city && !result.state && !result.postalCode) return null;
  return result;
};

const extractFromStructuredObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const components =
    extractFromAddressComponentArray(obj.address_components)
    || extractFromAddressComponentArray(obj.components);
  if (components) return components;

  const streetNumber = firstNonEmpty(
    obj.streetNumber,
    obj.street_number,
    obj.houseNumber,
    obj.house_number
  );
  const route = firstNonEmpty(
    obj.route,
    obj.streetName,
    obj.street_name,
    obj.roadName,
    obj.road_name
  );
  const mergedStreet = [streetNumber, route].filter(Boolean).join(' ').trim();

  const result = {
    address1: normalizeAddress1(firstNonEmpty(
      obj.address1,
      obj.line1,
      obj.street,
      obj.streetAddress,
      mergedStreet
    )),
    city: normalizeCity(firstNonEmpty(
      obj.city,
      obj.locality,
      obj.town
    )),
    state: normalizeState(firstNonEmpty(
      obj.state,
      obj.stateCode,
      obj.province,
      obj.region,
      obj.administrativeAreaLevel1
    )),
    postalCode: normalizePostalCode(firstNonEmpty(
      obj.postalCode,
      obj.postal,
      obj.zip,
      obj.zipCode
    ))
  };

  if (!result.address1 && !result.city && !result.state && !result.postalCode) return null;
  return result;
};

const collectStructuredCandidates = (listing) => {
  const candidates = [];
  const possiblePaths = [
    'addressObject',
    'addressComponents',
    'location',
    'geo',
    'geocode',
    'geocoding',
    'addressData',
    'address'
  ];
  possiblePaths.forEach((path) => {
    const value = getByPath(listing, path);
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      candidates.push({ address_components: value });
      return;
    }
    candidates.push(value);
  });
  return candidates;
};

const pickFormattedAddressCandidates = (listing) => {
  const values = [
    listing?.formattedAddress,
    listing?.fullAddress,
    listing?.addressFormatted,
    listing?.address
  ];
  return values
    .map((value) => normalizeFormattedAddress(value))
    .filter(Boolean);
};

const normalizeListingLocation = (listing = {}, { community = null } = {}) => {
  const rawAddress = firstNonEmpty(listing?.address);
  const initialAddress1 = normalizeAddress1(firstNonEmpty(
    listing?.address1,
    listing?.street,
    listing?.streetAddress,
    listing?.addressLine1,
    listing?.line1,
    listing?.propertyAddress
  ));
  const initialCity = normalizeCity(firstNonEmpty(listing?.city));
  const initialState = normalizeState(firstNonEmpty(listing?.state));
  const initialPostal = normalizePostalCode(firstNonEmpty(
    listing?.postalCode,
    listing?.zip,
    listing?.postal
  ));
  const initialFormatted = normalizeFormattedAddress(firstNonEmpty(
    listing?.formattedAddress,
    listing?.fullAddress,
    listing?.addressFormatted
  ));

  const location = {
    address1: initialAddress1 || '',
    city: initialCity || '',
    state: initialState || '',
    postalCode: initialPostal || '',
    formattedAddress: initialFormatted || ''
  };

  const sourceFlags = new Set();
  if (location.city || location.state || location.postalCode) {
    sourceFlags.add('split');
  }

  const applyMissing = (candidate, source) => {
    if (!candidate || typeof candidate !== 'object') return false;
    let changed = false;
    if (!location.address1 && candidate.address1) {
      location.address1 = normalizeAddress1(candidate.address1);
      changed = Boolean(location.address1);
    }
    if (!location.city && candidate.city) {
      location.city = normalizeCity(candidate.city);
      changed = Boolean(location.city) || changed;
    }
    if (!location.state && candidate.state) {
      location.state = normalizeState(candidate.state);
      changed = Boolean(location.state) || changed;
    }
    if (!location.postalCode && candidate.postalCode) {
      location.postalCode = normalizePostalCode(candidate.postalCode);
      changed = Boolean(location.postalCode) || changed;
    }
    if (!location.formattedAddress && candidate.formattedAddress) {
      location.formattedAddress = normalizeFormattedAddress(candidate.formattedAddress);
      changed = Boolean(location.formattedAddress) || changed;
    }
    if (changed) {
      sourceFlags.add(source);
    }
    return changed;
  };

  if (!(location.city && location.state && location.postalCode)) {
    const structuredCandidates = collectStructuredCandidates(listing);
    for (const candidate of structuredCandidates) {
      const structured = extractFromStructuredObject(candidate);
      if (applyMissing(structured, 'structured') && (location.city && location.state && location.postalCode)) {
        break;
      }
    }
  }

  if (!(location.city && location.state && location.postalCode)) {
    const formattedCandidates = pickFormattedAddressCandidates(listing);
    for (const candidate of formattedCandidates) {
      const parsed = parseFormattedAddress(candidate);
      if (!parsed) continue;
      applyMissing(parsed, 'formatted');
      if (location.city && location.state && location.postalCode) {
        break;
      }
    }
  } else if (!location.address1) {
    const formattedCandidates = pickFormattedAddressCandidates(listing);
    for (const candidate of formattedCandidates) {
      const parsed = parseFormattedAddress(candidate);
      if (!parsed) continue;
      if (applyMissing(parsed, 'formatted')) {
        break;
      }
    }
  }

  if (community && typeof community === 'object') {
    const communityCandidate = {
      city: firstNonEmpty(community.city),
      state: firstNonEmpty(community.state),
      postalCode: firstNonEmpty(community.postalCode, community.zip, community.postal)
    };
    applyMissing(communityCandidate, 'community');
  }

  if (!location.state && location.postalCode) {
    const derivedState = deriveStateFromPostalCode(location.postalCode);
    if (derivedState) {
      location.state = derivedState;
      sourceFlags.add('postal_lookup');
    }
  }

  if (!location.address1) {
    location.address1 = normalizeAddress1(rawAddress);
  }

  if (!location.formattedAddress) {
    location.formattedAddress = buildFormattedAddress(location);
  }

  location.address1 = location.address1 || null;
  location.city = location.city || null;
  location.state = location.state || null;
  location.postalCode = location.postalCode || null;
  location.formattedAddress = location.formattedAddress || null;

  const source = sourceFlags.has('formatted')
    ? 'formatted'
    : sourceFlags.has('structured')
      ? 'structured'
      : sourceFlags.has('split')
        ? 'split'
        : sourceFlags.has('community')
          ? 'community'
          : sourceFlags.has('postal_lookup')
            ? 'postal_lookup'
          : 'none';

  return {
    ...location,
    source,
    sources: Array.from(sourceFlags),
    hasRequiredSplit: Boolean(location.city && location.state && location.postalCode),
    derivedFromStructured: sourceFlags.has('structured'),
    derivedFromFormatted: sourceFlags.has('formatted'),
    derivedFromPostalLookup: sourceFlags.has('postal_lookup')
  };
};

const buildListingLocationPersistencePatch = ({ listing = {}, normalizedLocation = null } = {}) => {
  if (!normalizedLocation || typeof normalizedLocation !== 'object') return null;
  if (!normalizedLocation.derivedFromStructured
    && !normalizedLocation.derivedFromFormatted
    && !normalizedLocation.derivedFromPostalLookup) {
    return null;
  }

  const patch = {};
  if (!trimString(listing?.address1) && trimString(normalizedLocation.address1)) {
    patch.address1 = normalizeAddress1(normalizedLocation.address1);
  }
  if (!trimString(listing?.city) && trimString(normalizedLocation.city)) {
    patch.city = normalizeCity(normalizedLocation.city);
  }
  if (!trimString(listing?.state) && trimString(normalizedLocation.state)) {
    patch.state = normalizeState(normalizedLocation.state);
  }
  if (!trimString(listing?.postalCode) && trimString(normalizedLocation.postalCode)) {
    patch.postalCode = normalizePostalCode(normalizedLocation.postalCode);
  }
  if (!trimString(listing?.formattedAddress) && trimString(normalizedLocation.formattedAddress)) {
    patch.formattedAddress = normalizeFormattedAddress(normalizedLocation.formattedAddress);
  }
  return Object.keys(patch).length ? patch : null;
};

const resolveListingLocationDefaults = ({ listing = {}, communityLocation = {} } = {}) => {
  const listingCity = normalizeCity(firstNonEmpty(listing?.city));
  const listingState = normalizeState(firstNonEmpty(listing?.state));
  const listingPostalCode = normalizePostalCode(firstNonEmpty(
    listing?.postalCode,
    listing?.zip,
    listing?.postal
  ));

  const communityCity = normalizeCity(firstNonEmpty(
    communityLocation?.city
  ));
  const communityState = normalizeState(firstNonEmpty(
    communityLocation?.state
  ));
  const communityPostalCode = normalizePostalCode(firstNonEmpty(
    communityLocation?.postalCode,
    communityLocation?.zip,
    communityLocation?.postal
  ));

  const city = listingCity || communityCity;
  const state = listingState || communityState;
  const postalCode = listingPostalCode || communityPostalCode;

  const usedCommunityDefaults = Boolean(
    (!listingCity && communityCity)
    || (!listingState && communityState)
    || (!listingPostalCode && communityPostalCode)
  );

  return {
    city: city || '',
    state: state || '',
    postalCode: postalCode || '',
    usedCommunityDefaults
  };
};

const buildMissingListingLocationPatch = ({ listing = {}, communityLocation = {} } = {}) => {
  const listingCity = normalizeCity(firstNonEmpty(listing?.city));
  const listingState = normalizeState(firstNonEmpty(listing?.state));
  const listingPostalCode = normalizePostalCode(firstNonEmpty(
    listing?.postalCode,
    listing?.zip,
    listing?.postal
  ));

  const communityDefaults = resolveListingLocationDefaults({
    listing: {},
    communityLocation
  });

  const patch = {};
  if (!listingCity && communityDefaults.city) patch.city = communityDefaults.city;
  if (!listingState && communityDefaults.state) patch.state = communityDefaults.state;
  if (!listingPostalCode && communityDefaults.postalCode) patch.postalCode = communityDefaults.postalCode;
  return Object.keys(patch).length ? patch : null;
};

module.exports = {
  normalizeListingLocation,
  parseFormattedAddress,
  deriveStateFromPostalCode,
  formatCityStatePostal,
  buildFormattedAddress,
  buildListingLocationPersistencePatch,
  resolveListingLocationDefaults,
  buildMissingListingLocationPatch
};
