const mongoose = require('mongoose');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const Company = require('../models/Company');
const PublicHome = require('../models/buildrootz/PublicHome');
const PublicCommunity = require('../models/buildrootz/PublicCommunity');

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const uploadsBase =
  (process.env.BUILDROOTZ_UPLOAD_BASE_URL || process.env.BASE_URL || '').replace(/\/+$/, '');

const toPublicUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const cleaned = url.trim().replace(/\\\\/g, '/').replace(/\\/g, '/');
  if (!cleaned) return '';
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  const rel = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return uploadsBase ? `${uploadsBase}${rel}` : rel;
};

const slugify = (value = '') =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const dedupeStrings = (arr = []) => {
  const seen = new Set();
  const out = [];
  arr.forEach((v) => {
    if (!v || typeof v !== 'string') return;
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
};

const extractIncentives = (...values) =>
  dedupeStrings(
    values
      .filter(Boolean)
      .flatMap((val) => String(val)
        .split(/[\n;]+/)
        .map((s) => s.trim()))
  );

async function fetchHomeContext(homeId, companyId) {
  const filter = { company: companyId, 'lots._id': homeId };
  const community = await Community.findOne(filter)
    .select('name city state market company lots')
    .lean();

  if (!community) {
    const err = new Error('Home not found for this company');
    err.status = 404;
    throw err;
  }

  const lot = (community.lots || []).find((l) => l && String(l._id) === String(homeId));
  if (!lot) {
    const err = new Error('Home not found for this company');
    err.status = 404;
    throw err;
  }

  const floorPlanId = lot.floorPlan && isObjectId(lot.floorPlan) ? lot.floorPlan : null;

  const [floorPlan, profile, company] = await Promise.all([
    floorPlanId
      ? FloorPlan.findOne({ _id: floorPlanId, company: companyId })
          .select('name planNumber specs asset elevations')
          .lean()
      : null,
    CommunityCompetitionProfile.findOne({ community: community._id, company: companyId })
      .select('hoaFee hoaFrequency tax feeTypes mudFee pidFee pidFeeFrequency communityAmenities promotion city state zip schoolISD elementarySchool middleSchool highSchool lotSize salesPerson salesPersonPhone salesPersonEmail address')
      .lean(),
    Company.findById(companyId).select('name slug').lean()
  ]);

  return { community, lot, floorPlan, profile, company };
}

function buildFloorPlanMedia(floorPlan) {
  if (!floorPlan) return [];
  const media = [];

  const pushMedia = (url, label, type = 'image') => {
    const normalized = toPublicUrl(url);
    if (!normalized) return;
    media.push({ url: normalized, label: label || 'Floor Plan', type });
  };

  const isPdfUrl = (url) => /\.pdf($|\\?)/i.test(String(url || ''));

  const asset = floorPlan.asset || {};
  const primary = asset.previewUrl || asset.fileUrl;
  if (primary) {
    pushMedia(primary, 'Floor Plan', isPdfUrl(primary) ? 'file' : 'image');
  }

  if (Array.isArray(floorPlan.elevations)) {
    floorPlan.elevations.forEach((el, idx) => {
      if (!el) return;
      const elPrimary = el.asset?.previewUrl || el.asset?.fileUrl;
      if (!elPrimary) return;
      const label = el.name || `Elevation ${idx + 1}`;
      pushMedia(elPrimary, label, isPdfUrl(elPrimary) ? 'file' : 'image');
    });
  }

  return media;
}

function buildPublicCommunityPayload({ community, profile, company, heroImage }) {
  const name = community.name || '';
  const slug = slugify(name);
  const builderName = company?.name || '';
  const builderSlug = slugify(company?.slug || builderName);

  return {
    companyId: community.company,
    communityId: community._id,
    name,
    slug,
    city: profile?.city || community.city || '',
    state: profile?.state || community.state || '',
    market: community.market || '',
    builder: { name: builderName, slug: builderSlug },
    promotion: profile?.promotion || '',
    amenities: Array.isArray(profile?.communityAmenities) ? profile.communityAmenities : [],
    fees: {
      hoaFee: profile?.hoaFee ?? null,
      hoaFrequency: profile?.hoaFrequency || '',
      tax: profile?.tax ?? null,
      mudFee: profile?.mudFee ?? null,
      pidFee: profile?.pidFee ?? null,
      pidFeeFrequency: profile?.pidFeeFrequency || '',
      feeTypes: Array.isArray(profile?.feeTypes) ? profile.feeTypes : []
    },
    heroImage: toPublicUrl(heroImage)
  };
}

function buildPublicHomePayload({ community, lot, floorPlan, profile, company, buildrootzCommunityId, publishVersion }) {
  const companyId = community.company;
  const title = lot.address || lot.jobNumber || lot.lot
    ? `${community.name || 'Home'} – ${lot.address || `Lot ${lot.lot || lot.jobNumber || ''}`}`.trim()
    : community.name || 'Home';

  const slugSource = [
    community.name,
    lot.lot || lot.jobNumber || lot._id
  ].filter(Boolean).join('-');

  const builderName = company?.name || '';
  const builderSlug = slugify(company?.slug || builderName);

  const floorPlanSpecs = floorPlan?.specs || {};

  const elevationFromPlan = (() => {
    const el = Array.isArray(floorPlan?.elevations) ? floorPlan.elevations.find((e) => e?.asset?.previewUrl || e?.asset?.fileUrl) : null;
    const url = el?.asset?.previewUrl || el?.asset?.fileUrl || '';
    return toPublicUrl(url);
  })();

  const liveElevation = toPublicUrl(lot.liveElevationPhoto);

  const images = dedupeStrings([
    liveElevation,
    toPublicUrl(lot.heroImage),
    ...(Array.isArray(lot.listingPhotos) ? lot.listingPhotos.map(toPublicUrl) : []),
    elevationFromPlan
  ]);

  const incentives = extractIncentives(lot.promoText, profile?.promotion);

  const coords = {
    lat: typeof lot.latitude === 'number' ? lot.latitude : null,
    lng: typeof lot.longitude === 'number' ? lot.longitude : null
  };

  return {
    companyId,
    communityId: community._id,
    buildrootzCommunityId: buildrootzCommunityId || null,
    sourceHomeId: lot._id,
    title,
    slug: slugify(slugSource || title),
    status: lot.generalStatus || lot.status || lot.buildingStatus || 'Available',
    address: {
      street: lot.address || '',
      city: community.city || profile?.city || '',
      state: community.state || profile?.state || '',
      zip: profile?.zip || ''
    },
    price: lot.listPrice ?? null,
    salesPrice: null,
    publishedAt: lot.publishedAt || null,
    plan: {
      name: floorPlan?.name || '',
      planNumber: floorPlan?.planNumber || ''
    },
    specs: {
      beds: floorPlanSpecs.beds ?? null,
      baths: floorPlanSpecs.baths ?? null,
      sqft: floorPlanSpecs.squareFeet ?? null,
      garage: floorPlanSpecs.garage ?? null
    },
    community: {
      name: community.name || '',
      city: community.city || '',
      state: community.state || '',
      slug: slugify(community.name || '')
    },
    builder: { name: builderName, slug: builderSlug },
    lotSize: profile?.lotSize || '',
    description: lot.listingDescription || '',
    highlights: lot.promoText || profile?.promotion || '',
    fees: {
      hoaFee: profile?.hoaFee ?? null,
      hoaFrequency: profile?.hoaFrequency || '',
      tax: profile?.tax ?? null,
      mudFee: profile?.mudFee ?? null,
      pidFee: profile?.pidFee ?? null,
      pidFeeFrequency: profile?.pidFeeFrequency || '',
      feeTypes: Array.isArray(profile?.feeTypes) ? profile.feeTypes : []
    },
    amenities: Array.isArray(profile?.communityAmenities) ? profile.communityAmenities : [],
    images,
    elevationImage: liveElevation || elevationFromPlan || '',
    schools: {
      isd: profile?.schoolISD || '',
      elementary: profile?.elementarySchool || '',
      middle: profile?.middleSchool || '',
      high: profile?.highSchool || ''
    },
    salesContact: {
      name: lot.salesContactName || profile?.salesPerson || '',
      phone: lot.salesContactPhone || profile?.salesPersonPhone || '',
      email: lot.salesContactEmail || profile?.salesPersonEmail || ''
    },
    modelAddress: {
      street: profile?.address || '',
      city: profile?.city || community.city || '',
      state: profile?.state || community.state || '',
      zip: profile?.zip || ''
    },
    floorPlanMedia: buildFloorPlanMedia(floorPlan),
    incentives,
    coordinates: coords,
    meta: {
      publishVersion: publishVersion ?? (lot.publishVersion || 0),
      sourceUpdatedAt: new Date()
    }
  };
}

async function updateLotFields({ communityId, lotId, companyId, fields }) {
  const $set = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    $set[`lots.$.${key}`] = value;
  });
  await Community.updateOne(
    { _id: communityId, company: companyId, 'lots._id': lotId },
    { $set }
  );
}

