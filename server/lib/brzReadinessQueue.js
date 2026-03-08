const { computeBrzReadiness } = require('./brzReadiness');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const STATUS_ORDER = Object.freeze({
  incomplete: 0,
  warning: 1,
  ready: 2
});

const ALLOWED_STATUS = new Set(['all', 'ready', 'warning', 'incomplete']);
const ALLOWED_PUBLISHED = new Set(['all', 'published', 'unpublished']);
const ALLOWED_SORT = new Set(['readiness', 'updatedAt-desc']);

const trimString = (value) => (value == null ? '' : String(value).trim());

const toStringId = (value) => {
  if (!value && value !== 0) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (typeof value.toString === 'function') {
      const text = value.toString();
      return text && text !== '[object Object]' ? text : '';
    }
  }
  return String(value).trim();
};

const toValidDateMs = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (max && parsed > max) return max;
  return parsed;
};

const isEmbeddedObject = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && !value._bsontype
);

function normalizeQueueParams(raw = {}) {
  const status = ALLOWED_STATUS.has(trimString(raw.status).toLowerCase())
    ? trimString(raw.status).toLowerCase()
    : 'all';
  const published = ALLOWED_PUBLISHED.has(trimString(raw.published).toLowerCase())
    ? trimString(raw.published).toLowerCase()
    : 'all';
  const sort = ALLOWED_SORT.has(trimString(raw.sort))
    ? trimString(raw.sort)
    : 'readiness';
  const communityId = toStringId(raw.communityId);

  return {
    status,
    published,
    sort,
    communityId: communityId || '',
    page: normalizePositiveInt(raw.page, 1),
    perPage: normalizePositiveInt(raw.perPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  };
}

function isLotPublishedForBuildrootz(lot) {
  if (!lot || typeof lot !== 'object') return false;
  if (lot.buildrootz && Object.prototype.hasOwnProperty.call(lot.buildrootz, 'isPublished')) {
    return Boolean(lot.buildrootz.isPublished);
  }
  return Boolean(lot.isPublished ?? lot.isListed ?? lot.listed ?? lot.listingActive);
}

function lotMatchesPublishedFilter(lot, filter) {
  if (filter === 'published') return isLotPublishedForBuildrootz(lot);
  if (filter === 'unpublished') return !isLotPublishedForBuildrootz(lot);
  return true;
}

function resolveFloorPlan(lot, floorPlanById = {}) {
  const rawFloorPlan = lot?.floorPlan;
  const floorPlanId = (() => {
    if (!rawFloorPlan) return '';
    if (typeof rawFloorPlan === 'string') return rawFloorPlan.trim();
    if (isEmbeddedObject(rawFloorPlan)) {
      return toStringId(rawFloorPlan._id || rawFloorPlan.id);
    }
    return toStringId(rawFloorPlan);
  })();

  if (floorPlanId && floorPlanById[floorPlanId]) {
    return floorPlanById[floorPlanId];
  }
  if (isEmbeddedObject(rawFloorPlan)) {
    return rawFloorPlan;
  }
  return null;
}

function formatLotLabel(lot) {
  const address = trimString(lot?.address);
  if (address) return address;

  const segments = [];
  const lotNumber = trimString(lot?.lot);
  const block = trimString(lot?.block);
  const phase = trimString(lot?.phase);
  const jobNumber = trimString(lot?.jobNumber);

  if (lotNumber) segments.push(`Lot ${lotNumber}`);
  if (block) segments.push(`Block ${block}`);
  if (phase) segments.push(`Phase ${phase}`);
  if (jobNumber) segments.push(`Job ${jobNumber}`);

  if (segments.length) return segments.join(' / ');
  return 'Unnamed lot';
}

function stableSort(rows, comparator) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = comparator(left.row, right.row);
      if (compared !== 0) return compared;
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}

function compareRows(sort) {
  return (left, right) => {
    const leftUpdated = toValidDateMs(left.updatedAt);
    const rightUpdated = toValidDateMs(right.updatedAt);
    const leftSeverity = STATUS_ORDER[left.readiness.status] ?? 99;
    const rightSeverity = STATUS_ORDER[right.readiness.status] ?? 99;

    if (sort === 'updatedAt-desc') {
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
      if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;
      if (left.readiness.score !== right.readiness.score) {
        return left.readiness.score - right.readiness.score;
      }
      return 0;
    }

    if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;
    if (left.readiness.score !== right.readiness.score) {
      return left.readiness.score - right.readiness.score;
    }
    if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
    return 0;
  };
}

