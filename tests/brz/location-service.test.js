const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseFormattedAddress,
  deriveStateFromPostalCode,
  normalizeListingLocation,
  buildListingLocationPersistencePatch,
  resolveListingLocationDefaults
} = require('../../server/services/locationService');

test('parseFormattedAddress parses line1, city, state, and ZIP+4', () => {
  const parsed = parseFormattedAddress('123 Main St, Celina, tx 75009-1234');
  assert.deepEqual(parsed, {
    address1: '123 Main St',
    city: 'Celina',
    state: 'TX',
    postalCode: '75009-1234',
    formattedAddress: '123 Main St, Celina, tx 75009-1234'
  });
});

test('normalizeListingLocation prefers split fields and normalizes casing/zip', () => {
  const normalized = normalizeListingLocation({
    address1: ' 412 Oak Ave ',
    city: ' Frisco ',
    state: 'tx',
    postalCode: '75034 1234'
  });
  assert.equal(normalized.address1, '412 Oak Ave');
  assert.equal(normalized.city, 'Frisco');
  assert.equal(normalized.state, 'TX');
  assert.equal(normalized.postalCode, '75034-1234');
  assert.equal(normalized.hasRequiredSplit, true);
});

test('normalizeListingLocation derives from formatted address when split fields are missing', () => {
  const normalized = normalizeListingLocation({
    address: '915 Lake View Dr, Prosper, Texas 75078'
  });
  assert.equal(normalized.address1, '915 Lake View Dr');
  assert.equal(normalized.city, 'Prosper');
  assert.equal(normalized.state, 'TX');
  assert.equal(normalized.postalCode, '75078');
  assert.equal(normalized.derivedFromFormatted, true);
  assert.equal(normalized.hasRequiredSplit, true);
});

test('deriveStateFromPostalCode derives TX for Texas ZIP ranges', () => {
  assert.equal(deriveStateFromPostalCode('75009'), 'TX');
  assert.equal(deriveStateFromPostalCode('79936-5400'), 'TX');
  assert.equal(deriveStateFromPostalCode('73301'), 'TX');
});

test('normalizeListingLocation derives state from postalCode when state is missing', () => {
  const normalized = normalizeListingLocation({
    address1: '111 River Walk Dr',
    city: 'Frisco',
    postalCode: '75034'
  });
  assert.equal(normalized.address1, '111 River Walk Dr');
  assert.equal(normalized.city, 'Frisco');
  assert.equal(normalized.state, 'TX');
  assert.equal(normalized.postalCode, '75034');
  assert.equal(normalized.derivedFromPostalLookup, true);
});

test('normalizeListingLocation derives from structured component arrays', () => {
  const normalized = normalizeListingLocation({
    addressComponents: [
      { types: ['street_number'], long_name: '77' },
      { types: ['route'], long_name: 'Stonebrook Pkwy' },
      { types: ['locality'], long_name: 'Frisco' },
      { types: ['administrative_area_level_1'], short_name: 'tx' },
      { types: ['postal_code'], long_name: '75034' }
    ]
  });
  assert.equal(normalized.address1, '77 Stonebrook Pkwy');
  assert.equal(normalized.city, 'Frisco');
  assert.equal(normalized.state, 'TX');
  assert.equal(normalized.postalCode, '75034');
  assert.equal(normalized.derivedFromStructured, true);
});

test('buildListingLocationPersistencePatch only writes missing canonical fields', () => {
  const normalized = normalizeListingLocation({
    address: '500 Elm St, Allen, TX 75013'
  });
  const patch = buildListingLocationPersistencePatch({
    listing: {
      address: '500 Elm St, Allen, TX 75013',
      city: 'Allen',
      state: '',
      postalCode: ''
    },
    normalizedLocation: normalized
  });
  assert.deepEqual(patch, {
    address1: '500 Elm St',
    state: 'TX',
    postalCode: '75013',
    formattedAddress: '500 Elm St, Allen, TX 75013'
  });
});

test('resolveListingLocationDefaults fills missing listing city/state/zip from community location', () => {
  const resolved = resolveListingLocationDefaults({
    listing: {
      city: '',
      state: '',
      postalCode: ''
    },
    communityLocation: {
      city: 'Celina',
      state: 'tx',
      postalCode: '75009'
    }
  });

  assert.deepEqual(resolved, {
    city: 'Celina',
    state: 'TX',
    postalCode: '75009',
    usedCommunityDefaults: true
  });
});
