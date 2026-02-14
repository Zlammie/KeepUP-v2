const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Community = require('../models/Community');
const Company = require('../models/Company');
const FloorPlan = require('../models/FloorPlan');
const { resolveEmbedFeatures } = require('./embedFeatures');

const mapGroupsPath = path.join(__dirname, '..', 'config', 'mapGroups.json');
const mapsBaseDir = path.join(process.cwd(), 'public', 'maps', 'communities');

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildSlugRegex = (slug) => {
  const parts = normalizeSlug(slug).split(/-+/).filter(Boolean);
  if (!parts.length) return null;
  const pattern = `^${parts.map(escapeRegex).join('[\\s\\W_]+')}$`;
  return new RegExp(pattern, 'i');
};

const normalizeAddress = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeJobNumber = (value) => {
  const str = String(value || '').trim();
  return str ? str.padStart(4, '0') : '';
};

const buildLotKey = (lotNumber, block, phase) => {
  const lot = normalizeAddress(lotNumber);
  const blk = normalizeAddress(block);
  const ph = normalizeAddress(phase);
  if (!lot && !blk && !ph) return '';
  return `${lot}|${blk}|${ph}`;
};

const pickFirst = (...values) => values.find((value) => value != null && String(value).trim().length);

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePlanKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/^floor\s*plan\s*/i, '')
    .replace(/^plan\s*/i, '')
    .replace(/^#/, '')
    .trim();
};

const normalizePlanSlug = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let slug = raw;
  try {
    const url = new URL(raw);
    slug = url.pathname || '';
  } catch (_) {
    // not a URL
  }
  slug = slug.replace(/\\/g, '/');
  if (slug.includes('/')) {
    const parts = slug.split('/').filter(Boolean);
    slug = parts[parts.length - 1] || '';
  }
  slug = slug
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
};

const isHexColor = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());

const normalizePlanPalette = (input) => {
  const out = {};
  if (!input) return out;
  const source = input instanceof Map ? Object.fromEntries(input) : input;
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, value]) => {
    const trimmedKey = String(key || '').trim();
    if (!trimmedKey.startsWith('plan-')) return;
    const trimmedValue = String(value || '').trim().toLowerCase();
    if (!isHexColor(trimmedValue)) return;
    out[trimmedKey] = trimmedValue;
  });
  return out;
};

const STATUS_PALETTE_KEYS = new Set([
  'default',
  'available',
  'spec',
  'coming-soon',
  'hold',
  'model',
  'sold',
  'closed'
]);

const normalizeStatusKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const slug = raw.replace(/[_\s]+/g, '-');
  if (slug === 'comingsoon') return 'coming-soon';
  return slug;
};

const normalizeStatusPalette = (input) => {
  const out = {};
  if (!input) return out;
  const source = input instanceof Map ? Object.fromEntries(input) : input;
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, value]) => {
    const normalizedKey = normalizeStatusKey(key);
    if (!STATUS_PALETTE_KEYS.has(normalizedKey)) return;
    const trimmedValue = String(value || '').trim().toLowerCase();
    if (!isHexColor(trimmedValue)) return;
    out[normalizedKey] = trimmedValue;
  });
  return out;
};

const sanitizeListingUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch (_) {
    return null;
  }
  return null;
};

const buildFloorPlanUrl = (communitySlug, planSlug) => {
  const community = String(communitySlug || '').trim();
  const plan = String(planSlug || '').trim();
  if (!community || !plan) return '';
  return `https://grenadierhomes.com/communities/${community}/${plan}/`;
};

