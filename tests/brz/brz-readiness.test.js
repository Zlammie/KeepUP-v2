const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeBrzReadiness } = require('../../server/lib/brzReadiness');

const buildContext = (overrides = {}) => {
  const community = {
    name: 'Readiness Ridge',
    city: 'Dallas',
    state: 'TX',
    ...overrides.community
  };

  const lot = {
    address: '123 Ready Ln',
    heroImage: '/uploads/hero.jpg',
    listingPhotos: [],
    liveElevationPhoto: '',
    latitude: 32.7767,
    longitude: -96.797,
    listPrice: 425000,
    listingDescription: 'Move-in ready spec home.',
    beds: 4,
    baths: 3,
    sqft: 2450,
    ...overrides.lot
  };

  const floorPlan = overrides.hasOwnProperty('floorPlan')
    ? overrides.floorPlan
    : {
        specs: {
          beds: 4,
          baths: 3,
          squareFeet: 2450
        }
      };

  return { community, lot, floorPlan };
};

test('missing address line1 returns incomplete', () => {
  const readiness = computeBrzReadiness(buildContext({
    lot: {
      address: ''
    }
  }));

  assert.equal(readiness.status, 'incomplete');
  assert.ok(readiness.missing.includes('Address line 1'));
});

test('missing hero image returns incomplete', () => {
  const readiness = computeBrzReadiness(buildContext({
    lot: {
      heroImage: '',
      listingPhotos: [],
      liveElevationPhoto: ''
    }
  }));

  assert.equal(readiness.status, 'incomplete');
  assert.ok(readiness.missing.includes('Hero image'));
});

test('missing geo only returns warning', () => {
  const readiness = computeBrzReadiness(buildContext({
    lot: {
      latitude: null,
      longitude: null
    }
  }));

  assert.equal(readiness.status, 'warning');
  assert.deepEqual(readiness.missing, ['Map coordinates']);
});

test('missing price only returns warning', () => {
  const readiness = computeBrzReadiness(buildContext({
    lot: {
      listPrice: null,
      salesPrice: null
    }
  }));

  assert.equal(readiness.status, 'warning');
  assert.deepEqual(readiness.missing, ['Price']);
});

test('floor plan specs fallback avoids missing specs and adds note', () => {
  const readiness = computeBrzReadiness(buildContext({
    lot: {
      beds: null,
      baths: null,
      sqft: null
    },
    floorPlan: {
      specs: {
        beds: 4,
        baths: 3,
        squareFeet: 2450
      }
    }
  }));

  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.missing.includes('Beds'), false);
  assert.equal(readiness.missing.includes('Baths'), false);
  assert.equal(readiness.missing.includes('Sqft'), false);
  assert.ok(readiness.warnings.includes('Using floor plan specs'));
  assert.equal(readiness.score, 95);
});

test('complete listing returns ready', () => {
  const readiness = computeBrzReadiness(buildContext());

  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.score, 100);
  assert.deepEqual(readiness.missing, []);
  assert.deepEqual(readiness.warnings, []);
});
