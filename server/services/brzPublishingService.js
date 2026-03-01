const mongoose = require('mongoose');
const Company = require('../models/Company');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const BrzBuilderProfileDraft = require('../models/brz/BrzBuilderProfileDraft');
const BrzCommunityDraft = require('../models/brz/BrzCommunityDraft');
const BrzFloorPlanDraft = require('../models/brz/BrzFloorPlanDraft');
const BrzCommunityFloorPlanDraft = require('../models/brz/BrzCommunityFloorPlanDraft');
const slugify = require('../utils/slugify');
const { publishBundleToBuildRootz } = require('./buildrootzPublishClient');
const {
  competitionProfileToWebData,
  mergeCompetitionWebData,
  competitionWebDataToProfileSet,
  computeCommunityCompleteness
} = require('./communityWebDataService');
const {
  normalizeHomeAddress,
  normalizeHomeGeo,
  normalizeHomeFacts,
  normalizeHomePricing
} = require('./brzInventoryNormalize');

/*
BuildRootz integration note:
BuildRootz publish flow should send canonical KeepUp bundle payloads to
/internal/publish/keepup/bundle using internal auth.
Community web fields are canonical in CommunityCompetitionProfile.webData.
Listings should inherit/display these fields and should not persist copies.

Smoke test plan:
1. Open /admin/buildrootz/publishing as COMPANY_ADMIN.
2. Confirm bootstrap creates missing drafts and returns competition profile web data per community.
3. Edit community web fields in Competition form and confirm BRZ Publishing reflects those values.
4. Edit community web fields in BRZ Publishing and confirm Competition form reflects those values.
5. Publish and verify /public/brz/builders/:slug includes only public-safe fields and include rules.
6. Edit floor plan base price (BRZ), save, and confirm basePriceAsOf updates.
7. Publish with only plan default price and confirm communities inherit fallback where no override exists.
8. Set a community-specific plan price, publish, and confirm that community uses override price.
9. Set community price visibility hidden and confirm fallback/omission rules.
10. Use the same plan in multiple communities with different community prices and confirm each community payload differs.
11. Set builder pricing disclaimer and confirm it appears in payload.builder.pricingDisclaimer.
12. Edit drafts/canonical fields after publish and confirm public payload is unchanged until republish.
*/

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const toStringId = (value) => (value == null ? '' : String(value));

const trimString = (value) => (value == null ? '' : String(value).trim());

const toNumberOr = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

const looksLikePdf = (url) => /\.pdf($|\?)/i.test(String(url || '').trim());

const resolveFloorPlanUploadedPreviewUrl = (floorPlan) => {
  const primaryPreview = trimString(floorPlan?.asset?.previewUrl);
  if (primaryPreview && !looksLikePdf(primaryPreview)) return primaryPreview;

  const primaryFile = trimString(floorPlan?.asset?.fileUrl);
  if (primaryFile && !looksLikePdf(primaryFile)) return primaryFile;

  return '';
};

const serializeCompany = (company) => ({
  id: toStringId(company?._id),
  name: company?.name || '',
  slug: company?.slug || ''
});

const serializeProfileDraft = (draft, company) => {
  const defaultSlug = slugify(draft?.builderSlug || company?.slug || company?.name || '');
  const baseWebsite = trimString(company?.buildrootzProfile?.websiteUrl);
  const baseShortDescription = trimString(company?.buildrootzProfile?.description);
  const draftCtaLinks = sanitizeCtaLinks(draft?.ctaLinks || {});
  if (!trimString(draftCtaLinks.website) && baseWebsite) {
    draftCtaLinks.website = baseWebsite;
  }

  return {
    id: toStringId(draft?._id),
    companyId: toStringId(draft?.companyId || company?._id),
    builderSlug: defaultSlug,
    displayNameOverride: draft?.displayNameOverride || '',
    shortDescription: trimString(draft?.shortDescription) || baseShortDescription,
    longDescription: draft?.longDescription || '',
    heroImage: serializeImageMeta(draft?.heroImage),
    ctaLinks: draftCtaLinks,
    pricingDisclaimer: trimString(draft?.pricingDisclaimer)
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
  sortOrder: toNumberOr(draft?.sortOrder, 0),
  draftSyncedAt: parseDateOrNull(draft?.draftSyncedAt),
  draftSyncedFrom: trimString(draft?.draftSyncedFrom),
  competitionWebData: draft?.competitionWebData && typeof draft.competitionWebData === 'object'
    ? draft.competitionWebData
    : null,
  competitionPromotion: trimString(draft?.competitionPromotion)
});

const getCompetitionWebDataUpdatedAt = (profile) =>
  parseDateOrNull(profile?.webDataUpdatedAt || profile?.updatedAt || null);

const isCommunityDraftOutOfDate = ({ webDataUpdatedAt, draftSyncedAt }) => {
  if (!webDataUpdatedAt) return false;
  if (!draftSyncedAt) return true;
  return webDataUpdatedAt.getTime() > draftSyncedAt.getTime();
};

