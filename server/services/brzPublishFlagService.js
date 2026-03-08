const MAX_BULK_FLAG_ITEMS = 200;

const trimString = (value) => (value == null ? '' : String(value).trim());

const isObjectId = (value) => {
  try {
    // Lazy require keeps this helper simple in tests.
    const mongoose = require('mongoose');
    return mongoose.Types.ObjectId.isValid(trimString(value));
  } catch {
    return false;
  }
};

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizePublishAction(action) {
  const normalized = trimString(action).toLowerCase();
  if (normalized === 'publish') {
    return {
      action: 'publish',
      isPublished: true
    };
  }
  if (normalized === 'unpublish') {
    return {
      action: 'unpublish',
      isPublished: false
    };
  }
  throw createHttpError(400, 'Invalid action');
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = trimString(value).toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

function buildLotPublishFlagSet({ action, now = new Date() }) {
  const { isPublished } = normalizePublishAction(action);

  return {
    'lots.$.buildrootz.isPublished': isPublished,
    'lots.$.isPublished': isPublished,
    'lots.$.isListed': isPublished,
    'lots.$.publishedAt': isPublished ? now : null,
    'lots.$.contentSyncedAt': now
  };
}

function normalizeBulkFlagItems(items) {
  if (!Array.isArray(items)) {
    throw createHttpError(400, 'items must be an array');
  }
  if (!items.length) {
    throw createHttpError(400, 'At least one item is required');
  }
  if (items.length > MAX_BULK_FLAG_ITEMS) {
    throw createHttpError(400, `Maximum ${MAX_BULK_FLAG_ITEMS} items per request`);
  }

  return items.map((item) => ({
    communityId: trimString(item?.communityId),
    lotId: trimString(item?.lotId)
  }));
}

async function bulkUpdateLotPublishFlags({
  CommunityModel,
  companyId,
  items,
  action,
  hasCommunityAccess,
  user
} = {}) {
  const normalizedCompanyId = trimString(companyId);
  if (!normalizedCompanyId || !isObjectId(normalizedCompanyId)) {
    throw createHttpError(400, 'Invalid company context');
  }
  if (!CommunityModel || typeof CommunityModel.updateOne !== 'function') {
    throw createHttpError(500, 'Community model is required');
  }
  if (typeof hasCommunityAccess !== 'function') {
    throw createHttpError(500, 'Community access guard is required');
  }

  const { action: normalizedAction } = normalizePublishAction(action);
  const normalizedItems = normalizeBulkFlagItems(items);
  const now = new Date();
  const updateSet = buildLotPublishFlagSet({
    action: normalizedAction,
    now
  });

  let updatedCount = 0;
  const skipped = [];
  const updatedItems = [];
  const updatedCommunityIdSet = new Set();

  for (const item of normalizedItems) {
    if (!isObjectId(item.communityId)) {
      skipped.push({ ...item, reason: 'Invalid communityId' });
      continue;
    }
    if (!isObjectId(item.lotId)) {
      skipped.push({ ...item, reason: 'Invalid lotId' });
      continue;
    }
    if (!hasCommunityAccess(user, item.communityId)) {
      skipped.push({ ...item, reason: 'Community not accessible' });
      continue;
    }

    const result = await CommunityModel.updateOne(
      {
        _id: item.communityId,
        company: normalizedCompanyId,
        'lots._id': item.lotId
      },
      {
        $set: updateSet
      }
    );

    if (Number(result?.matchedCount || 0) > 0) {
      updatedCount += 1;
      updatedItems.push({ ...item });
      updatedCommunityIdSet.add(item.communityId);
      continue;
    }

    skipped.push({ ...item, reason: 'Lot not found' });
  }

  return {
    action: normalizedAction,
    now,
    updatedCount,
    skipped,
    requestedCount: normalizedItems.length,
    updatedItems,
    updatedCommunityIds: Array.from(updatedCommunityIdSet)
  };
}

async function processBrzReadinessBulkAction({
  CommunityModel,
  companyId,
  items,
  action,
  hasCommunityAccess,
  user,
  alsoPublishInventory = false,
  publishCompanyInventoryImpl = null,
  ctx = null
} = {}) {
  const flagResult = await bulkUpdateLotPublishFlags({
    CommunityModel,
    companyId,
    items,
    action,
    hasCommunityAccess,
    user
  });

  const shouldPublishInventory = toBoolean(alsoPublishInventory)
    && flagResult.updatedCommunityIds.length > 0;

  if (!shouldPublishInventory) {
    return {
      ok: true,
      statusCode: 200,
      ...flagResult,
      inventoryPublish: null,
      flagsUpdated: flagResult.updatedCount > 0
    };
  }

  if (typeof publishCompanyInventoryImpl !== 'function') {
    throw createHttpError(500, 'Inventory publish service unavailable');
  }

  try {
    const inventoryPublish = await publishCompanyInventoryImpl({
      companyId: trimString(companyId),
      communityIds: flagResult.updatedCommunityIds,
      unpublishMissingHomes: true,
      ctx
    });

    return {
      ok: true,
      statusCode: 200,
      ...flagResult,
      inventoryPublish,
      flagsUpdated: true
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: err?.status || 502,
      ...flagResult,
      inventoryPublish: null,
      flagsUpdated: true,
      message: err?.message || 'Inventory publish failed'
    };
  }
}

module.exports = {
  MAX_BULK_FLAG_ITEMS,
  buildLotPublishFlagSet,
  bulkUpdateLotPublishFlags,
  normalizeBulkFlagItems,
  normalizePublishAction,
  processBrzReadinessBulkAction
};
