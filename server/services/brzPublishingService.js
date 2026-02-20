const mongoose = require('mongoose');
const Company = require('../models/Company');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const BrzBuilderProfileDraft = require('../models/brz/BrzBuilderProfileDraft');
const BrzCommunityDraft = require('../models/brz/BrzCommunityDraft');
const BrzFloorPlanDraft = require('../models/brz/BrzFloorPlanDraft');
const BrzPublishedSnapshot = require('../models/brz/BrzPublishedSnapshot');
const slugify = require('../utils/slugify');

/*
BuildRootz integration note:
BuildRootz should consume /public/brz/builders/:slug snapshots only.

Smoke test plan:
1. Open /admin/buildrootz/publishing as COMPANY_ADMIN.
2. Confirm bootstrap creates missing drafts for profile, communities, and floor plans.
3. Toggle includes, edit descriptions, upload hero image, and save.
4. Publish and verify version/publishedAt update.
5. Hit /public/brz/builders/:slug and confirm payload respects overrides + include rules.
6. Edit drafts again, confirm public payload is unchanged until republish.
*/

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const toStringId = (value) => (value == null ? '' : String(value));

const trimString = (value) => (value == null ? '' : String(value).trim());

const toNumberOr = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const sanitizeImageMeta = (value) => {
  if (value == null) return null;
  if (typeof value !== 'object') return null;
  return {
    url: trimString(value.url),
    key: trimString(value.key),
    contentType: trimString(value.contentType),
    bytes: Number.isFinite(Number(value.bytes)) ? Number(value.bytes) : null,
    width: Number.isFinite(Number(value.width)) ? Number(value.width) : null,
    height: Number.isFinite(Number(value.height)) ? Number(value.height) : null,
    variants: value.variants && typeof value.variants === 'object' ? value.variants : null
  };
};

const sanitizeCtaLinks = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([key, raw]) => {
    const cleanKey = trimString(key);
    if (!cleanKey) return;
    const cleanValue = trimString(raw);
    result[cleanKey] = cleanValue;
  });
  return result;
};

const serializeImageMeta = (value) => (value ? sanitizeImageMeta(value) : null);

const serializeCompany = (company) => ({
  id: toStringId(company?._id),
  name: company?.name || '',
  slug: company?.slug || ''
});

const serializeProfileDraft = (draft, company) => {
  const defaultSlug = slugify(draft?.builderSlug || company?.slug || company?.name || '');
  return {
    id: toStringId(draft?._id),
    companyId: toStringId(draft?.companyId || company?._id),
    builderSlug: defaultSlug,
    displayNameOverride: draft?.displayNameOverride || '',
    shortDescription: draft?.shortDescription || '',
    longDescription: draft?.longDescription || '',
    heroImage: serializeImageMeta(draft?.heroImage),
    ctaLinks: sanitizeCtaLinks(draft?.ctaLinks || {})
  };
};

const serializeCommunity = (community) => ({
  id: toStringId(community?._id),
  name: community?.name || '',
  slug: community?.slug || '',
  city: community?.city || '',
  state: community?.state || ''
});

const serializeCommunityDraft = (draft, fallbackCompanyId, communityId) => ({
  id: toStringId(draft?._id),
  companyId: toStringId(draft?.companyId || fallbackCompanyId),
  communityId: toStringId(draft?.communityId || communityId),
  isIncluded: draft ? Boolean(draft.isIncluded) : true,
  displayNameOverride: draft?.displayNameOverride || '',
  descriptionOverride: draft?.descriptionOverride || '',
  heroImage: serializeImageMeta(draft?.heroImage),
  sortOrder: toNumberOr(draft?.sortOrder, 0)
});