async function publishHome(homeId, companyId, userId) {
  const ctx = await fetchHomeContext(homeId, companyId);
  const { community, lot } = ctx;

  const prev = {
    isPublished: lot.isPublished || false,
    isListed: lot.isListed || false,
    publishedAt: lot.publishedAt || null,
    contentSyncedAt: lot.contentSyncedAt || null,
    buildrootzId: lot.buildrootzId || null,
    publishVersion: typeof lot.publishVersion === 'number' ? lot.publishVersion : 0
  };

  const now = new Date();
  const nextVersion = prev.publishVersion + 1;

  await updateLotFields({
    communityId: community._id,
    lotId: lot._id,
    companyId,
    fields: {
      isPublished: true,
      isListed: true,
      publishedAt: now,
      contentSyncedAt: now,
      publishVersion: nextVersion
    }
  });

  try {
    const freshCtx = { ...ctx, lot: { ...lot, publishedAt: now, publishVersion: nextVersion } };

    const publicCommunity = await PublicCommunity.findOneAndUpdate(
      { companyId, communityId: community._id },
      { $set: buildPublicCommunityPayload({ community, profile: ctx.profile, company: ctx.company, heroImage: lot.heroImage }) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const publicHome = await PublicHome.findOneAndUpdate(
      { companyId, sourceHomeId: lot._id },
      { $set: buildPublicHomePayload({ ...freshCtx, buildrootzCommunityId: publicCommunity?._id, publishVersion: nextVersion }) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await updateLotFields({
      communityId: community._id,
      lotId: lot._id,
      companyId,
    fields: {
      buildrootzId: publicHome._id,
      publishVersion: nextVersion,
      publishedAt: now,
      contentSyncedAt: now,
      isPublished: true,
      isListed: true
    }
  });

    console.info('[buildrootz] published home', { homeId: String(homeId), companyId: String(companyId), userId: String(userId || '') });
    return { publicHomeId: publicHome._id, publicCommunityId: publicCommunity?._id || null };
  } catch (err) {
    console.error('[buildrootz] publish failed, reverting KeepUP flags', err);
    await updateLotFields({
      communityId: community._id,
      lotId: lot._id,
      companyId,
    fields: {
      isPublished: prev.isPublished,
      isListed: prev.isListed,
      publishedAt: prev.publishedAt,
      contentSyncedAt: prev.contentSyncedAt,
      buildrootzId: prev.buildrootzId,
      publishVersion: prev.publishVersion
    }
  });
  throw err;
  }
}

async function unpublishHome(homeId, companyId, userId) {
  const ctx = await fetchHomeContext(homeId, companyId);
  const { community, lot } = ctx;

  const prev = {
    isPublished: lot.isPublished || false,
    isListed: lot.isListed || false,
    publishedAt: lot.publishedAt || null,
    contentSyncedAt: lot.contentSyncedAt || null,
    buildrootzId: lot.buildrootzId || null,
    publishVersion: typeof lot.publishVersion === 'number' ? lot.publishVersion : 0
  };

  const now = new Date();

  await updateLotFields({
    communityId: community._id,
    lotId: lot._id,
    companyId,
    fields: {
      isPublished: false,
      isListed: false,
      publishedAt: null,
      contentSyncedAt: now
    }
  });

  try {
    await PublicHome.deleteOne({ companyId, sourceHomeId: lot._id });

    await updateLotFields({
      communityId: community._id,
      lotId: lot._id,
      companyId,
    fields: { buildrootzId: null }
  });
  console.info('[buildrootz] unpublished home', { homeId: String(homeId), companyId: String(companyId), userId: String(userId || '') });
  return { ok: true };
} catch (err) {
  console.error('[buildrootz] unpublish failed, reverting KeepUP flags', err);
  await updateLotFields({
    communityId: community._id,
    lotId: lot._id,
    companyId,
    fields: {
      isPublished: prev.isPublished,
      isListed: prev.isListed,
      publishedAt: prev.publishedAt,
      contentSyncedAt: prev.contentSyncedAt,
      buildrootzId: prev.buildrootzId,
      publishVersion: prev.publishVersion
    }
  });
  throw err;
  }
}

async function syncHome(homeId, companyId, userId) {
  const ctx = await fetchHomeContext(homeId, companyId);
  const { community, lot } = ctx;
  const publishVersion = typeof lot.publishVersion === 'number' ? lot.publishVersion : 0;

  const publicCommunity = await PublicCommunity.findOneAndUpdate(
    { companyId, communityId: community._id },
    { $set: buildPublicCommunityPayload({ community, profile: ctx.profile, company: ctx.company, heroImage: lot.heroImage }) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const publicHome = await PublicHome.findOneAndUpdate(
    { companyId, sourceHomeId: lot._id },
    { $set: buildPublicHomePayload({ ...ctx, buildrootzCommunityId: publicCommunity?._id, publishVersion }) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const now = new Date();
  await updateLotFields({
    communityId: community._id,
    lotId: lot._id,
    companyId,
    fields: { contentSyncedAt: now }
  });

  console.info('[buildrootz] synced home', { homeId: String(homeId), companyId: String(companyId), userId: String(userId || '') });
  return { publicHomeId: publicHome._id, publicCommunityId: publicCommunity?._id || null };
}

module.exports = {
  publishHome,
  unpublishHome,
  syncHome
};