const runWithConcurrencyLimit = async ({ items = [], limit = 5, worker }) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const maxConcurrency = Math.max(1, Number(limit) || 1);
  const results = new Array(list.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < list.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(list[current], current);
    }
  };

  const workers = Array.from(
    { length: Math.min(maxConcurrency, list.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
};

const extractSyncableCompetitionFields = (webData) => {
  const normalized = competitionProfileToWebData({ webData: webData || {} });
  return {
    primaryContact: { ...normalized.primaryContact },
    contactVisibility: { ...normalized.contactVisibility },
    modelListingId: normalized.modelListingId,
    modelFloorPlanId: normalized.modelFloorPlanId,
    totalLots: normalized.totalLots,
    schools: { ...normalized.schools },
    hoa: { ...normalized.hoa },
    hasPID: normalized.hasPID,
    hasMUD: normalized.hasMUD,
    earnestMoney: { ...normalized.earnestMoney },
    realtorCommission: { ...normalized.realtorCommission },
    notesInternal: normalized.notesInternal
  };
};

const serializeCompetitionProfileWebData = (profile, community) =>
  competitionProfileToWebData(profile, community);

const isModelListingStatus = (lot) => {
  const status = trimString(lot?.generalStatus || lot?.status).toLowerCase();
  return status === 'model' || status.includes('model');
};

const serializeCommunityModelListings = (community, floorPlanNameById) => {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  return lots
    .filter((lot) => isModelListingStatus(lot))
    .map((lot) => {
      const listingId = toStringId(lot?._id);
      if (!listingId) return null;
      const floorPlanId = toStringId(lot?.floorPlan);
      const floorPlanName = floorPlanNameById.get(floorPlanId) || '';
      const label = [
        trimString(lot?.address),
        trimString(lot?.lot) ? `Lot ${trimString(lot?.lot)}` : '',
        trimString(lot?.block) ? `Block ${trimString(lot?.block)}` : '',
        floorPlanName ? `Plan ${floorPlanName}` : ''
      ]
        .filter(Boolean)
        .join(' | ');
      return {
        listingId,
        address: trimString(lot?.address),
        lot: trimString(lot?.lot),
        block: trimString(lot?.block),
        floorPlanId: floorPlanId || '',
        floorPlanName,
        label: label || listingId
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
};

const isLotMarkedForBuildrootzPublish = (lot) => {
  if (!lot?.buildrootz || !Object.prototype.hasOwnProperty.call(lot.buildrootz, 'isPublished')) {
    return false;
  }
  return toBoolean(lot.buildrootz.isPublished, false);
};

const serializeCommunityInventoryLots = (community, floorPlanNameById) => {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  return lots
    .map((lot) => {
      const lotId = toStringId(lot?._id);
      if (!lotId) return null;
      const floorPlanId = toStringId(lot?.floorPlan);
      const floorPlanName = floorPlanNameById.get(floorPlanId) || '';
      return {
        id: lotId,
        address: trimString(lot?.address),
        lot: trimString(lot?.lot),
        block: trimString(lot?.block),
        status: trimString(lot?.generalStatus || lot?.status || lot?.buildingStatus || 'Available'),
        listPrice: toNullableNumber(lot?.listPrice),
        salesPrice: toNullableNumber(lot?.salesPrice),
        floorPlanId,
        floorPlanName,
        isPublished: isLotMarkedForBuildrootzPublish(lot)
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const labelA = [a.address, a.lot ? `Lot ${a.lot}` : '', a.block ? `Block ${a.block}` : '']
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      const labelB = [b.address, b.lot ? `Lot ${b.lot}` : '', b.block ? `Block ${b.block}` : '']
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      return labelA.localeCompare(labelB);
    });
};

const serializeCommunityListingOptions = (community, floorPlanNameById) => {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  return lots
    .map((lot) => {
      const lotId = toStringId(lot?._id);
      if (!lotId) return null;
      const floorPlanId = toStringId(lot?.floorPlan);
      const floorPlanName = floorPlanNameById.get(floorPlanId) || '';
      const lotLabel = [
        trimString(lot?.address),
        trimString(lot?.lot) ? `Lot ${trimString(lot?.lot)}` : '',
        trimString(lot?.block) ? `Block ${trimString(lot?.block)}` : '',
        floorPlanName ? `Plan ${floorPlanName}` : ''
      ]
        .filter(Boolean)
        .join(' | ');
      return {
        id: lotId,
        address: trimString(lot?.address),
        lot: trimString(lot?.lot),
        block: trimString(lot?.block),
        floorPlanId: floorPlanId || '',
        floorPlanName,
        label: lotLabel || lotId
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
};

const serializeCommunityFloorPlanOptions = (communityId, floorPlans) =>
  floorPlans
    .filter((floorPlan) => Array.isArray(floorPlan?.communities)
      && floorPlan.communities.some((id) => toStringId(id) === toStringId(communityId)))
    .map((floorPlan) => ({
      id: toStringId(floorPlan._id),
      name: trimString(floorPlan.name),
      planNumber: trimString(floorPlan.planNumber),
      label: [trimString(floorPlan.planNumber), trimString(floorPlan.name)].filter(Boolean).join(' - ') || trimString(floorPlan.name) || 'Floor Plan'
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const serializeFloorPlan = (floorPlan, communityMap) => {
  const floorPlanCommunityIds = Array.isArray(floorPlan?.communities)
    ? floorPlan.communities.map((id) => toStringId(id))
    : [];
  const linkedCommunityIds = floorPlanCommunityIds.filter((id) => communityMap.has(id));
  const linkedCommunityId = linkedCommunityIds[0] || '';
  const linkedCommunity = linkedCommunityId ? communityMap.get(linkedCommunityId) : null;
  const linkedCommunities = linkedCommunityIds
    .map((id) => communityMap.get(id))
    .filter(Boolean)
    .map((community) => ({
      id: toStringId(community._id),
      name: community.name || '',
      slug: community.slug || ''
    }));
  const uploadedPreviewUrl = resolveFloorPlanUploadedPreviewUrl(floorPlan);
  return {
    id: toStringId(floorPlan?._id),
    name: floorPlan?.name || '',
    planNumber: floorPlan?.planNumber || '',
    beds: toNumberOr(floorPlan?.specs?.beds, null),
    baths: toNumberOr(floorPlan?.specs?.baths, null),
    sqft: toNumberOr(floorPlan?.specs?.squareFeet, null),
    communityId: linkedCommunityId,
    communityName: linkedCommunity?.name || '',
    communitySlug: linkedCommunity?.slug || '',
    linkedCommunityIds,
    linkedCommunities,
    uploadedPreviewUrl
  };
};

const serializeFloorPlanDraft = (draft, fallbackCompanyId, floorPlanId) => ({
  id: toStringId(draft?._id),
  companyId: toStringId(draft?.companyId || fallbackCompanyId),
  floorPlanId: toStringId(draft?.floorPlanId || floorPlanId),
  communityId: toStringId(draft?.communityId || ''),
  isIncluded: draft ? Boolean(draft.isIncluded) : true,
  displayNameOverride: draft?.displayNameOverride || '',
  descriptionOverride: draft?.descriptionOverride || '',
  primaryImage: serializeImageMeta(draft?.primaryImage),
  sortOrder: toNumberOr(draft?.sortOrder, 0),
  basePriceFrom: toNullableNumber(draft?.basePriceFrom),
  basePriceAsOf: parseDateOrNull(draft?.basePriceAsOf),
  basePriceVisibility: ['hidden', 'public'].includes(trimString(draft?.basePriceVisibility))
    ? trimString(draft?.basePriceVisibility)
    : 'public',
  basePriceNotesInternal: draft?.basePriceNotesInternal || ''
});

const serializeCommunityFloorPlanDraft = (
  draft,
  fallbackCompanyId,
  communityId,
  floorPlanId
) => ({
  id: toStringId(draft?._id),
  companyId: toStringId(draft?.companyId || fallbackCompanyId),
  communityId: toStringId(draft?.communityId || communityId),
  floorPlanId: toStringId(draft?.floorPlanId || floorPlanId),
  isIncluded: draft ? Boolean(draft.isIncluded) : true,
  basePriceFrom: toNullableNumber(draft?.basePriceFrom),
  basePriceAsOf: parseDateOrNull(draft?.basePriceAsOf),
  basePriceVisibility: ['hidden', 'public'].includes(trimString(draft?.basePriceVisibility))
    ? trimString(draft?.basePriceVisibility)
    : 'public',
  basePriceNotesInternal: draft?.basePriceNotesInternal || '',
  descriptionOverride: draft?.descriptionOverride || '',
  primaryImageOverride: serializeImageMeta(draft?.primaryImageOverride),
  sortOrder: toNumberOr(draft?.sortOrder, 0)
});

const toCommunityFloorPlanKey = (communityId, floorPlanId) =>
  `${toStringId(communityId)}:${toStringId(floorPlanId)}`;

const normalizePriceVisibility = (value, fallback = 'public') => {
  const visibility = trimString(value).toLowerCase();
  return ['hidden', 'public'].includes(visibility) ? visibility : fallback;
};

const collectCommunityLotFloorPlanIds = (communities) => {
  const ids = new Set();
  (Array.isArray(communities) ? communities : []).forEach((community) => {
    const lots = Array.isArray(community?.lots) ? community.lots : [];
    lots.forEach((lot) => {
      const floorPlanId = toStringId(lot?.floorPlan);
      if (isObjectId(floorPlanId)) ids.add(floorPlanId);
    });
  });
  return Array.from(ids);
};

const buildCommunityOfferedFloorPlanIds = ({ communities = [], floorPlans = [] }) => {
  const floorPlanIds = new Set(floorPlans.map((floorPlan) => toStringId(floorPlan?._id)));
  const communityIds = new Set(communities.map((community) => toStringId(community?._id)));
  const linkedByCommunity = new Map();

  floorPlans.forEach((floorPlan) => {
    const floorPlanId = toStringId(floorPlan?._id);
    if (!floorPlanId) return;
    const linkedCommunityIds = Array.isArray(floorPlan?.communities) ? floorPlan.communities : [];
    linkedCommunityIds.forEach((communityId) => {
      const key = toStringId(communityId);
      if (!key || !communityIds.has(key)) return;
      if (!linkedByCommunity.has(key)) linkedByCommunity.set(key, new Set());
      linkedByCommunity.get(key).add(floorPlanId);
    });
  });

  const offeredByCommunity = new Map();
  communities.forEach((community) => {
    const communityId = toStringId(community?._id);
    if (!communityId) return;

    const linkedIds = Array.from(linkedByCommunity.get(communityId) || []);
    if (linkedIds.length) {
      offeredByCommunity.set(communityId, linkedIds);
      return;
    }

    const lots = Array.isArray(community?.lots) ? community.lots : [];
    const inferred = new Set();
    lots.forEach((lot) => {
      const floorPlanId = toStringId(lot?.floorPlan);
      if (!floorPlanId || !floorPlanIds.has(floorPlanId)) return;
      inferred.add(floorPlanId);
    });
    offeredByCommunity.set(communityId, Array.from(inferred));
  });

  return offeredByCommunity;
};

async function ensureBuilderProfileDraft(company) {
  const companyId = company?._id;
  const initialSlug = slugify(company?.slug || company?.name || '');
  const baseWebsite = trimString(company?.buildrootzProfile?.websiteUrl);
  const baseShortDescription = trimString(company?.buildrootzProfile?.description);

  const draft = await BrzBuilderProfileDraft.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        builderSlug: initialSlug,
        shortDescription: baseShortDescription,
        longDescription: '',
        heroImage: null,
        ctaLinks: baseWebsite ? { website: baseWebsite } : {},
        pricingDisclaimer: ''
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
            sortOrder: 0,
            competitionWebData: null,
            competitionPromotion: '',
            draftSyncedAt: null,
            draftSyncedFrom: null
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
}

async function ensureFloorPlanDrafts(companyId, floorPlans) {
  if (!Array.isArray(floorPlans) || floorPlans.length === 0) return;

  await BrzFloorPlanDraft.bulkWrite(
    floorPlans.map((floorPlan) => ({
      updateOne: {
        filter: { companyId, floorPlanId: floorPlan._id },
        update: {
          $setOnInsert: {
            companyId,
            floorPlanId: floorPlan._id,
            isIncluded: true,
            descriptionOverride: '',
            primaryImage: null,
            sortOrder: 0,
            basePriceFrom: null,
            basePriceAsOf: null,
            basePriceVisibility: 'public',
            basePriceNotesInternal: ''
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
}

async function ensureCommunityFloorPlanDrafts(companyId, offeredFloorPlanIdsByCommunity) {
  const operations = [];
  (offeredFloorPlanIdsByCommunity || new Map()).forEach((floorPlanIds, communityId) => {
    (Array.isArray(floorPlanIds) ? floorPlanIds : []).forEach((floorPlanId) => {
      if (!isObjectId(communityId) || !isObjectId(floorPlanId)) return;
      operations.push({
        updateOne: {
          filter: { companyId, communityId, floorPlanId },
          update: {
            $setOnInsert: {
              companyId,
              communityId,
              floorPlanId,
              isIncluded: true,
              basePriceFrom: null,
              basePriceAsOf: null,
              basePriceVisibility: 'public',
              basePriceNotesInternal: '',
              descriptionOverride: '',
              primaryImageOverride: null,
              sortOrder: 0
            }
          },
          upsert: true
        }
      });
    });
  });

  if (!operations.length) return;
  await BrzCommunityFloorPlanDraft.bulkWrite(operations, { ordered: false });
}

async function getPublishingContext(companyId) {
  if (!isObjectId(companyId)) {
    const err = new Error('Invalid company context');
    err.status = 400;
    throw err;
  }

  const company = await Company.findById(companyId)
    .select(
      'name slug branding buildrootzProfile '
      + 'buildrootzPublishLastAt buildrootzPublishLastStatus buildrootzPublishLastMessage '
      + 'buildrootzPublishLastCounts buildrootzPublishLastWarnings '
      + 'buildrootzPackagePublishLastAt buildrootzPackagePublishLastStatus buildrootzPackagePublishLastMessage '
      + 'buildrootzPackagePublishLastCounts buildrootzPackagePublishLastWarnings '
      + 'buildrootzInventoryPublishLastAt buildrootzInventoryPublishLastStatus buildrootzInventoryPublishLastMessage '
      + 'buildrootzInventoryPublishLastCounts buildrootzInventoryPublishLastWarnings'
    )
    .lean();
  if (!company) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }

  const communities = await Community.find({ company: company._id })
    .select(
      'name slug city state totalLots buildrootz '
      + 'lots._id lots.address lots.address1 lots.address2 lots.addressLine1 lots.addressLine2 lots.line1 lots.line2 '
      + 'lots.street lots.streetAddress lots.streetName lots.streetNumber lots.houseNumber '
      + 'lots.city lots.state lots.zip lots.postal lots.postalCode '
      + 'lots.lot lots.block lots.floorPlan '
      + 'lots.buildrootz '
      + 'lots.generalStatus lots.status lots.buildingStatus lots.isPublished lots.isListed '
      + 'lots.listPrice lots.salesPrice lots.latitude lots.longitude '
      + 'lots.beds lots.baths lots.bedrooms lots.bathrooms lots.sqft lots.squareFeet lots.sqFeet '
      + 'lots.garage lots.garageSpaces lots.stories '
      + 'lots.heroImage lots.listingPhotos lots.liveElevationPhoto lots.publishedAt'
    )
    .sort({ name: 1 })
    .lean();

  const communityIdSet = new Set(communities.map((community) => toStringId(community._id)));
  const communityIds = Array.from(communityIdSet).map((id) => new mongoose.Types.ObjectId(id));
  const lotFloorPlanIds = collectCommunityLotFloorPlanIds(communities)
    .map((id) => new mongoose.Types.ObjectId(id));

  const floorPlanQuery = { company: company._id };
  const floorPlanOr = [];
  if (communityIds.length) {
    floorPlanOr.push({ communities: { $in: communityIds } });
  }
  if (lotFloorPlanIds.length) {
    floorPlanOr.push({ _id: { $in: lotFloorPlanIds } });
  }
  if (floorPlanOr.length) {
    floorPlanQuery.$or = floorPlanOr;
  }

  const floorPlans = floorPlanOr.length
    ? await FloorPlan.find(floorPlanQuery)
      .select('name planNumber websiteSlug websiteUrl specs communities asset.previewUrl asset.fileUrl')
      .sort({ name: 1 })
      .lean()
    : [];

  const competitionProfiles = communityIds.length
    ? await CommunityCompetitionProfile.find({
      company: company._id,
      community: { $in: communityIds }
    })
      .select('community webData webDataUpdatedAt updatedAt promotion salesPerson salesPersonPhone salesPersonEmail elementarySchool middleSchool highSchool hoaFee hoaFrequency feeTypes mudFee pidFee earnestAmount realtorCommission')
      .lean()
    : [];

  const profileDraft = await ensureBuilderProfileDraft(company);
  await ensureCommunityDrafts(company._id, communities);
  await ensureFloorPlanDrafts(company._id, floorPlans);
  const offeredFloorPlanIdsByCommunity = buildCommunityOfferedFloorPlanIds({ communities, floorPlans });
  await ensureCommunityFloorPlanDrafts(company._id, offeredFloorPlanIdsByCommunity);

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

  const communityFloorPlanDrafts = (communityIds.length && floorPlanIds.length)
    ? await BrzCommunityFloorPlanDraft.find({
      companyId: company._id,
      communityId: { $in: communityIds },
      floorPlanId: { $in: floorPlanIds }
    })
      .sort({ sortOrder: 1, updatedAt: -1 })
      .lean()
    : [];

  const latestSnapshot = company?.buildrootzPublishLastAt
    ? {
      publishedAt: company.buildrootzPublishLastAt,
      status: trimString(company.buildrootzPublishLastStatus),
      message: trimString(company.buildrootzPublishLastMessage),
      counts: company.buildrootzPublishLastCounts || null,
      warnings: Array.isArray(company.buildrootzPublishLastWarnings)
        ? company.buildrootzPublishLastWarnings
        : []
    }
    : null;

  const latestPackageSnapshot = company?.buildrootzPackagePublishLastAt
    ? {
      publishedAt: company.buildrootzPackagePublishLastAt,
      status: trimString(company.buildrootzPackagePublishLastStatus),
      message: trimString(company.buildrootzPackagePublishLastMessage),
      counts: company.buildrootzPackagePublishLastCounts || null,
      warnings: Array.isArray(company.buildrootzPackagePublishLastWarnings)
        ? company.buildrootzPackagePublishLastWarnings
        : []
    }
    : null;

  const latestInventorySnapshot = company?.buildrootzInventoryPublishLastAt
    ? {
      publishedAt: company.buildrootzInventoryPublishLastAt,
      status: trimString(company.buildrootzInventoryPublishLastStatus),
      message: trimString(company.buildrootzInventoryPublishLastMessage),
      counts: company.buildrootzInventoryPublishLastCounts || null,
      warnings: Array.isArray(company.buildrootzInventoryPublishLastWarnings)
        ? company.buildrootzInventoryPublishLastWarnings
        : []
    }
    : null;

  return {
    company,
    communities,
    floorPlans,
    profileDraft,
    communityDrafts,
    floorPlanDrafts,
    communityFloorPlanDrafts,
    competitionProfiles,
    offeredFloorPlanIdsByCommunity,
    latestSnapshot,
    latestPackageSnapshot,
    latestInventorySnapshot
  };
}

async function bootstrapPublishingData({ companyId }) {
  const context = await getPublishingContext(companyId);
  const communityMap = new Map(context.communities.map((community) => [toStringId(community._id), community]));
  const communityDraftMap = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );
  const competitionProfileMap = new Map(
    (context.competitionProfiles || []).map((profile) => [toStringId(profile.community), profile])
  );
  const floorPlanDraftMap = new Map(
    context.floorPlanDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );
  const floorPlanMap = new Map(
    context.floorPlans.map((floorPlan) => [toStringId(floorPlan._id), floorPlan])
  );
  const communityFloorPlanDraftMap = new Map(
    context.communityFloorPlanDrafts.map((draft) => [
      toCommunityFloorPlanKey(draft.communityId, draft.floorPlanId),
      draft
    ])
  );
  const floorPlanNameById = new Map(
    context.floorPlans.map((floorPlan) => [toStringId(floorPlan._id), trimString(floorPlan.name || floorPlan.planNumber)])
  );

  const serializedCommunities = context.communities.map((community) => {
    const communityId = toStringId(community._id);
    const competitionProfile = competitionProfileMap.get(communityId);
    const draft = serializeCommunityDraft(
      communityDraftMap.get(communityId),
      context.company._id,
      community._id
    );
    const competitionProfileWebData = serializeCompetitionProfileWebData(
      competitionProfile,
      community
    );
    const modelListings = serializeCommunityModelListings(community, floorPlanNameById);
    const inventoryLots = serializeCommunityInventoryLots(community, floorPlanNameById);
    const planOfferingIds = context.offeredFloorPlanIdsByCommunity.get(communityId) || [];
    const planOfferings = planOfferingIds
      .map((floorPlanId) => {
        const floorPlan = floorPlanMap.get(toStringId(floorPlanId));
        if (!floorPlan) return null;
        const serializedFloorPlan = serializeFloorPlan(floorPlan, communityMap);
        const planDraftDoc = floorPlanDraftMap.get(toStringId(floorPlan._id));
        const communityPlanDraftDoc = communityFloorPlanDraftMap.get(
          toCommunityFloorPlanKey(communityId, floorPlan._id)
        );
        return {
          floorPlan: serializedFloorPlan,
          planDraft: serializeFloorPlanDraft(
            planDraftDoc,
            context.company._id,
            floorPlan._id
          ),
          communityPlanDraft: serializeCommunityFloorPlanDraft(
            communityPlanDraftDoc,
            context.company._id,
            community._id,
            floorPlan._id
          )
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const sortA = toNumberOr(a.communityPlanDraft?.sortOrder, 0);
        const sortB = toNumberOr(b.communityPlanDraft?.sortOrder, 0);
        if (sortA !== sortB) return sortA - sortB;
        return trimString(a.floorPlan?.name).localeCompare(trimString(b.floorPlan?.name));
      });

    const webDataUpdatedAt = getCompetitionWebDataUpdatedAt(competitionProfile);
    const draftSyncedAt = parseDateOrNull(draft?.draftSyncedAt);
    const outOfDate = isCommunityDraftOutOfDate({ webDataUpdatedAt, draftSyncedAt });

    return {
      community: serializeCommunity(community),
      draft,
      competitionProfileWebData,
      modelListings,
      completeness: computeCommunityCompleteness({
        webData: competitionProfileWebData,
        communityDraft: draft,
        modelListings
      }),
      inventoryLots,
      listingOptions: serializeCommunityListingOptions(community, floorPlanNameById),
      floorPlanOptions: serializeCommunityFloorPlanOptions(community._id, context.floorPlans),
      planOfferings,
      hasCompetitionProfile: Boolean(competitionProfile),
      webDataUpdatedAt,
      draftSyncedAt,
      outOfDate
    };
  });

  const outOfDateCommunitiesCount = serializedCommunities.reduce(
    (count, entry) => (entry.outOfDate ? count + 1 : count),
    0
  );

  return {
    company: serializeCompany(context.company),
    profileDraft: serializeProfileDraft(context.profileDraft, context.company),
    communities: serializedCommunities,
    outOfDateCommunitiesCount,
    floorPlans: context.floorPlans.map((floorPlan) => {
      return {
        floorPlan: serializeFloorPlan(floorPlan, communityMap),
        draft: serializeFloorPlanDraft(
          floorPlanDraftMap.get(toStringId(floorPlan._id)),
          context.company._id,
          floorPlan._id
        )
      };
    }),
    latestSnapshot: context.latestSnapshot
      ? {
        publishedAt: context.latestSnapshot.publishedAt,
        status: context.latestSnapshot.status || '',
        message: context.latestSnapshot.message || '',
        counts: context.latestSnapshot.counts || null,
        warnings: Array.isArray(context.latestSnapshot.warnings)
          ? context.latestSnapshot.warnings
          : []
      }
      : null,
    latestPackageSnapshot: context.latestPackageSnapshot
      ? {
        publishedAt: context.latestPackageSnapshot.publishedAt,
        status: context.latestPackageSnapshot.status || '',
        message: context.latestPackageSnapshot.message || '',
        counts: context.latestPackageSnapshot.counts || null,
        warnings: Array.isArray(context.latestPackageSnapshot.warnings)
          ? context.latestPackageSnapshot.warnings
          : []
      }
      : null,
    latestInventorySnapshot: context.latestInventorySnapshot
      ? {
        publishedAt: context.latestInventorySnapshot.publishedAt,
        status: context.latestInventorySnapshot.status || '',
        message: context.latestInventorySnapshot.message || '',
        counts: context.latestInventorySnapshot.counts || null,
        warnings: Array.isArray(context.latestInventorySnapshot.warnings)
          ? context.latestInventorySnapshot.warnings
          : []
      }
      : null
  };
}

async function updateBuilderProfileDraft({ companyId, updates = {} }) {
  const company = await Company.findById(companyId).select('name slug buildrootzProfile').lean();
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
  if (Object.prototype.hasOwnProperty.call(updates, 'pricingDisclaimer')) {
    set.pricingDisclaimer = trimString(updates.pricingDisclaimer);
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

  const setOnInsert = {
    companyId,
    communityId: community._id,
    isIncluded: true,
    descriptionOverride: '',
    heroImage: null,
    sortOrder: 0,
    competitionWebData: null,
    competitionPromotion: '',
    draftSyncedAt: null,
    draftSyncedFrom: null
  };
  Object.keys(set).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(setOnInsert, key)) {
      delete setOnInsert[key];
    }
  });

  const draft = await BrzCommunityDraft.findOneAndUpdate(
    { companyId, communityId: community._id },
    {
      $set: set,
      $setOnInsert: setOnInsert
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    community: serializeCommunity(community),
    draft: serializeCommunityDraft(draft, companyId, community._id)
  };
}

async function updateCommunityWebData({ companyId, communityId, updates = {} }) {
  if (!isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }

  const community = await Community.findOne({ _id: communityId, company: companyId })
    .select('_id name slug city state totalLots lots._id lots.address lots.lot lots.block lots.floorPlan lots.generalStatus lots.status')
    .lean();
  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }

  const existingProfile = await CommunityCompetitionProfile.findOne({
    company: companyId,
    community: community._id
  }).lean();

  const currentWebData = competitionProfileToWebData(existingProfile, community);
  const patch = updates && typeof updates.webData === 'object' ? updates.webData : updates;
  const nextWebData = mergeCompetitionWebData(currentWebData, patch || {});
  const shouldValidateModelListing = Object.prototype.hasOwnProperty.call(patch || {}, 'modelListingId');
  const shouldValidateModelFloorPlan = Object.prototype.hasOwnProperty.call(patch || {}, 'modelFloorPlanId');

  const lots = Array.isArray(community.lots) ? community.lots : [];
  const modelListingId = toStringId(nextWebData.modelListingId);
  if (shouldValidateModelListing && modelListingId) {
    const lot = lots.find((entry) => toStringId(entry?._id) === modelListingId);
    if (!lot) {
      const err = new Error('modelListingId must reference a listing in this community');
      err.status = 400;
      throw err;
    }
    if ((shouldValidateModelFloorPlan || !nextWebData.modelFloorPlanId) && isObjectId(lot.floorPlan)) {
      nextWebData.modelFloorPlanId = toStringId(lot.floorPlan);
    }
  }

  const modelFloorPlanId = toStringId(nextWebData.modelFloorPlanId);
  if ((shouldValidateModelFloorPlan || shouldValidateModelListing) && modelFloorPlanId) {
    const floorPlan = await FloorPlan.findOne({ _id: modelFloorPlanId, company: companyId })
      .select('_id communities')
      .lean();
    if (!floorPlan) {
      const err = new Error('modelFloorPlanId is not a valid floor plan for this company');
      err.status = 400;
      throw err;
    }
    const linked = Array.isArray(floorPlan.communities)
      && floorPlan.communities.some((id) => toStringId(id) === toStringId(community._id));
    if (!linked) {
      const err = new Error('modelFloorPlanId must be linked to this community');
      err.status = 400;
      throw err;
    }
  }

  const updatedProfile = await CommunityCompetitionProfile.findOneAndUpdate(
    { company: companyId, community: community._id },
    {
      $set: competitionWebDataToProfileSet(nextWebData),
      $setOnInsert: {
        company: companyId,
        community: community._id
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const communityDraft = await BrzCommunityDraft.findOne({
    companyId,
    communityId: community._id
  }).lean();

  const communityLotFloorPlanIds = collectCommunityLotFloorPlanIds([community])
    .map((id) => new mongoose.Types.ObjectId(id));
  const floorPlanOr = [{ communities: community._id }];
  if (communityLotFloorPlanIds.length) {
    floorPlanOr.push({ _id: { $in: communityLotFloorPlanIds } });
  }

  const floorPlanDocs = await FloorPlan.find({
    company: companyId,
    $or: floorPlanOr
  })
    .select('_id name planNumber communities')
    .lean();
  const offeredFloorPlanIdsByCommunity = buildCommunityOfferedFloorPlanIds({
    communities: [community],
    floorPlans: floorPlanDocs
  });
  await ensureCommunityFloorPlanDrafts(companyId, offeredFloorPlanIdsByCommunity);
  const offeredFloorPlanIds = offeredFloorPlanIdsByCommunity.get(toStringId(community._id)) || [];
  const planDrafts = await BrzFloorPlanDraft.find({
    companyId,
    floorPlanId: { $in: offeredFloorPlanIds }
  }).lean();
  const communityPlanDrafts = await BrzCommunityFloorPlanDraft.find({
    companyId,
    communityId: community._id,
    floorPlanId: { $in: offeredFloorPlanIds }
  }).lean();
  const planDraftMap = new Map(
    planDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );
  const communityPlanDraftMap = new Map(
    communityPlanDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );
  const floorPlanMap = new Map(
    floorPlanDocs.map((floorPlan) => [toStringId(floorPlan._id), floorPlan])
  );
  const floorPlanNameById = new Map(
    floorPlanDocs.map((floorPlan) => [toStringId(floorPlan._id), trimString(floorPlan.name || floorPlan.planNumber)])
  );
  const competitionProfileWebData = competitionProfileToWebData(updatedProfile, community);
  const webDataUpdatedAt = getCompetitionWebDataUpdatedAt(updatedProfile);
  const draftSyncedAt = parseDateOrNull(communityDraft?.draftSyncedAt);
  const outOfDate = isCommunityDraftOutOfDate({ webDataUpdatedAt, draftSyncedAt });
  const modelListings = serializeCommunityModelListings(community, floorPlanNameById);
  const planOfferings = offeredFloorPlanIds
    .map((floorPlanId) => {
      const floorPlan = floorPlanMap.get(toStringId(floorPlanId));
      if (!floorPlan) return null;
      return {
        floorPlan: serializeFloorPlan(floorPlan, new Map([[toStringId(community._id), community]])),
        planDraft: serializeFloorPlanDraft(
          planDraftMap.get(toStringId(floorPlanId)),
          companyId,
          floorPlanId
        ),
        communityPlanDraft: serializeCommunityFloorPlanDraft(
          communityPlanDraftMap.get(toStringId(floorPlanId)),
          companyId,
          community._id,
          floorPlanId
        )
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const sortA = toNumberOr(a.communityPlanDraft?.sortOrder, 0);
      const sortB = toNumberOr(b.communityPlanDraft?.sortOrder, 0);
      if (sortA !== sortB) return sortA - sortB;
      return trimString(a.floorPlan?.name).localeCompare(trimString(b.floorPlan?.name));
    });

  return {
    community: serializeCommunity(community),
    competitionProfileWebData,
    webDataUpdatedAt,
    draftSyncedAt,
    outOfDate,
    hasCompetitionProfile: true,
    modelListings,
    completeness: computeCommunityCompleteness({
      webData: competitionProfileWebData,
      communityDraft,
      modelListings
    }),
    listingOptions: serializeCommunityListingOptions(community, floorPlanNameById),
    floorPlanOptions: serializeCommunityFloorPlanOptions(community._id, floorPlanDocs),
    planOfferings
  };
}

async function syncCommunityDraftFromCompetition({ companyId, communityId }) {
  if (!isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }

  const community = await Community.findOne({ _id: communityId, company: companyId })
    .select('_id name totalLots lots._id')
    .lean();
  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }

  const competitionProfile = await CommunityCompetitionProfile.findOne({
    company: companyId,
    community: community._id
  }).lean();
  if (!competitionProfile) {
    const err = new Error('No competition profile found for this community');
    err.status = 404;
    throw err;
  }

  await ensureCommunityDrafts(companyId, [{ _id: community._id }]);

  const canonicalWebData = competitionProfileToWebData(competitionProfile, community);
  const syncedWebData = extractSyncableCompetitionFields(canonicalWebData);
  const syncedPromotion = trimString(competitionProfile?.promotion);
  const now = new Date();

  const draft = await BrzCommunityDraft.findOneAndUpdate(
    { companyId, communityId: community._id },
    {
      $set: {
        competitionWebData: syncedWebData,
        competitionPromotion: syncedPromotion,
        draftSyncedAt: now,
        draftSyncedFrom: 'competition'
      }
    },
    { new: true }
  ).lean();

  const webDataUpdatedAt = getCompetitionWebDataUpdatedAt(competitionProfile);
  return {
    communityId: toStringId(community._id),
    webDataUpdatedAt,
    draftSyncedAt: parseDateOrNull(draft?.draftSyncedAt),
    outOfDate: false,
    hasCompetitionProfile: true,
    draft: serializeCommunityDraft(draft, companyId, community._id)
  };
}

async function syncOutOfDateCommunitiesFromCompetition({ companyId, communityIds = null }) {
  const context = await getPublishingContext(companyId);
  const communityDraftById = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );
  const competitionProfileById = new Map(
    (context.competitionProfiles || []).map((profile) => [toStringId(profile.community), profile])
  );

  const driftByCommunityId = new Map();
  context.communities.forEach((community) => {
    const communityId = toStringId(community._id);
    const competitionProfile = competitionProfileById.get(communityId);
    const communityDraft = communityDraftById.get(communityId);
    const webDataUpdatedAt = getCompetitionWebDataUpdatedAt(competitionProfile);
    const draftSyncedAt = parseDateOrNull(communityDraft?.draftSyncedAt);
    const outOfDate = isCommunityDraftOutOfDate({ webDataUpdatedAt, draftSyncedAt });
    driftByCommunityId.set(communityId, {
      communityId,
      communityName: trimString(community?.name) || communityId,
      hasCompetitionProfile: Boolean(competitionProfile),
      webDataUpdatedAt,
      draftSyncedAt,
      outOfDate
    });
  });

  const requestedIds = Array.isArray(communityIds)
    ? Array.from(new Set(communityIds.map((id) => toStringId(id)).filter(Boolean)))
    : null;

  const directResults = [];
  const targets = [];

  if (requestedIds && requestedIds.length) {
    requestedIds.forEach((communityId) => {
      const drift = driftByCommunityId.get(communityId);
      if (!drift) {
        directResults.push({
          communityId,
          status: 'failed',
          message: 'FORBIDDEN'
        });
        return;
      }
      targets.push(drift);
    });
  } else {
    driftByCommunityId.forEach((drift) => {
      if (drift.hasCompetitionProfile && (drift.outOfDate || !drift.draftSyncedAt)) {
        targets.push(drift);
      }
    });
  }

  const syncedOrSkipped = await runWithConcurrencyLimit({
    items: targets,
    limit: 5,
    worker: async (target) => {
      const baseResult = {
        communityId: target.communityId,
        communityName: target.communityName,
        webDataUpdatedAt: target.webDataUpdatedAt,
        draftSyncedAt: target.draftSyncedAt
      };

      if (!target.hasCompetitionProfile) {
        return {
          ...baseResult,
          status: 'skipped',
          message: 'NO_COMPETITION_PROFILE'
        };
      }

      if (!target.outOfDate && target.draftSyncedAt) {
        return {
          ...baseResult,
          status: 'skipped',
          message: 'ALREADY_UP_TO_DATE'
        };
      }

      try {
        const synced = await syncCommunityDraftFromCompetition({
          companyId,
          communityId: target.communityId
        });
        return {
          ...baseResult,
          status: 'synced',
          webDataUpdatedAt: synced?.webDataUpdatedAt || target.webDataUpdatedAt || null,
          draftSyncedAt: synced?.draftSyncedAt || new Date()
        };
      } catch (err) {
        if (err?.status === 404 && /No competition profile found/i.test(String(err?.message || ''))) {
          return {
            ...baseResult,
            status: 'skipped',
            message: 'NO_COMPETITION_PROFILE'
          };
        }
        if (err?.status === 403 || (err?.status === 404 && /Community not found/i.test(String(err?.message || '')))) {
          return {
            ...baseResult,
            status: 'failed',
            message: 'FORBIDDEN'
          };
        }
        return {
          ...baseResult,
          status: 'failed',
          message: trimString(err?.message) || 'SYNC_FAILED'
        };
      }
    }
  });

  const results = [...directResults, ...syncedOrSkipped];
  const syncedCount = results.filter((result) => result.status === 'synced').length;
  const skippedCount = results.filter((result) => result.status === 'skipped').length;
  const failedCount = results.filter((result) => result.status === 'failed').length;

  return {
    ok: true,
    totalTargets: results.length,
    syncedCount,
    skippedCount,
    failedCount,
    results
  };
}

async function updateFloorPlanDraft({ companyId, floorPlanId, updates = {} }) {
  if (!isObjectId(floorPlanId)) {
    const err = new Error('Invalid floorPlanId');
    err.status = 400;
    throw err;
  }

  const floorPlan = await FloorPlan.findOne({ _id: floorPlanId, company: companyId })
    .select('_id name planNumber specs communities asset.previewUrl asset.fileUrl')
    .lean();
  if (!floorPlan) {
    const err = new Error('Floor plan not found');
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
  if (Object.prototype.hasOwnProperty.call(updates, 'primaryImage')) {
    set.primaryImage = sanitizeImageMeta(updates.primaryImage);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sortOrder')) {
    set.sortOrder = toNumberOr(updates.sortOrder, 0);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceVisibility')) {
    const visibility = normalizePriceVisibility(updates.basePriceVisibility, '');
    if (!visibility) {
      const err = new Error('basePriceVisibility must be "hidden" or "public"');
      err.status = 400;
      throw err;
    }
    set.basePriceVisibility = visibility;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceNotesInternal')) {
    set.basePriceNotesInternal = trimString(updates.basePriceNotesInternal);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceAsOf')) {
    const basePriceAsOf = parseDateOrNull(updates.basePriceAsOf);
    if (updates.basePriceAsOf && !basePriceAsOf) {
      const err = new Error('basePriceAsOf is invalid');
      err.status = 400;
      throw err;
    }
    set.basePriceAsOf = basePriceAsOf;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceFrom')) {
    const basePriceFrom = toNullableNumber(updates.basePriceFrom);
    if (updates.basePriceFrom != null && updates.basePriceFrom !== '' && basePriceFrom == null) {
      const err = new Error('basePriceFrom must be a number');
      err.status = 400;
      throw err;
    }
    if (basePriceFrom != null && basePriceFrom < 0) {
      const err = new Error('basePriceFrom must be >= 0');
      err.status = 400;
      throw err;
    }
    set.basePriceFrom = basePriceFrom;
    if (!Object.prototype.hasOwnProperty.call(set, 'basePriceAsOf')) {
      set.basePriceAsOf = basePriceFrom != null ? new Date() : null;
    }
  }

  const setOnInsert = {
    companyId,
    floorPlanId: floorPlan._id,
    isIncluded: true,
    descriptionOverride: '',
    primaryImage: null,
    sortOrder: 0,
    basePriceFrom: null,
    basePriceAsOf: null,
    basePriceVisibility: 'public',
    basePriceNotesInternal: ''
  };
  Object.keys(set).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(setOnInsert, key)) {
      delete setOnInsert[key];
    }
  });

  const draft = await BrzFloorPlanDraft.findOneAndUpdate(
    { companyId, floorPlanId: floorPlan._id },
    {
      $set: set,
      $setOnInsert: setOnInsert
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const linkedCommunityIds = Array.isArray(floorPlan.communities) ? floorPlan.communities : [];
  const linkedCommunities = linkedCommunityIds.length
    ? await Community.find({ _id: { $in: linkedCommunityIds } }).select('_id name slug').lean()
    : [];
  const communityMap = new Map(
    linkedCommunities.map((community) => [toStringId(community?._id), community])
  );

  return {
    floorPlan: serializeFloorPlan(floorPlan, communityMap),
    draft: serializeFloorPlanDraft(draft, companyId, floorPlan._id)
  };
}

async function updateCommunityFloorPlanDraft({
  companyId,
  communityId,
  floorPlanId,
  updates = {}
}) {
  if (!isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }
  if (!isObjectId(floorPlanId)) {
    const err = new Error('Invalid floorPlanId');
    err.status = 400;
    throw err;
  }

  const [community, floorPlan] = await Promise.all([
    Community.findOne({ _id: communityId, company: companyId })
      .select('_id name lots.floorPlan')
      .lean(),
    FloorPlan.findOne({ _id: floorPlanId, company: companyId })
      .select('_id name planNumber specs communities asset.previewUrl asset.fileUrl')
      .lean()
  ]);

  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  if (!floorPlan) {
    const err = new Error('Floor plan not found');
    err.status = 404;
    throw err;
  }

  const linkedByCommunity = Array.isArray(floorPlan.communities)
    && floorPlan.communities.some((id) => toStringId(id) === toStringId(community._id));
  const linkedByLot = (Array.isArray(community.lots) ? community.lots : [])
    .some((lot) => toStringId(lot?.floorPlan) === toStringId(floorPlan._id));
  if (!linkedByCommunity && !linkedByLot) {
    const err = new Error('Floor plan is not linked to this community');
    err.status = 400;
    throw err;
  }

  const set = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'isIncluded')) {
    set.isIncluded = toBoolean(updates.isIncluded, true);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sortOrder')) {
    set.sortOrder = toNumberOr(updates.sortOrder, 0);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'descriptionOverride')) {
    set.descriptionOverride = trimString(updates.descriptionOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'primaryImageOverride')) {
    set.primaryImageOverride = sanitizeImageMeta(updates.primaryImageOverride);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceVisibility')) {
    const visibility = normalizePriceVisibility(updates.basePriceVisibility, '');
    if (!visibility) {
      const err = new Error('basePriceVisibility must be "hidden" or "public"');
      err.status = 400;
      throw err;
    }
    set.basePriceVisibility = visibility;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceNotesInternal')) {
    set.basePriceNotesInternal = trimString(updates.basePriceNotesInternal);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceAsOf')) {
    const basePriceAsOf = parseDateOrNull(updates.basePriceAsOf);
    if (updates.basePriceAsOf && !basePriceAsOf) {
      const err = new Error('basePriceAsOf is invalid');
      err.status = 400;
      throw err;
    }
    set.basePriceAsOf = basePriceAsOf;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'basePriceFrom')) {
    const basePriceFrom = toNullableNumber(updates.basePriceFrom);
    if (updates.basePriceFrom != null && updates.basePriceFrom !== '' && basePriceFrom == null) {
      const err = new Error('basePriceFrom must be a number');
      err.status = 400;
      throw err;
    }
    if (basePriceFrom != null && basePriceFrom < 0) {
      const err = new Error('basePriceFrom must be >= 0');
      err.status = 400;
      throw err;
    }
    set.basePriceFrom = basePriceFrom;
    if (!Object.prototype.hasOwnProperty.call(set, 'basePriceAsOf')) {
      set.basePriceAsOf = basePriceFrom != null ? new Date() : null;
    }
  }

  const setOnInsert = {
    companyId,
    communityId: community._id,
    floorPlanId: floorPlan._id,
    isIncluded: true,
    basePriceFrom: null,
    basePriceAsOf: null,
    basePriceVisibility: 'public',
    basePriceNotesInternal: '',
    descriptionOverride: '',
    primaryImageOverride: null,
    sortOrder: 0
  };
  Object.keys(set).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(setOnInsert, key)) {
      delete setOnInsert[key];
    }
  });

  const draft = await BrzCommunityFloorPlanDraft.findOneAndUpdate(
    { companyId, communityId: community._id, floorPlanId: floorPlan._id },
    {
      $set: set,
      $setOnInsert: setOnInsert
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const planDraft = await BrzFloorPlanDraft.findOne({
    companyId,
    floorPlanId: floorPlan._id
  }).lean();

  return {
    floorPlan: serializeFloorPlan(
      floorPlan,
      new Map([[toStringId(community._id), { _id: community._id, name: community.name || '', slug: '' }]])
    ),
    planDraft: serializeFloorPlanDraft(planDraft, companyId, floorPlan._id),
    communityPlanDraft: serializeCommunityFloorPlanDraft(
      draft,
      companyId,
      community._id,
      floorPlan._id
    )
  };
}

async function updateCommunityLotPublishFlag({
  companyId,
  communityId,
  lotId,
  isPublished
}) {
  if (!isObjectId(communityId)) {
    const err = new Error('Invalid communityId');
    err.status = 400;
    throw err;
  }
  if (!isObjectId(lotId)) {
    const err = new Error('Invalid lotId');
    err.status = 400;
    throw err;
  }

  const community = await Community.findOne({ _id: communityId, company: companyId });
  if (!community) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }

  const lot = community.lots.id(lotId);
  if (!lot) {
    const err = new Error('Lot not found');
    err.status = 404;
    throw err;
  }

  const nextValue = toBoolean(isPublished, false);
  if (!lot.buildrootz || typeof lot.buildrootz !== 'object') {
    lot.buildrootz = {};
  }
  lot.buildrootz.isPublished = nextValue;
  // Keep legacy flag aligned for compatibility with older flows.
  lot.isPublished = nextValue;

  community.markModified('lots');
  await community.save();

  return {
    communityId: toStringId(community._id),
    lotId: toStringId(lot._id),
    isPublished: nextValue
  };
}

const PUBLISHER_VERSION = 'keepup-brz-publisher-v1';

const truncateMessage = (value, max = 500) => {
  const text = String(value == null ? '' : value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const dedupeStrings = (items) => {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const trimmed = trimString(item);
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
};

const mapUrlsToMediaObjects = (items) =>
  dedupeStrings(items).map((url) => ({ url }));

const capWarnings = (warnings, cap = 25) =>
  (Array.isArray(warnings) ? warnings : [])
    .map((warning) => truncateMessage(warning, 240))
    .filter(Boolean)
    .slice(0, cap);

const normalizeWebDataForBundle = (webData) => {
  const normalized = webData && typeof webData === 'object' ? { ...webData } : {};
  const contactVisibility = normalized.contactVisibility && typeof normalized.contactVisibility === 'object'
    ? normalized.contactVisibility
    : {};
  const primaryContact = normalized.primaryContact && typeof normalized.primaryContact === 'object'
    ? { ...normalized.primaryContact }
    : {};

  if (!contactVisibility.showName) delete primaryContact.name;
  if (!contactVisibility.showPhone) delete primaryContact.phone;
  if (!contactVisibility.showEmail) delete primaryContact.email;

  const earnestMoney = normalized.earnestMoney && typeof normalized.earnestMoney === 'object'
    ? { ...normalized.earnestMoney }
    : null;
  if (earnestMoney && earnestMoney.visibility === 'hidden') {
    delete earnestMoney.amount;
  }

  const realtorCommission = normalized.realtorCommission && typeof normalized.realtorCommission === 'object'
    ? { ...normalized.realtorCommission }
    : null;
  if (realtorCommission && realtorCommission.visibility === 'hidden') {
    delete realtorCommission.amount;
  }

  const result = {
    ...normalized,
    primaryContact,
    contactVisibility: { ...contactVisibility }
  };
  if (earnestMoney) result.earnestMoney = earnestMoney;
  if (realtorCommission) result.realtorCommission = realtorCommission;

  delete result.notesInternal;
  return result;
};

const toGarageStringOrNull = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = trimString(value);
  return text || null;
};

const normalizeScopedIdSet = (values, fieldName) => {
  if (values == null) return null;
  if (!Array.isArray(values)) {
    const err = new Error(`${fieldName} must be an array of ObjectId strings`);
    err.status = 400;
    throw err;
  }
  const set = new Set();
  values.forEach((value) => {
    const id = toStringId(value);
    if (!id) return;
    if (!isObjectId(id)) {
      const err = new Error(`Invalid ${fieldName} value: ${id}`);
      err.status = 400;
      throw err;
    }
    set.add(id);
  });
  return set;
};

const resolveInventoryUnpublishMissingHomes = ({ lotIdsSet, requestedUnpublishMissingHomes }) => {
  const hasLotScope = Boolean(lotIdsSet && lotIdsSet.size > 0);
  const explicitProvided = typeof requestedUnpublishMissingHomes === 'boolean';
  let resolved = explicitProvided
    ? requestedUnpublishMissingHomes
    : !hasLotScope;
  const warnings = [];

  if (hasLotScope && resolved === true) {
    resolved = false;
    warnings.push(
      'Guardrail: unpublishMissingHomes=true requested with lotIds scope; forced false.'
    );
  }

  return {
    resolvedUnpublishMissingHomes: resolved,
    mode: resolved ? 'RECONCILE' : 'PATCH',
    warnings
  };
};

const extractPublishSummary = ({ response, bundle }) => {
  const counts =
    (response?.counts && typeof response.counts === 'object' && !Array.isArray(response.counts) && response.counts)
    || (response?.result?.counts && typeof response.result.counts === 'object' && !Array.isArray(response.result.counts) && response.result.counts)
    || (response?.summary?.counts && typeof response.summary.counts === 'object' && !Array.isArray(response.summary.counts) && response.summary.counts)
    || {
      builderInCommunities: Array.isArray(bundle?.builderInCommunities) ? bundle.builderInCommunities.length : 0,
      planCatalog: Array.isArray(bundle?.planCatalog) ? bundle.planCatalog.length : 0,
      planOfferings: Array.isArray(bundle?.planOfferings) ? bundle.planOfferings.length : 0,
      publicHomes: Array.isArray(bundle?.publicHomes) ? bundle.publicHomes.length : 0
    };
  if (bundle?.meta?.inventorySummary && typeof bundle.meta.inventorySummary === 'object') {
    if (!Object.prototype.hasOwnProperty.call(counts, 'attemptedHomes')) {
      counts.attemptedHomes = bundle.meta.inventorySummary.attemptedHomes;
    }
    if (!Object.prototype.hasOwnProperty.call(counts, 'skippedMissingAddress')) {
      counts.skippedMissingAddress = bundle.meta.inventorySummary.skippedMissingAddress;
    }
  }

  const responseWarnings = capWarnings(
    response?.warnings
      || response?.result?.warnings
      || response?.summary?.warnings
      || []
  );
  const bundleWarnings = capWarnings(bundle?.meta?.warnings || []);
  const warnings = capWarnings([...bundleWarnings, ...responseWarnings]);
  const message = truncateMessage(
    response?.message
      || response?.result?.message
      || response?.status
      || response?.result?.status
      || 'Bundle published'
  );

  return { counts, warnings, message };
};

async function persistPublishMetadata({
  companyId,
  publishType,
  status,
  message,
  counts = null,
  warnings = []
}) {
  const now = new Date();
  const normalizedStatus = status === 'success' ? 'success' : 'error';
  const normalizedMessage = truncateMessage(message || '');
  const normalizedCounts = counts && typeof counts === 'object' ? counts : null;
  const normalizedWarnings = capWarnings(warnings);

  const set = {};
  if (publishType === 'inventory') {
    set.buildrootzInventoryPublishLastAt = now;
    set.buildrootzInventoryPublishLastStatus = normalizedStatus;
    set.buildrootzInventoryPublishLastMessage = normalizedMessage;
    set.buildrootzInventoryPublishLastCounts = normalizedCounts;
    set.buildrootzInventoryPublishLastWarnings = normalizedWarnings;
  } else {
    // package publish is default and also mirrors legacy fields.
    set.buildrootzPackagePublishLastAt = now;
    set.buildrootzPackagePublishLastStatus = normalizedStatus;
    set.buildrootzPackagePublishLastMessage = normalizedMessage;
    set.buildrootzPackagePublishLastCounts = normalizedCounts;
    set.buildrootzPackagePublishLastWarnings = normalizedWarnings;

    set.buildrootzPublishLastAt = now;
    set.buildrootzPublishLastStatus = normalizedStatus;
    set.buildrootzPublishLastMessage = normalizedMessage;
    set.buildrootzPublishLastCounts = normalizedCounts;
    set.buildrootzPublishLastWarnings = normalizedWarnings;
  }

  await Company.updateOne(
    { _id: companyId },
    {
      $set: set
    }
  );
}

const assertCommunityHasBuildrootzMapping = (community) => {
  const mappedId = trimString(community?.buildrootz?.communityId);
  const publicCommunityId = trimString(community?.buildrootz?.publicCommunityId);
  const communityName = trimString(community?.name) || toStringId(community?._id);
  if (!mappedId) {
    const err = new Error(`Community ${communityName} is not mapped to BuildRootz.`);
    err.status = 400;
    throw err;
  }
  if (!publicCommunityId) {
    const err = new Error(`Community ${communityName} is mapped but missing publicCommunityId. Re-run BRZ Mapping.`);
    err.status = 400;
    throw err;
  }
};

const getIncludedMappedCommunities = ({ context, communityDraftById }) => {
  const included = context.communities
    .map((community) => {
      const draft = communityDraftById.get(toStringId(community._id));
      return { community, draft };
    })
    .filter((entry) => entry.draft && entry.draft.isIncluded);

  included.forEach(({ community }) => {
    assertCommunityHasBuildrootzMapping(community);
  });

  return included;
};

const serializeBuilderProfilePayload = ({ company, profileDraft }) => {
  const builderProfile = {
    companyId: toStringId(company._id),
    builderName: trimString(company?.name),
    builderSlug: trimString(company?.slug) || slugify(company?.name || ''),
    logoUrl: trimString(company?.buildrootzProfile?.logoUrl) || trimString(company?.branding?.logoUrl),
    description: trimString(company?.buildrootzProfile?.description),
    websiteUrl: trimString(company?.buildrootzProfile?.websiteUrl)
  };
  if (trimString(company?.branding?.primaryColor)) {
    builderProfile.primaryColor = trimString(company.branding.primaryColor);
  }
  if (trimString(company?.branding?.secondaryColor)) {
    builderProfile.secondaryColor = trimString(company.branding.secondaryColor);
  }
  if (trimString(profileDraft?.pricingDisclaimer)) {
    builderProfile.pricingDisclaimer = trimString(profileDraft.pricingDisclaimer);
  }
  return builderProfile;
};

async function buildPackageBundle({ companyId, requestedAt = new Date().toISOString() }) {
  const context = await getPublishingContext(companyId);
  const company = context.company;
  const profileDraft = context.profileDraft;

  const communityDraftById = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );
  const competitionProfileById = new Map(
    (context.competitionProfiles || []).map((profile) => [toStringId(profile.community), profile])
  );
  const floorPlanById = new Map(
    context.floorPlans.map((floorPlan) => [toStringId(floorPlan._id), floorPlan])
  );
  const floorPlanDraftById = new Map(
    context.floorPlanDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );
  const communityFloorPlanDraftByKey = new Map(
    context.communityFloorPlanDrafts.map((draft) => [
      toCommunityFloorPlanKey(draft.communityId, draft.floorPlanId),
      draft
    ])
  );
  const floorPlanNameById = new Map(
    context.floorPlans.map((floorPlan) => [toStringId(floorPlan._id), trimString(floorPlan.name || floorPlan.planNumber)])
  );

  const includedCommunities = getIncludedMappedCommunities({ context, communityDraftById });
  const includedFloorPlanIds = new Set();
  includedCommunities.forEach(({ community }) => {
    const offeredIds = context.offeredFloorPlanIdsByCommunity.get(toStringId(community._id)) || [];
    offeredIds.forEach((floorPlanId) => includedFloorPlanIds.add(toStringId(floorPlanId)));
  });

  const builderProfile = serializeBuilderProfilePayload({ company, profileDraft });

  const builderInCommunities = includedCommunities.map(({ community, draft }) => {
    const communityId = toStringId(community._id);
    const publicCommunityId = trimString(community?.buildrootz?.publicCommunityId);
    const competitionProfile = competitionProfileById.get(communityId);
    const draftSyncedAt = parseDateOrNull(draft?.draftSyncedAt);
    const draftWebData = draft?.competitionWebData && typeof draft.competitionWebData === 'object'
      ? draft.competitionWebData
      : null;
    const communityName = trimString(community?.name) || communityId;
    if (!draftSyncedAt && competitionProfile) {
      const err = new Error(`Community ${communityName} has never been synced from competition. Click "Sync from competition" before publishing package.`);
      err.status = 400;
      throw err;
    }
    const webData = draftWebData || {};
    const promotionValue = trimString(draft?.competitionPromotion);
    const modelsSummary = serializeCommunityModelListings(community, floorPlanNameById).map((model) => ({
      keepupLotId: toStringId(model.listingId),
      sourceHomeId: toStringId(model.listingId),
      address: trimString(model.address),
      keepupFloorPlanId: toStringId(model.floorPlanId),
      floorPlanName: trimString(model.floorPlanName)
    }));

    const payload = {
      companyId: toStringId(company._id),
      publicCommunityId,
      keepupCommunityId: communityId,
      webData: normalizeWebDataForBundle(webData),
      modelsSummary
    };
    if (trimString(draft?.descriptionOverride)) {
      payload.descriptionOverride = trimString(draft.descriptionOverride);
    }
    if (trimString(draft?.heroImage?.url)) {
      payload.heroImageUrl = trimString(draft.heroImage.url);
    }
    if (promotionValue) {
      payload.promotion = promotionValue;
    }
    return payload;
  });

  const planCatalog = Array.from(includedFloorPlanIds)
    .map((floorPlanId) => {
      const floorPlan = floorPlanById.get(floorPlanId);
      const draft = floorPlanDraftById.get(floorPlanId);
      if (!floorPlan || !draft || draft.isIncluded === false) return null;
      const specs = floorPlan.specs || {};
      const images = dedupeStrings([
        trimString(draft?.primaryImage?.url),
        resolveFloorPlanUploadedPreviewUrl(floorPlan)
      ]);
      const payload = {
        companyId: toStringId(company._id),
        keepupFloorPlanId: toStringId(floorPlan._id),
        name: trimString(draft?.displayNameOverride) || trimString(floorPlan?.name),
        planNumber: trimString(floorPlan?.planNumber),
        beds: toNullableNumber(specs?.beds),
        baths: toNullableNumber(specs?.baths),
        sqft: toNullableNumber(specs?.squareFeet),
        stories: toNullableNumber(specs?.stories),
        garage: toGarageStringOrNull(specs?.garage),
        sortOrder: toNumberOr(draft?.sortOrder, 0)
      };
      if (trimString(draft?.descriptionOverride)) {
        payload.description = trimString(draft.descriptionOverride);
      }
      if (trimString(floorPlan?.websiteSlug)) payload.websiteSlug = trimString(floorPlan.websiteSlug);
      if (trimString(floorPlan?.websiteUrl)) payload.websiteUrl = trimString(floorPlan.websiteUrl);
      if (images.length) payload.images = mapUrlsToMediaObjects(images);
      return payload;
    })
    .filter(Boolean)
    .sort((a, b) => (toNumberOr(a.sortOrder, 0) - toNumberOr(b.sortOrder, 0)) || a.name.localeCompare(b.name));

  const planOfferings = includedCommunities
    .flatMap(({ community }) => {
      const communityId = toStringId(community._id);
      const publicCommunityId = trimString(community?.buildrootz?.publicCommunityId);
      const offeredIds = context.offeredFloorPlanIdsByCommunity.get(communityId) || [];
      return offeredIds.map((floorPlanId) => {
        const floorPlanIdString = toStringId(floorPlanId);
        const planDraft = floorPlanDraftById.get(floorPlanIdString);
        const communityPlanDraft = communityFloorPlanDraftByKey.get(
          toCommunityFloorPlanKey(communityId, floorPlanIdString)
        );
        const payload = {
          companyId: toStringId(company._id),
          publicCommunityId,
          keepupCommunityId: communityId,
          keepupFloorPlanId: floorPlanIdString,
          isIncluded: communityPlanDraft ? communityPlanDraft.isIncluded !== false : true,
          sortOrder: toNumberOr(communityPlanDraft?.sortOrder, toNumberOr(planDraft?.sortOrder, 0)),
          basePriceFrom: toNullableNumber(communityPlanDraft?.basePriceFrom),
          basePriceAsOf: parseDateOrNull(communityPlanDraft?.basePriceAsOf),
          basePriceVisibility: normalizePriceVisibility(communityPlanDraft?.basePriceVisibility, 'public')
        };
        if (trimString(communityPlanDraft?.descriptionOverride)) {
          payload.descriptionOverride = trimString(communityPlanDraft.descriptionOverride);
        }
        if (trimString(communityPlanDraft?.primaryImageOverride?.url)) {
          payload.primaryImageOverrideUrl = trimString(communityPlanDraft.primaryImageOverride.url);
        }
        return payload;
      });
    })
    .sort((a, b) => {
      if (a.keepupCommunityId !== b.keepupCommunityId) return a.keepupCommunityId.localeCompare(b.keepupCommunityId);
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.keepupFloorPlanId.localeCompare(b.keepupFloorPlanId);
    });

  return {
    meta: {
      keepupCompanyId: toStringId(company._id),
      requestedAt,
      publisherVersion: PUBLISHER_VERSION
    },
    builderProfile,
    builderInCommunities,
    planCatalog,
    planOfferings,
    publicHomes: []
  };
}

async function buildInventoryBundle({
  companyId,
  requestedAt = new Date().toISOString(),
  communityIds = null,
  lotIds = null,
  unpublishMissingHomes
}) {
  const context = await getPublishingContext(companyId);
  const company = context.company;
  const scopedCommunityIds = normalizeScopedIdSet(communityIds, 'communityIds');
  const scopedLotIds = normalizeScopedIdSet(lotIds, 'lotIds');
  const {
    resolvedUnpublishMissingHomes,
    mode: inventoryPublishMode,
    warnings: modeWarnings
  } = resolveInventoryUnpublishMissingHomes({
    lotIdsSet: scopedLotIds,
    requestedUnpublishMissingHomes: unpublishMissingHomes
  });

  const communityDraftById = new Map(
    context.communityDrafts.map((draft) => [toStringId(draft.communityId), draft])
  );
  const floorPlanById = new Map(
    context.floorPlans.map((floorPlan) => [toStringId(floorPlan._id), floorPlan])
  );
  let includedCommunities = getIncludedMappedCommunities({ context, communityDraftById });
  if (scopedCommunityIds) {
    const scoped = context.communities
      .filter((community) => scopedCommunityIds.has(toStringId(community?._id)))
      .map((community) => ({
        community,
        draft: communityDraftById.get(toStringId(community._id)) || null
      }));
    const matchedCommunityIds = new Set(scoped.map(({ community }) => toStringId(community?._id)));
    const missingScopedCommunityIds = Array.from(scopedCommunityIds)
      .filter((communityId) => !matchedCommunityIds.has(communityId));
    if (missingScopedCommunityIds.length) {
      const err = new Error(`One or more communityIds are invalid for this company: ${missingScopedCommunityIds.join(', ')}`);
      err.status = 400;
      throw err;
    }
    scoped.forEach(({ community }) => {
      assertCommunityHasBuildrootzMapping(community);
    });
    includedCommunities = scoped;
  }
  const publishWarnings = [];
  publishWarnings.push(...modeWarnings);
  let attemptedHomes = 0;
  let skippedMissingAddress = 0;
  const pushInventoryWarning = (message) => {
    if (!message) return;
    publishWarnings.push(message);
  };

  const publicHomes = [];
  includedCommunities.forEach(({ community }) => {
    const communityId = toStringId(community._id);
    const communityName = trimString(community?.name) || communityId;
    const publicCommunityId = trimString(community?.buildrootz?.publicCommunityId);
    const lots = Array.isArray(community?.lots) ? community.lots : [];
    lots
      .filter((lot) => isLotMarkedForBuildrootzPublish(lot))
      .filter((lot) => !scopedLotIds || scopedLotIds.has(toStringId(lot?._id)))
      .forEach((lot) => {
        attemptedHomes += 1;
        const keepupLotId = toStringId(lot?._id);
        const keepupFloorPlanId = toStringId(lot?.floorPlan);
        const floorPlan = floorPlanById.get(keepupFloorPlanId);
        const photoUrls = dedupeStrings([
          trimString(lot?.heroImage),
          ...(Array.isArray(lot?.listingPhotos) ? lot.listingPhotos : []),
          trimString(lot?.liveElevationPhoto)
        ]);

        const { address, displayAddress, warnings: addressWarnings } = normalizeHomeAddress(
          lot,
          community,
          company
        );
        if (addressWarnings.includes('MISSING_ADDRESS_LINE1')) {
          skippedMissingAddress += 1;
          pushInventoryWarning(
            `Skipped lot ${keepupLotId} (${communityName}): missing address line1`
          );
          return;
        }

        const { geo, warnings: geoWarnings } = normalizeHomeGeo(lot);
        if (geoWarnings.includes('MISSING_GEO')) {
          pushInventoryWarning(
            `Lot ${keepupLotId} (${communityName}): missing geo (will not appear on map)`
          );
        }

        const { beds, baths, sqft, garage, stories, warnings: factsWarnings } = normalizeHomeFacts(
          lot,
          floorPlan
        );
        if (factsWarnings.includes('MISSING_SPECS')) {
          pushInventoryWarning(
            `Lot ${keepupLotId} (${communityName}): missing specs (beds/baths/sqft)`
          );
        }

        const {
          listPrice,
          salePrice,
          price,
          warnings: pricingWarnings
        } = normalizeHomePricing(lot);
        if (pricingWarnings.includes('MISSING_PRICE')) {
          pushInventoryWarning(
            `Lot ${keepupLotId} (${communityName}): missing price`
          );
        }

        const payload = {
          companyId: toStringId(company._id),
          publicCommunityId,
          keepupCommunityId: communityId,
          keepupLotId,
          sourceHomeId: keepupLotId,
          status: trimString(lot?.generalStatus || lot?.status || lot?.buildingStatus || 'Available'),
          isActive: true,
          address,
          displayAddress
        };

        if (trimString(lot?.lot)) payload.address.lot = trimString(lot.lot);
        if (trimString(lot?.block)) payload.address.block = trimString(lot.block);
        if (keepupFloorPlanId) payload.keepupFloorPlanId = keepupFloorPlanId;
        if (price) payload.price = price;
        if (listPrice != null) payload.listPrice = listPrice;
        if (salePrice != null) payload.salePrice = salePrice;
        if (geo) payload.geo = geo;
        if (beds != null) payload.beds = beds;
        if (baths != null) payload.baths = baths;
        if (sqft != null) payload.sqft = sqft;
        if (garage != null) payload.garage = toGarageStringOrNull(garage);
        if (stories != null) payload.stories = stories;
        if (photoUrls.length) {
          payload.photos = mapUrlsToMediaObjects(photoUrls);
          payload.primaryPhotoUrl = photoUrls[0];
        }
        publicHomes.push(payload);
      });
  });

  return {
    meta: {
      keepupCompanyId: toStringId(company._id),
      requestedAt,
      publisherVersion: PUBLISHER_VERSION,
      unpublishMissingHomes: resolvedUnpublishMissingHomes,
      publishMode: inventoryPublishMode,
      warnings: capWarnings(publishWarnings),
      inventorySummary: {
        attemptedHomes,
        publishedHomes: publicHomes.length,
        skippedMissingAddress
      }
    },
    builderInCommunities: [],
    planCatalog: [],
    planOfferings: [],
    publicHomes
  };
}

async function publishCompanyPackage({ companyId }) {
  let bundle = null;
  try {
    bundle = await buildPackageBundle({ companyId, requestedAt: new Date().toISOString() });
    const brzResponse = await publishBundleToBuildRootz(bundle);
    const summary = extractPublishSummary({ response: brzResponse, bundle });
    await persistPublishMetadata({
      companyId,
      publishType: 'package',
      status: 'success',
      message: summary.message,
      counts: summary.counts,
      warnings: summary.warnings
    });

    return {
      ok: brzResponse?.ok !== false,
      publishedAt: new Date(),
      status: 'success',
      message: summary.message,
      counts: summary.counts,
      warnings: summary.warnings,
      response: brzResponse
    };
  } catch (err) {
    const summary = extractPublishSummary({ response: err?.payload || {}, bundle });
    try {
      await persistPublishMetadata({
        companyId,
        publishType: 'package',
        status: 'error',
        message: err?.message || summary.message || 'Publish failed',
        counts: summary.counts,
        warnings: summary.warnings
      });
    } catch (_) {
      // keep original error
    }
    throw err;
  }
}

async function publishCompanyInventory({
  companyId,
  communityIds = null,
  lotIds = null,
  unpublishMissingHomes
}) {
  let bundle = null;
  try {
    bundle = await buildInventoryBundle({
      companyId,
      requestedAt: new Date().toISOString(),
      communityIds,
      lotIds,
      unpublishMissingHomes
    });
    const mode = bundle?.meta?.unpublishMissingHomes ? 'RECONCILE' : 'PATCH';
    console.info(`BRZ inventory publish mode: ${mode}`, {
      mode,
      companyId: toStringId(companyId),
      communityIdsCount: Array.isArray(communityIds) ? communityIds.length : 0,
      lotIdsCount: Array.isArray(lotIds) ? lotIds.length : 0
    });
    const brzResponse = await publishBundleToBuildRootz(bundle);
    const summary = extractPublishSummary({ response: brzResponse, bundle });
    await persistPublishMetadata({
      companyId,
      publishType: 'inventory',
      status: 'success',
      message: summary.message,
      counts: summary.counts,
      warnings: summary.warnings
    });

    return {
      ok: brzResponse?.ok !== false,
      publishedAt: new Date(),
      status: 'success',
      message: summary.message,
      counts: summary.counts,
      warnings: summary.warnings,
      response: brzResponse
    };
  } catch (err) {
    const summary = extractPublishSummary({ response: err?.payload || {}, bundle });
    try {
      await persistPublishMetadata({
        companyId,
        publishType: 'inventory',
        status: 'error',
        message: err?.message || summary.message || 'Inventory publish failed',
        counts: summary.counts,
        warnings: summary.warnings
      });
    } catch (_) {
      // keep original error
    }
    throw err;
  }
}

async function publishCompanySnapshot({ companyId }) {
  return publishCompanyPackage({ companyId });
}

module.exports = {
  bootstrapPublishingData,
  updateBuilderProfileDraft,
  updateCommunityDraft,
  updateCommunityLotPublishFlag,
  syncCommunityDraftFromCompetition,
  syncOutOfDateCommunitiesFromCompetition,
  updateCommunityWebData,
  updateFloorPlanDraft,
  updateCommunityFloorPlanDraft,
  buildPackageBundle,
  buildInventoryBundle,
  buildPublishBundle: buildPackageBundle,
  publishCompanyPackage,
  publishCompanyInventory,
  publishCompanySnapshot,
  sanitizeImageMeta,
  __test: {
    resolveInventoryUnpublishMissingHomes,
    normalizeScopedIdSet
  }
};