const serializeFloorPlan = (floorPlan, communityMap) => {
  const floorPlanCommunityIds = Array.isArray(floorPlan?.communities)
    ? floorPlan.communities.map((id) => toStringId(id))
    : [];
  const linkedCommunityId = floorPlanCommunityIds.find((id) => communityMap.has(id)) || '';
  const linkedCommunity = linkedCommunityId ? communityMap.get(linkedCommunityId) : null;
  return {
    id: toStringId(floorPlan?._id),
    name: floorPlan?.name || '',
    planNumber: floorPlan?.planNumber || '',
    beds: toNumberOr(floorPlan?.specs?.beds, null),
    baths: toNumberOr(floorPlan?.specs?.baths, null),
    sqft: toNumberOr(floorPlan?.specs?.squareFeet, null),
    communityId: linkedCommunityId,
    communityName: linkedCommunity?.name || '',
    communitySlug: linkedCommunity?.slug || ''
  };
};

const serializeFloorPlanDraft = (draft, fallbackCompanyId, floorPlanId, fallbackCommunityId) => ({
  id: toStringId(draft?._id),
  companyId: toStringId(draft?.companyId || fallbackCompanyId),
  floorPlanId: toStringId(draft?.floorPlanId || floorPlanId),
  communityId: toStringId(draft?.communityId || fallbackCommunityId),
  isIncluded: draft ? Boolean(draft.isIncluded) : true,
  displayNameOverride: draft?.displayNameOverride || '',
  descriptionOverride: draft?.descriptionOverride || '',
  primaryImage: serializeImageMeta(draft?.primaryImage),
  sortOrder: toNumberOr(draft?.sortOrder, 0)
});

const resolveFloorPlanCommunityId = (floorPlan, allowedCommunityIdSet) => {
  const candidates = Array.isArray(floorPlan?.communities) ? floorPlan.communities : [];
  const match = candidates.find((id) => allowedCommunityIdSet.has(toStringId(id)));
  return match || null;
};

async function ensureBuilderProfileDraft(company) {
  const companyId = company?._id;
  const initialSlug = slugify(company?.slug || company?.name || '');

  const draft = await BrzBuilderProfileDraft.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        builderSlug: initialSlug,
        shortDescription: '',
        longDescription: '',
        heroImage: null,
        ctaLinks: {}
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (!draft.builderSlug) {
    draft.builderSlug = initialSlug;
    await draft.save();
  }

  return draft;
}

