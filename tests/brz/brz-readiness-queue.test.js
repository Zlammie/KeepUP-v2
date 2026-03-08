const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildReadinessRows,
  groupReadinessRows,
  paginateRows
} = require('../../server/lib/brzReadinessQueue');

const makeCommunity = () => ({
  _id: 'community-1',
  name: 'Queue Ridge',
  city: 'Dallas',
  state: 'TX',
  updatedAt: '2026-02-20T00:00:00.000Z',
  lots: [
    {
      _id: 'lot-incomplete',
      address: '100 Missing Hero Dr',
      heroImage: '',
      listingPhotos: [],
      liveElevationPhoto: '',
      latitude: 32.7767,
      longitude: -96.797,
      listPrice: 450000,
      listingDescription: 'Spec home',
      beds: 4,
      baths: 3,
      sqft: 2400,
      buildrootz: { isPublished: true }
    },
    {
      _id: 'lot-warning',
      address: '101 Missing Price Dr',
      heroImage: '/uploads/warning.jpg',
      listingPhotos: [],
      liveElevationPhoto: '',
      latitude: 32.7767,
      longitude: -96.797,
      listPrice: null,
      salesPrice: null,
      listingDescription: 'Price still pending',
      beds: 4,
      baths: 3,
      sqft: 2500,
      buildrootz: { isPublished: false }
    },
    {
      _id: 'lot-ready',
      address: '102 Floorplan Fallback Dr',
      heroImage: '/uploads/ready.jpg',
      listingPhotos: [],
      liveElevationPhoto: '',
      latitude: 32.7767,
      longitude: -96.797,
      listPrice: 470000,
      listingDescription: 'Ready to publish',
      floorPlan: 'floorplan-1',
      buildrootz: { isPublished: false }
    }
  ]
});

test('buildReadinessRows computes statuses and sorts by readiness severity', () => {
  const { rows, summary } = buildReadinessRows({
    communities: [makeCommunity()],
    floorPlanById: {
      'floorplan-1': {
        _id: 'floorplan-1',
        specs: {
          beds: 4,
          baths: 3,
          squareFeet: 2600
        }
      }
    }
  });

  assert.deepEqual(rows.map((row) => row.lotId), [
    'lot-incomplete',
    'lot-warning',
    'lot-ready'
  ]);
  assert.deepEqual(rows.map((row) => row.readiness.status), [
    'incomplete',
    'warning',
    'ready'
  ]);
  assert.deepEqual(summary, {
    total: 3,
    ready: 1,
    warning: 1,
    incomplete: 1
  });
  assert.equal(rows[2].readiness.score, 95);
  assert.equal(rows[2].warningCount, 1);
  assert.equal(rows[2].warningsTitle, 'Using floor plan specs');
});

test('buildReadinessRows filters by published, status, and community before pagination', () => {
  const communities = [
    makeCommunity(),
    {
      _id: 'community-2',
      name: 'Second Queue',
      city: 'Austin',
      state: 'TX',
      updatedAt: '2026-02-25T00:00:00.000Z',
      lots: [
        {
          _id: 'lot-community-2',
          address: '200 Ready Ave',
          heroImage: '/uploads/ready-2.jpg',
          listingPhotos: [],
          liveElevationPhoto: '',
          latitude: 30.2672,
          longitude: -97.7431,
          listPrice: 490000,
          listingDescription: 'Fully complete',
          beds: 4,
          baths: 3,
          sqft: 2550,
          buildrootz: { isPublished: false }
        }
      ]
    }
  ];

  const { rows, summary } = buildReadinessRows({
    communities,
    communityId: 'community-2',
    published: 'unpublished',
    status: 'ready'
  });
  const page = paginateRows(rows, { page: 1, perPage: 50 });

  assert.deepEqual(summary, {
    total: 1,
    ready: 1,
    warning: 0,
    incomplete: 0
  });
  assert.equal(page.totalItems, 1);
  assert.equal(page.totalPages, 1);
  assert.deepEqual(page.items.map((row) => row.lotId), ['lot-community-2']);
  assert.equal(page.items[0].communityName, 'Second Queue');
});

test('groupReadinessRows groups page rows by community and counts statuses', () => {
  const communities = [
    makeCommunity(),
    {
      _id: 'community-2',
      name: 'Second Queue',
      city: 'Austin',
      state: 'TX',
      updatedAt: '2026-02-25T00:00:00.000Z',
      lots: [
        {
          _id: 'lot-community-2-warning',
          address: '201 Missing Price Ave',
          heroImage: '/uploads/ready-2.jpg',
          listingPhotos: [],
          liveElevationPhoto: '',
          latitude: 30.2672,
          longitude: -97.7431,
          listPrice: null,
          salesPrice: null,
          listingDescription: 'Awaiting price',
          beds: 4,
          baths: 3,
          sqft: 2550,
          buildrootz: { isPublished: false }
        },
        {
          _id: 'lot-community-2-ready',
          address: '202 Ready Ave',
          heroImage: '/uploads/ready-3.jpg',
          listingPhotos: [],
          liveElevationPhoto: '',
          latitude: 30.2672,
          longitude: -97.7431,
          listPrice: 515000,
          listingDescription: 'Ready now',
          beds: 4,
          baths: 3,
          sqft: 2625,
          buildrootz: { isPublished: false }
        }
      ]
    }
  ];

  const { rows } = buildReadinessRows({
    communities,
    floorPlanById: {
      'floorplan-1': {
        _id: 'floorplan-1',
        specs: {
          beds: 4,
          baths: 3,
          squareFeet: 2600
        }
      }
    }
  });

  const groups = groupReadinessRows(rows);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].communityId, 'community-1');
  assert.deepEqual(groups[0].counts, {
    total: 3,
    ready: 1,
    warning: 1,
    incomplete: 1
  });
  assert.deepEqual(groups[0].selectableCounts, {
    ready: 1,
    readyAndWarning: 2
  });
  assert.deepEqual(groups[1].counts, {
    total: 2,
    ready: 1,
    warning: 1,
    incomplete: 0
  });
  assert.deepEqual(groups[1].selectableCounts, {
    ready: 1,
    readyAndWarning: 2
  });
  assert.deepEqual(groups[1].rows.map((row) => row.lotId), [
    'lot-community-2-warning',
    'lot-community-2-ready'
  ]);
});
