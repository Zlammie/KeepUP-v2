const { computeBrzReadiness } = require('./brzReadiness');
const { isLotPublishedForBuildrootz } = require('./brzReadinessQueue');

const READINESS_ORDER = Object.freeze({
  incomplete: 0,
  warning: 1,
  ready: 2
});

const trimString = (value) => (value == null ? '' : String(value).trim());

const toStringId = (value) => {
  if (value == null) return '';
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

const isEmbeddedObject = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && !value._bsontype
);

const toDateMs = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveFloorPlan = (lot, floorPlanById = {}) => {
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
};

const formatAddressLabel = (lot) => {
  const address = trimString(lot?.address);
  if (address) return address;

  const lotNumber = trimString(lot?.lot);
  const block = trimString(lot?.block);
  const jobNumber = trimString(lot?.jobNumber);

  const parts = [];
  if (lotNumber) parts.push(`Lot ${lotNumber}`);
  if (block) parts.push(`Block ${block}`);
  if (jobNumber) parts.push(`Job ${jobNumber}`);
  return parts.length ? parts.join(' | ') : 'Unnamed lot';
};

const formatListingInfoSecondary = (lot) => {
  const lotNumber = trimString(lot?.lot);
  const block = trimString(lot?.block);
  const jobNumber = trimString(lot?.jobNumber);

  const parts = [];
  if (lotNumber) parts.push(`Lot ${lotNumber}`);
  if (block) parts.push(`Block ${block}`);
  if (jobNumber) parts.push(`Job ${jobNumber}`);
  return parts.join(' | ');
};

const resolveSyncDate = (lot) => (
  lot?.contentSyncedAt
  || lot?.buildrootzSyncedAt
  || lot?.syncedAt
  || null
);

const inferNeedsSync = ({
  published = false,
  syncDate = null,
  updatedAt = null,
  lastPublishStatus = ''
} = {}) => {
  if (!published) return false;

  const normalizedStatus = trimString(lastPublishStatus).toLowerCase();
  if (normalizedStatus === 'error') return true;

  const syncMs = toDateMs(syncDate);
  if (!syncMs) return true;

  const updatedMs = toDateMs(updatedAt);
  if (updatedMs && updatedMs > syncMs) return true;

  return false;
};

const stableSort = (rows, comparator) => (
  rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = comparator(left.row, right.row);
      if (compared !== 0) return compared;
      return left.index - right.index;
    })
    .map((entry) => entry.row)
);

function buildLotOperationsRows({
  communities = [],
  floorPlanById = {},
  communityId = ''
} = {}) {
  const rows = [];

  communities.forEach((community) => {
    const currentCommunityId = toStringId(community?._id);
    if (communityId && currentCommunityId !== communityId) return;

    const communityName = trimString(community?.name) || 'Community';
    const communityLocation = [trimString(community?.city), trimString(community?.state)]
      .filter(Boolean)
      .join(', ');
    const lots = Array.isArray(community?.lots) ? community.lots : [];

    lots.forEach((lot) => {
      const lotId = toStringId(lot?._id);
      if (!lotId) return;

      const floorPlan = resolveFloorPlan(lot, floorPlanById);
      const readiness = computeBrzReadiness({
        community,
        lot,
        floorPlan
      });

      const published = isLotPublishedForBuildrootz(lot);
      const updatedAt = lot?.updatedAt || community?.updatedAt || null;
      const syncDate = resolveSyncDate(lot);

      const city = trimString(lot?.city || community?.city);
      const state = trimString(lot?.state || community?.state);
      const zip = trimString(lot?.postalCode || lot?.zip || community?.zip);
      const cityState = [city, state].filter(Boolean).join(', ');
      const cityStateZip = [cityState, zip].filter(Boolean).join(' ');
      const missing = Array.isArray(readiness.missing) ? readiness.missing : [];
      const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];

      rows.push({
        key: `${currentCommunityId}:${lotId}`,
        communityId: currentCommunityId,
        communityName,
        communityLocation,
        lotId,
        listingDetailsUrl: `/listing-details?communityId=${encodeURIComponent(currentCommunityId)}&lotId=${encodeURIComponent(lotId)}`,
        addressLabel: formatAddressLabel(lot),
        listingInfoSecondary: formatListingInfoSecondary(lot),
        cityStateZip,
        lot: trimString(lot?.lot),
        block: trimString(lot?.block),
        jobNumber: trimString(lot?.jobNumber),
        status: trimString(lot?.generalStatus || lot?.status) || 'Available',
        published,
        publishedAt: lot?.publishedAt || lot?.listDate || null,
        syncDate,
        updatedAt,
        needsSync: inferNeedsSync({
          published,
          syncDate,
          updatedAt,
          lastPublishStatus: lot?.buildrootzLastPublishStatus
        }),
        readiness,
        missingPreview: missing.slice(0, 3),
        hiddenMissingCount: Math.max(0, missing.length - 3),
        missingTitle: missing.join(', '),
        warningCount: warnings.length,
        warningsTitle: warnings.join(', ')
      });
    });
  });

  return stableSort(rows, (left, right) => {
    const communityCompare = left.communityName.localeCompare(right.communityName);
    if (communityCompare !== 0) return communityCompare;

    const leftSeverity = READINESS_ORDER[left.readiness?.status] ?? 99;
    const rightSeverity = READINESS_ORDER[right.readiness?.status] ?? 99;
    if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;

    const leftScore = Number.isFinite(left.readiness?.score) ? left.readiness.score : 100;
    const rightScore = Number.isFinite(right.readiness?.score) ? right.readiness.score : 100;
    if (leftScore !== rightScore) return leftScore - rightScore;

    const leftUpdated = toDateMs(left.updatedAt);
    const rightUpdated = toDateMs(right.updatedAt);
    if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;

    return left.addressLabel.localeCompare(right.addressLabel);
  });
}

function buildLotOperationsSummary(rows = []) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (row?.readiness?.status === 'ready') acc.ready += 1;
    else if (row?.readiness?.status === 'warning') acc.warning += 1;
    else acc.incomplete += 1;

    if (row?.published) acc.published += 1;
    if (row?.needsSync) acc.needsSync += 1;
    return acc;
  }, {
    total: 0,
    ready: 0,
    warning: 0,
    incomplete: 0,
    published: 0,
    needsSync: 0
  });
}

function groupLotOperationsRows(rows = []) {
  const groups = [];
  const byCommunityId = new Map();

  rows.forEach((row) => {
    const communityId = toStringId(row?.communityId);
    if (!communityId) return;

    let group = byCommunityId.get(communityId);
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
          incomplete: 0,
          published: 0,
          needsSync: 0
        },
        selectableCounts: {
          ready: 0,
          readyAndWarning: 0,
          published: 0
        }
      };
      byCommunityId.set(communityId, group);
      groups.push(group);
    }

    group.rows.push(row);
    group.counts.total += 1;
    if (row?.published) {
      group.counts.published += 1;
      group.selectableCounts.published += 1;
    }
    if (row?.needsSync) group.counts.needsSync += 1;

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
  buildLotOperationsRows,
  buildLotOperationsSummary,
  groupLotOperationsRows
};