async function ensureCommunityDrafts(companyId, communities) {
  if (!Array.isArray(communities) || communities.length === 0) return;

  await BrzCommunityDraft.bulkWrite(
    communities.map((community) => ({
      updateOne: {
        filter: { companyId, communityId: community._id },
        update: {
          $setOnInsert: {
            companyId,
            communityId: community._id,
            isIncluded: true,
            descriptionOverride: '',
            heroImage: null,
            sortOrder: 0
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
}

async function ensureFloorPlanDrafts(companyId, floorPlans, allowedCommunityIdSet) {
  if (!Array.isArray(floorPlans) || floorPlans.length === 0) return;

  await BrzFloorPlanDraft.bulkWrite(
    floorPlans.map((floorPlan) => {
      const defaultCommunityId = resolveFloorPlanCommunityId(floorPlan, allowedCommunityIdSet);
      return {
        updateOne: {
          filter: { companyId, floorPlanId: floorPlan._id },
          update: {
            $setOnInsert: {
              companyId,
              floorPlanId: floorPlan._id,
              communityId: defaultCommunityId,
              isIncluded: true,
              descriptionOverride: '',
              primaryImage: null,
              sortOrder: 0
            }
          },
          upsert: true
        }
      };
    }),
    { ordered: false }
  );
}

async function getPublishingContext(companyId) {
  if (!isObjectId(companyId)) {
    const err = new Error('Invalid company context');
    err.status = 400;
    throw err;
  }

  const company = await Company.findById(companyId).select('name slug').lean();
  if (!company) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }

  const communities = await Community.find({ company: company._id })
    .select('name slug city state')
    .sort({ name: 1 })
    .lean();

  const communityIdSet = new Set(communities.map((community) => toStringId(community._id)));
  const communityIds = Array.from(communityIdSet).map((id) => new mongoose.Types.ObjectId(id));

  const floorPlans = communityIds.length
    ? await FloorPlan.find({
      company: company._id,
      communities: { $in: communityIds }
    })
      .select('name planNumber specs communities')
      .sort({ name: 1 })
      .lean()
    : [];

  const profileDraft = await ensureBuilderProfileDraft(company);
  await ensureCommunityDrafts(company._id, communities);
  await ensureFloorPlanDrafts(company._id, floorPlans, communityIdSet);

  const communityDrafts = communityIds.length
    ? await BrzCommunityDraft.find({ companyId: company._id, communityId: { $in: communityIds } })
      .sort({ sortOrder: 1, updatedAt: -1 })
      .lean()
    : [];

  const floorPlanIds = floorPlans.map((floorPlan) => floorPlan._id);
  const floorPlanDrafts = floorPlanIds.length
    ? await BrzFloorPlanDraft.find({ companyId: company._id, floorPlanId: { $in: floorPlanIds } })
      .sort({ sortOrder: 1, updatedAt: -1 })
      .lean()
    : [];

  const latestSnapshot = await BrzPublishedSnapshot.findOne({ companyId: company._id })
    .sort({ publishedAt: -1, version: -1 })
    .select('builderSlug version publishedAt publishedBy')
    .lean();

  return {
    company,
    communities,
    floorPlans,
    profileDraft,
    communityDrafts,
    floorPlanDrafts,
    latestSnapshot
  };
}

async function bootstrapPublishingData({ companyId }) {
  const context = await getPublishingContext(companyId);
  const communityMap = new Map(context.communities.map((community) => [toStringId(community._id), community]));
  const communityDraftMap = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );
  const floorPlanDraftMap = new Map(
    context.floorPlanDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );

  return {
    company: serializeCompany(context.company),
    profileDraft: serializeProfileDraft(context.profileDraft, context.company),
    communities: context.communities.map((community) => ({
      community: serializeCommunity(community),
      draft: serializeCommunityDraft(
        communityDraftMap.get(toStringId(community._id)),
        context.company._id,
        community._id
      )
    })),
    floorPlans: context.floorPlans.map((floorPlan) => {
      const serializedFloorPlan = serializeFloorPlan(floorPlan, communityMap);
      const resolvedCommunityId = serializedFloorPlan.communityId || null;
      return {
        floorPlan: serializedFloorPlan,
        draft: serializeFloorPlanDraft(
          floorPlanDraftMap.get(toStringId(floorPlan._id)),
          context.company._id,
          floorPlan._id,
          resolvedCommunityId
        )
      };
    }),
    latestSnapshot: context.latestSnapshot
      ? {
        builderSlug: context.latestSnapshot.builderSlug,
        version: context.latestSnapshot.version,
        publishedAt: context.latestSnapshot.publishedAt,
        publishedBy: context.latestSnapshot.publishedBy
      }
      : null
  };
}

async function updateBuilderProfileDraft({ companyId, updates = {} }) {
  const company = await Company.findById(companyId).select('name slug').lean();
  if (!company) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }
  await ensureBuilderProfileDraft(company);

  const set = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'builderSlug')) {
    const normalized = slugify(updates.builderSlug);
    if (!normalized) {
      const err = new Error('builderSlug is required');
      err.status = 400;
      throw err;
    }
    set.builderSlug = normalized;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'displayNameOverride')) {
    set.displayNameOverride = trimString(updates.displayNameOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'shortDescription')) {
    set.shortDescription = trimString(updates.shortDescription);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'longDescription')) {
    set.longDescription = trimString(updates.longDescription);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'ctaLinks')) {
    set.ctaLinks = sanitizeCtaLinks(updates.ctaLinks);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'heroImage')) {
    set.heroImage = sanitizeImageMeta(updates.heroImage);
  }

  const draft = await BrzBuilderProfileDraft.findOneAndUpdate(
    { companyId: company._id },
    { $set: set },
    { new: true }
  ).lean();

  return serializeProfileDraft(draft, company);
}