const loadMapGroupConfig = () => {
  if (!fs.existsSync(mapGroupsPath)) return { groups: {} };
  try {
    const raw = fs.readFileSync(mapGroupsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[map-group] Failed to read mapGroups.json', err);
    return { groups: {} };
  }
};

const getMapGroupConfig = (groupSlug) => {
  const slug = normalizeSlug(groupSlug);
  if (!slug) return { group: null, defaults: {} };
  const cfg = loadMapGroupConfig();
  const groups = cfg?.groups || {};
  return {
    group: groups[slug] || null,
    defaults: cfg?.defaults || {}
  };
};

const buildSlugPrefixRegex = (slug) => {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return new RegExp(`^${escapeRegex(normalized)}`, 'i');
};

const buildNameContainsRegex = (slug) => {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const spaced = escapeRegex(normalized).replace(/-+/g, '\\s+');
  return new RegExp(spaced, 'i');
};

const readMapManifest = (communityId) => {
  const dir = path.join(mapsBaseDir, String(communityId));
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = data?.files || {};
  const overlayFiles = Array.isArray(files.overlays) && files.overlays.length
    ? files.overlays
    : (files.overlay ? [files.overlay] : []);
  return {
    basePath: `/public/maps/communities/${communityId}`,
    overlayFile: overlayFiles[0] || null,
    backgroundFile: files.background || null,
    linksFile: files.links || null
  };
};

const normalizeLinks = (raw) => {
  if (raw?.links && Array.isArray(raw.links)) return raw.links;
  if (raw?.data?.links && Array.isArray(raw.data.links)) return raw.data.links;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw).map(([regionId, entry]) => ({ regionId, ...(entry || {}) }));
  }
  return [];
};