function buildReadinessRows({
  communities = [],
  floorPlanById = {},
  status = 'all',
  published = 'all',
  communityId = '',
  sort = 'readiness'
} = {}) {
  const scopedRows = [];

  communities.forEach((community) => {
    const currentCommunityId = toStringId(community?._id);
    if (communityId && currentCommunityId !== communityId) return;

    const lots = Array.isArray(community?.lots) ? community.lots : [];
    lots.forEach((lot) => {
      if (!lotMatchesPublishedFilter(lot, published)) return;

      const readiness = computeBrzReadiness({
        community,
        lot,
        floorPlan: resolveFloorPlan(lot, floorPlanById)
      });

      const lotId = toStringId(lot?._id);
      const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
      const missing = Array.isArray(readiness.missing) ? readiness.missing : [];

      scopedRows.push({
        communityId: currentCommunityId,
        communityName: trimString(community?.name) || 'Community',
        communityLocation: [trimString(community?.city), trimString(community?.state)]
          .filter(Boolean)
          .join(', '),
        lotId,
        addressLabel: formatLotLabel(lot),
        published: isLotPublishedForBuildrootz(lot),
        updatedAt: lot?.updatedAt || community?.updatedAt || null,
        listingDetailsUrl: `/listing-details?communityId=${encodeURIComponent(currentCommunityId)}&lotId=${encodeURIComponent(lotId)}`,
        readiness,
        missingPreview: missing.slice(0, 3),
        hiddenMissingCount: Math.max(0, missing.length - 3),
        missingTitle: missing.join(', '),
        warningCount: warnings.length,
        warningsTitle: warnings.join(', ')
      });
    });
  });

  const summary = scopedRows.reduce((acc, row) => {
    acc.total += 1;
    if (row.readiness.status === 'ready') acc.ready += 1;
    else if (row.readiness.status === 'warning') acc.warning += 1;
    else acc.incomplete += 1;
    return acc;
  }, {
    total: 0,
    ready: 0,
    warning: 0,
    incomplete: 0
  });

  const filteredRows = status === 'all'
    ? scopedRows
    : scopedRows.filter((row) => row.readiness.status === status);

  const rows = stableSort(filteredRows, compareRows(sort));

  return {
    rows,
    summary
  };
}

function paginateRows(rows = [], { page = 1, perPage = DEFAULT_PAGE_SIZE } = {}) {
  const safePerPage = normalizePositiveInt(perPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const totalItems = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const currentPage = Math.min(normalizePositiveInt(page, 1), totalPages);
  const startIndex = (currentPage - 1) * safePerPage;
  const endIndex = startIndex + safePerPage;

  return {
    items: rows.slice(startIndex, endIndex),
    totalItems,
    totalPages,
    page: currentPage,
    perPage: safePerPage,
    startItem: totalItems ? startIndex + 1 : 0,
    endItem: totalItems ? Math.min(endIndex, totalItems) : 0,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages
  };
}

function groupReadinessRows(rows = []) {
  const groups = [];
  const groupByCommunityId = new Map();

  rows.forEach((row) => {
    const communityId = toStringId(row?.communityId);
    if (!communityId) return;

    let group = groupByCommunityId.get(communityId);
    if (!group) {
      group = {
        communityId,
        communityName: trimString(row?.communityName) || 'Community',
        communityLocation: trimString(row?.communityLocation),
        rows: [],
        counts: {
          total: 0,
          ready: 0,
          warning: 0,
          incomplete: 0
        },
        selectableCounts: {
          ready: 0,
          readyAndWarning: 0
        }
      };
      groupByCommunityId.set(communityId, group);
      groups.push(group);
    }

    group.rows.push(row);
    group.counts.total += 1;

    if (row?.readiness?.status === 'ready') {
      group.counts.ready += 1;
      group.selectableCounts.ready += 1;
      group.selectableCounts.readyAndWarning += 1;
      return;
    }

    if (row?.readiness?.status === 'warning') {
      group.counts.warning += 1;
      group.selectableCounts.readyAndWarning += 1;
      return;
    }

    group.counts.incomplete += 1;
  });

  return groups;
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  buildReadinessRows,
  groupReadinessRows,
  isLotPublishedForBuildrootz,
  normalizeQueueParams,
  paginateRows
};