async function updateCommunityDraft({ companyId, communityId, updates = {} }) {
  if (!isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }

  const community = await Community.findOne({ _id: communityId, company: companyId })
    .select('_id name slug city state')
    .lean();
  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }

  const set = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'isIncluded')) {
    set.isIncluded = toBoolean(updates.isIncluded, true);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'displayNameOverride')) {
    set.displayNameOverride = trimString(updates.displayNameOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'descriptionOverride')) {
    set.descriptionOverride = trimString(updates.descriptionOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'heroImage')) {
    set.heroImage = sanitizeImageMeta(updates.heroImage);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sortOrder')) {
    set.sortOrder = toNumberOr(updates.sortOrder, 0);
  }

  const draft = await BrzCommunityDraft.findOneAndUpdate(
    { companyId, communityId: community._id },
    {
      $set: set,
      $setOnInsert: {
        companyId,
        communityId: community._id,
        isIncluded: true,
        descriptionOverride: '',
        heroImage: null,
        sortOrder: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    community: serializeCommunity(community),
    draft: serializeCommunityDraft(draft, companyId, community._id)
  };
}

async function updateFloorPlanDraft({ companyId, floorPlanId, updates = {} }) {
  if (!isObjectId(floorPlanId)) {
    const err = new Error('Invalid floorPlanId');
    err.status = 400;
    throw err;
  }

  const floorPlan = await FloorPlan.findOne({ _id: floorPlanId, company: companyId })
    .select('_id name planNumber specs communities')
    .lean();
  if (!floorPlan) {
    const err = new Error('Floor plan not found');
    err.status = 404;
    throw err;
  }

  const allowedCommunityIds = Array.isArray(floorPlan.communities)
    ? floorPlan.communities.map((id) => toStringId(id))
    : [];
  const allowedCommunitySet = new Set(allowedCommunityIds);

  let communityId = updates.communityId;
  if (communityId != null && !isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }
  if (communityId && !allowedCommunitySet.has(toStringId(communityId))) {
    const err = new Error('communityId is not linked to floor plan');
    err.status = 400;
    throw err;
  }
  if (!communityId) {
    communityId = resolveFloorPlanCommunityId(floorPlan, allowedCommunitySet);
  }
  if (!communityId) {
    const err = new Error('Floor plan must be linked to a community');
    err.status = 400;
    throw err;
  }

  const set = { communityId };
  if (Object.prototype.hasOwnProperty.call(updates, 'isIncluded')) {
    set.isIncluded = toBoolean(updates.isIncluded, true);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'displayNameOverride')) {
    set.displayNameOverride = trimString(updates.displayNameOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'descriptionOverride')) {
    set.descriptionOverride = trimString(updates.descriptionOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'primaryImage')) {
    set.primaryImage = sanitizeImageMeta(updates.primaryImage);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sortOrder')) {
    set.sortOrder = toNumberOr(updates.sortOrder, 0);
  }

  const draft = await BrzFloorPlanDraft.findOneAndUpdate(
    { companyId, floorPlanId: floorPlan._id },
    {
      $set: set,
      $setOnInsert: {
        companyId,
        floorPlanId: floorPlan._id,
        communityId,
        isIncluded: true,
        descriptionOverride: '',
        primaryImage: null,
        sortOrder: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const community = await Community.findById(draft.communityId).select('_id name slug').lean();
  const communityMap = new Map([[toStringId(community?._id), community]]);

  return {
    floorPlan: serializeFloorPlan(floorPlan, communityMap),
    draft: serializeFloorPlanDraft(draft, companyId, floorPlan._id, draft.communityId)
  };
}

async function publishCompanySnapshot({ companyId, publishedBy }) {
  const context = await getPublishingContext(companyId);

  const company = context.company;
  const profileDraft = context.profileDraft;
  const builderSlug = slugify(profileDraft?.builderSlug || company?.slug || company?.name || '');
  if (!builderSlug) {
    const err = new Error('Unable to resolve builder slug');
    err.status = 400;
    throw err;
  }

  if (profileDraft.builderSlug !== builderSlug) {
    await BrzBuilderProfileDraft.updateOne(
      { _id: profileDraft._id },
      { $set: { builderSlug } }
    );
    profileDraft.builderSlug = builderSlug;
  }

  const communityById = new Map(context.communities.map((community) => [toStringId(community._id), community]));
  const communityDraftById = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );

  const includedCommunities = context.communities
    .map((community) => {
      const draft = communityDraftById.get(toStringId(community._id));
      return { community, draft };
    })
    .filter((entry) => entry.draft && entry.draft.isIncluded);

  const includedCommunityIdSet = new Set(
    includedCommunities.map((entry) => toStringId(entry.community._id))
  );

  const payloadCommunities = includedCommunities
    .map(({ community, draft }) => ({
      id: toStringId(community._id),
      name: trimString(draft.displayNameOverride) || community.name || '',
      slug: community.slug || slugify(community.name || ''),
      description: trimString(draft.descriptionOverride) || '',
      heroImage: serializeImageMeta(draft.heroImage),
      sortOrder: toNumberOr(draft.sortOrder, 0)
    }))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));

  const floorPlanDraftById = new Map(
    context.floorPlanDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );

  const payloadFloorPlans = context.floorPlans
    .map((floorPlan) => {
      const draft = floorPlanDraftById.get(toStringId(floorPlan._id));
      if (!draft || !draft.isIncluded) return null;

      const draftCommunityId = toStringId(draft.communityId);
      let resolvedCommunityId = draftCommunityId;
      if (!includedCommunityIdSet.has(resolvedCommunityId)) {
        const fallbackId = resolveFloorPlanCommunityId(floorPlan, includedCommunityIdSet);
        resolvedCommunityId = toStringId(fallbackId);
      }
      if (!includedCommunityIdSet.has(resolvedCommunityId)) return null;

      const community = communityById.get(resolvedCommunityId);
      const specs = floorPlan?.specs || {};
      return {
        id: toStringId(floorPlan._id),
        name: trimString(draft.displayNameOverride) || floorPlan.name || '',
        description: trimString(draft.descriptionOverride) || '',
        beds: toNumberOr(specs.beds, null),
        baths: toNumberOr(specs.baths, null),
        sqft: toNumberOr(specs.squareFeet, null),
        primaryImage: serializeImageMeta(draft.primaryImage),
        communityId: resolvedCommunityId,
        communityName: community?.name || '',
        sortOrder: toNumberOr(draft.sortOrder, 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));

  const payload = {
    builder: {
      name: trimString(profileDraft.displayNameOverride) || company.name || '',
      slug: builderSlug,
      descriptions: {
        short: trimString(profileDraft.shortDescription),
        long: trimString(profileDraft.longDescription)
      },
      heroImage: serializeImageMeta(profileDraft.heroImage),
      ctaLinks: sanitizeCtaLinks(profileDraft.ctaLinks || {})
    },
    communities: payloadCommunities,
    floorPlans: payloadFloorPlans
  };

  const lastSnapshot = await BrzPublishedSnapshot.findOne({ builderSlug })
    .sort({ version: -1 })
    .select('version')
    .lean();
  const nextVersion = (lastSnapshot?.version || 0) + 1;

  const snapshot = await BrzPublishedSnapshot.create({
    companyId: company._id,
    builderSlug,
    version: nextVersion,
    publishedAt: new Date(),
    publishedBy: isObjectId(publishedBy) ? publishedBy : null,
    payload
  });

  return {
    ok: true,
    builderSlug,
    version: snapshot.version,
    publishedAt: snapshot.publishedAt
  };
}

module.exports = {
  bootstrapPublishingData,
  updateBuilderProfileDraft,
  updateCommunityDraft,
  updateFloorPlanDraft,
  publishCompanySnapshot,
  sanitizeImageMeta
};