const loadLinks = (communityId, manifest) => {
  if (!manifest?.linksFile) return [];
  const linksPath = path.join(mapsBaseDir, String(communityId), manifest.linksFile);
  if (!fs.existsSync(linksPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
    return normalizeLinks(raw);
  } catch (err) {
    console.warn('[map-group] Failed to parse links file', err);
    return [];
  }
};

const buildLotLookup = (lots) => {
  const byAddress = new Map();
  const byJob = new Map();
  const byId = new Map();
  const byKey = new Map();

  lots.forEach((lot) => {
    if (!lot) return;
    if (lot._id) byId.set(String(lot._id), lot);
    const addrKey = normalizeAddress(lot.address);
    if (addrKey) byAddress.set(addrKey, lot);
    const jobKey = normalizeJobNumber(lot.jobNumber);
    if (jobKey) byJob.set(jobKey, lot);
    const lotKey = buildLotKey(lot.lot, lot.block, lot.phase);
    if (lotKey) byKey.set(lotKey, lot);
  });

  return { byAddress, byJob, byId, byKey };
};

const matchLotForLink = (link, lookup) => {
  if (!link || !lookup) return null;
  if (link.lotId && isId(link.lotId)) {
    const direct = lookup.byId.get(String(link.lotId));
    if (direct) return direct;
  }
  const addrKey = normalizeAddress(link.address);
  if (addrKey && lookup.byAddress.has(addrKey)) return lookup.byAddress.get(addrKey);
  const jobKey = normalizeJobNumber(link.jobNumber || link.job);
  if (jobKey && lookup.byJob.has(jobKey)) return lookup.byJob.get(jobKey);
  const lotKey = buildLotKey(link.lotNumber || link.lot, link.block, link.phase);
  if (lotKey && lookup.byKey.has(lotKey)) return lookup.byKey.get(lotKey);
  return null;
};

const findBaseCommunityForGroup = async (groupSlug) => {
  const slugRegex = buildSlugRegex(groupSlug);
  if (slugRegex) {
    const exact = await Community.findOne({
      $or: [
        { slug: slugRegex },
        { name: slugRegex },
        { communityName: slugRegex }
      ]
    })
      .select('name communityName slug company')
      .lean();
    if (exact && readMapManifest(exact._id)) return exact;
  }

  const prefixRegex = buildSlugPrefixRegex(groupSlug);
  const nameRegex = buildNameContainsRegex(groupSlug);
  if (!prefixRegex && !nameRegex) return null;

  const candidates = await Community.find({
    $or: [
      ...(prefixRegex ? [{ slug: prefixRegex }] : []),
      ...(nameRegex ? [{ name: nameRegex }, { communityName: nameRegex }] : [])
    ]
  })
    .select('name communityName slug company')
    .lean();

  for (const candidate of candidates) {
    if (readMapManifest(candidate._id)) return candidate;
  }
  return candidates[0] || null;
};

const buildAutoGroupConfig = async (groupSlug) => {
  const baseCommunity = await findBaseCommunityForGroup(groupSlug);
  if (!baseCommunity) return null;

  const normalizedGroup = normalizeSlug(groupSlug) || slugify(baseCommunity.slug || baseCommunity.name);
  const prefixRegex = buildSlugPrefixRegex(normalizedGroup);
  const nameRegex = buildNameContainsRegex(normalizedGroup);

  const siblings = await Community.find({
    company: baseCommunity.company,
    $or: [
      ...(prefixRegex ? [{ slug: prefixRegex }] : []),
      ...(nameRegex ? [{ name: nameRegex }, { communityName: nameRegex }] : [])
    ]
  })
    .select('name communityName slug company')
    .lean();

  const communities = siblings.length ? siblings : [baseCommunity];
  const usedKeys = new Set();
  const layers = communities.map((community) => {
    const label = community.name || community.communityName || community.slug || 'Community';
    let keyBase = slugify(community.slug || community.name || community.communityName || String(community._id));
    if (!keyBase) keyBase = `layer-${String(community._id).slice(-6)}`;
    let key = keyBase;
    let index = 1;
    while (usedKeys.has(key)) {
      key = `${keyBase}-${index}`;
      index += 1;
    }
    usedKeys.add(key);
    return {
      key,
      label,
      communityId: String(community._id)
    };
  });

  return {
    baseMapCommunityId: String(baseCommunity._id),
    layers
  };
};

const extractStatus = (lot, link) => (
  pickFirst(lot?.generalStatus, lot?.status, lot?.buildingStatus, link?.status) || ''
);

const extractFloorPlanId = (lot) => {
  if (!lot?.floorPlan) return null;
  if (typeof lot.floorPlan === 'string') return lot.floorPlan;
  if (typeof lot.floorPlan === 'object' && lot.floorPlan._id) return String(lot.floorPlan._id);
  return null;
};

const buildFloorPlanMap = async (community) => {
  if (!community?.company) return { byId: new Map(), byKey: new Map() };
  const lots = Array.isArray(community.lots) ? community.lots : [];
  const floorPlanIds = new Set();
  const planNames = new Set();
  const planNumbers = new Set();

  lots.forEach((lot) => {
    const fpId = extractFloorPlanId(lot);
    if (fpId && isId(fpId)) floorPlanIds.add(String(fpId));
    if (typeof fpId === 'string' && fpId && !isId(fpId)) planNames.add(fpId);
    if (lot?.floorPlanName) planNames.add(String(lot.floorPlanName));
    if (lot?.floorPlanNumber) planNumbers.add(String(lot.floorPlanNumber));
    const planObj = lot?.floorPlan;
    if (planObj && typeof planObj === 'object' && !planObj._bsontype) {
      if (planObj.name) planNames.add(String(planObj.name));
      if (planObj.planNumber) planNumbers.add(String(planObj.planNumber));
      if (planObj.title) planNames.add(String(planObj.title));
      if (planObj.code) planNames.add(String(planObj.code));
    }
  });

  const orFilters = [];
  if (floorPlanIds.size) {
    orFilters.push({ _id: { $in: Array.from(floorPlanIds) } });
  }
  if (planNames.size) {
    orFilters.push({ name: { $in: Array.from(planNames) } });
  }
  if (planNumbers.size) {
    orFilters.push({ planNumber: { $in: Array.from(planNumbers) } });
  }

  if (!orFilters.length) {
    return { byId: new Map(), byKey: new Map() };
  }

  const docs = await FloorPlan.find({
    company: community.company,
    $or: orFilters
  })
    .select('name planNumber websiteSlug websiteUrl specs.squareFeet specs.beds specs.baths specs.garage specs.stories')
    .lean();

  const byId = new Map();
  const byKey = new Map();
  docs.forEach((doc) => {
    const id = String(doc._id);
    byId.set(id, doc);
    const keyName = normalizePlanKey(doc.name);
    const keyNumber = normalizePlanKey(doc.planNumber);
    if (keyName) byKey.set(keyName, doc);
    if (keyNumber) byKey.set(keyNumber, doc);
  });

  return { byId, byKey };
};

const resolvePlanInfo = (lot, floorPlanMap) => {
  if (!lot) return {};
  const floorPlanId = extractFloorPlanId(lot);
  let planDoc = null;
  if (floorPlanId && floorPlanMap?.byId?.has?.(floorPlanId)) {
    planDoc = floorPlanMap.byId.get(floorPlanId);
  } else {
    const keyCandidates = [
      floorPlanId,
      lot.floorPlanName,
      lot.floorPlanNumber
    ]
      .map((val) => normalizePlanKey(val))
      .filter(Boolean);
    for (const key of keyCandidates) {
      if (floorPlanMap?.byKey?.has?.(key)) {
        planDoc = floorPlanMap.byKey.get(key);
        break;
      }
    }
  }

  const planObj = lot?.floorPlan && typeof lot.floorPlan === 'object' && !lot.floorPlan._bsontype
    ? lot.floorPlan
    : null;
  const fallbackName = pickFirst(
    lot.floorPlanName,
    lot.floorPlanNumber,
    planObj?.name,
    planObj?.planNumber,
    planObj?.title,
    planObj?.code,
    floorPlanId
  ) || '';
  const planName = pickFirst(
    planDoc?.name,
    planDoc?.planNumber,
    planObj?.name,
    planObj?.planNumber,
    planObj?.title,
    planObj?.code,
    fallbackName
  ) || '';
  const planNumber = pickFirst(planDoc?.planNumber, planObj?.planNumber, lot.floorPlanNumber) || '';
  const specs = planDoc?.specs || {};
  const websiteSlug = normalizePlanSlug(
    pickFirst(planDoc?.websiteSlug, planDoc?.websiteUrl, planObj?.websiteSlug, planObj?.websiteUrl)
  );

  return {
    floorPlanName: planName ? String(planName) : '',
    floorPlanNumber: planNumber ? String(planNumber) : '',
    websiteSlug: websiteSlug ? String(websiteSlug) : '',
    squareFeet: toNumber(specs.squareFeet),
    beds: toNumber(specs.beds),
    baths: toNumber(specs.baths),
    garage: toNumber(specs.garage),
    stories: toNumber(specs.stories)
  };
};

const resolveStatusPalette = async (communityId) => {
  if (!communityId) return {};
  const community = await Community.findById(communityId).select('company').lean();
  if (!community?.company) return {};
  const company = await Company.findById(community.company).select('mapStatusPalette').lean();
  return normalizeStatusPalette(company?.mapStatusPalette || {});
};

const buildLayerLots = (links, community, usedRegions, groupSlug, layerKey, floorPlanMap) => {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  const lookup = buildLotLookup(lots);
  const lotIds = [];
  const lotsById = {};
  const communitySlug = slugify(community?.slug || community?.name || community?.communityName || '');

  links.forEach((link) => {
    if (!link) return;
    const regionId = String(link.regionId || link.region || '').trim();
    if (!regionId) return;
    const matched = matchLotForLink(link, lookup);
    if (!matched) return;

    if (usedRegions.has(regionId)) {
      console.warn('[map-group] Duplicate region detected', {
        group: groupSlug,
        regionId,
        layer: layerKey
      });
      return;
    }

    const lotLabel = pickFirst(matched?.lot, link.lotNumber, link.lot, link.label) || '';
    const address = pickFirst(matched?.address, link.address) || '';
    const status = extractStatus(matched, link);
    const listingUrl = sanitizeListingUrl(
      pickFirst(link.listingUrl, link.listingURL, link.url, link.href)
    );
    const planInfo = resolvePlanInfo(matched, floorPlanMap);
    const price = toNumber(matched?.listPrice) ?? toNumber(matched?.salesPrice);

    lotsById[regionId] = {
      status,
      label: lotLabel ? String(lotLabel) : '',
      address,
      listingUrl,
      hasViewHomeLink: Boolean(matched?.hasViewHomeLink),
      floorPlanName: planInfo.floorPlanName,
      floorPlanNumber: planInfo.floorPlanNumber,
      floorPlanUrl: sanitizeListingUrl(buildFloorPlanUrl(communitySlug, planInfo.websiteSlug)),
      squareFeet: planInfo.squareFeet,
      beds: planInfo.beds,
      baths: planInfo.baths,
      garage: planInfo.garage,
      stories: planInfo.stories,
      price
    };
    lotIds.push(regionId);
    usedRegions.add(regionId);
  });

  return { lotIds, lotsById };
};

const fetchCommunityForLayer = async (communityId) => {
  if (!communityId) return null;
    const selectFields = [
      'name',
      'communityName',
      'slug',
      'planPalette',
      'lots._id',
      'lots.lot',
      'lots.block',
    'lots.phase',
    'lots.address',
    'lots.status',
    'lots.generalStatus',
    'lots.buildingStatus',
    'lots.jobNumber',
    'lots.floorPlan',
    'lots.floorPlanName',
    'lots.hasViewHomeLink',
    'lots.listPrice',
    'lots.salesPrice',
    'company'
  ].join(' ');

  if (isId(communityId)) {
    return Community.findById(communityId).select(selectFields).lean();
  }

  const slugRegex = buildSlugRegex(communityId);
  if (!slugRegex) return null;
  return Community.findOne({
    $or: [
      { slug: slugRegex },
      { name: slugRegex },
      { communityName: slugRegex }
    ]
  })
    .select(selectFields)
    .lean();
};

const buildPackageFromGroup = async (groupSlug, group, baseManifest, baseFeatures = null) => {
  const baseCommunityId = group.baseMapCommunityId;
  const links = loadLinks(baseCommunityId, baseManifest);
  const usedRegions = new Set();
  const statusPalette = await resolveStatusPalette(baseCommunityId);
  // Defaults preserve legacy embeds; config can selectively disable features.
  const groupFeatures = resolveEmbedFeatures(baseFeatures, group?.features);

  const layers = [];
  let resolvedLayerCount = 0;
  for (const layer of group.layers || []) {
    const layerCommunity = await fetchCommunityForLayer(layer.communityId);
    if (layerCommunity) resolvedLayerCount += 1;
    const floorPlanMap = await buildFloorPlanMap(layerCommunity);
    const layerLots = buildLayerLots(
      links,
      layerCommunity,
      usedRegions,
      groupSlug,
      layer.key,
      floorPlanMap
    );
    const layerFeatures = resolveEmbedFeatures(groupFeatures, layer?.features);
    layers.push({
      key: layer.key,
      label: layer.label,
      communityId: layerCommunity?._id ? String(layerCommunity._id) : '',
      features: layerFeatures,
      planPalette: normalizePlanPalette(layerCommunity?.planPalette || {}),
      lotIds: layerLots.lotIds,
      lotsById: layerLots.lotsById
    });
  }

  return {
    payload: {
      group: {
        slug: slugify(groupSlug)
      },
      features: groupFeatures,
      baseMap: {
        backgroundUrl: baseManifest.backgroundFile
          ? `${baseManifest.basePath}/${baseManifest.backgroundFile}`
          : null,
        overlaySvgUrl: baseManifest.overlayFile
          ? `${baseManifest.basePath}/${baseManifest.overlayFile}`
          : null
      },
      layers,
      statusPalette
    },
    resolvedLayerCount
  };
};

const buildMapGroupPackage = async (groupSlug) => {
  const config = getMapGroupConfig(groupSlug);
  const defaultFeatures = resolveEmbedFeatures(config?.defaults?.features);
  let group = config?.group;
  let usedAuto = false;
  if (!group) {
    group = await buildAutoGroupConfig(groupSlug);
    usedAuto = true;
  }
  if (!group) return null;

  if (!group.baseMapCommunityId && !usedAuto) {
    group = await buildAutoGroupConfig(groupSlug);
    usedAuto = true;
  }
  if (!group?.baseMapCommunityId) return null;

  let baseManifest = readMapManifest(group.baseMapCommunityId);
  if (!baseManifest?.overlayFile && !usedAuto) {
    const autoGroup = await buildAutoGroupConfig(groupSlug);
    if (autoGroup?.baseMapCommunityId) {
      group = autoGroup;
      usedAuto = true;
      baseManifest = readMapManifest(group.baseMapCommunityId);
    }
  }
  if (!baseManifest?.overlayFile) return { error: 'Map not found for base community' };

  const { payload, resolvedLayerCount } = await buildPackageFromGroup(
    groupSlug,
    group,
    baseManifest,
    defaultFeatures
  );

  if (!usedAuto && resolvedLayerCount === 0) {
    const autoGroup = await buildAutoGroupConfig(groupSlug);
    if (autoGroup?.baseMapCommunityId) {
      const autoManifest = readMapManifest(autoGroup.baseMapCommunityId);
      if (autoManifest?.overlayFile) {
        const autoResult = await buildPackageFromGroup(
          groupSlug,
          autoGroup,
          autoManifest,
          defaultFeatures
        );
        if (autoResult.resolvedLayerCount > 0) {
          return autoResult.payload;
        }
      }
    }
  }

  return payload;
};

module.exports = {
  getMapGroupConfig,
  buildMapGroupPackage
};
