const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const PublicHome = require('../models/buildrootz/PublicHome');
const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const { buildMapGroupPackage } = require('../utils/mapGroupResolver');

const router = express.Router();

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const mapsBaseDir = path.join(process.cwd(), 'public', 'maps', 'communities');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const buildSlugRegex = (slug) => {
  const parts = normalizeSlug(slug).split(/-+/).filter(Boolean);
  if (!parts.length) return null;
  const pattern = `^${parts.map(escapeRegex).join('[\\s\\W_]+')}$`;
  return new RegExp(pattern, 'i');
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
    .select('name planNumber specs.squareFeet specs.beds specs.baths specs.garage')
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

  return {
    floorPlanName: planName ? String(planName) : '',
    floorPlanNumber: planNumber ? String(planNumber) : '',
    squareFeet: toNumber(specs.squareFeet),
    beds: toNumber(specs.beds),
    baths: toNumber(specs.baths),
    garage: toNumber(specs.garage)
  };
};

router.get('/communities/:communityId/builders', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    const communityObjectId = new mongoose.Types.ObjectId(communityId);

    const pipeline = [
      {
        $match: {
          publicCommunityId: communityObjectId,
          status: { $regex: /^model$/i }
        }
      },
      {
        $addFields: {
          builderKey: {
            $cond: [
              { $ifNull: ['$builderId', false] },
              '$builderId',
              {
                $cond: [
                  { $ifNull: ['$companyId', false] },
                  '$companyId',
                  {
                    $toLower: {
                      $ifNull: ['$builder.slug', '$builder.name']
                    }
                  }
                ]
              }
            ]
          },
          publishedFlag: { $cond: ['$published', 1, 0] }
        }
      },
      { $sort: { publishedFlag: -1, updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$builderKey',
          builderId: { $first: '$builderId' },
          companyId: { $first: '$companyId' },
          builder: { $first: '$builder' },
          listing: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'builderId',
          foreignField: '_id',
          as: 'builderDoc'
        }
      },
      {
        $project: {
          _id: 0,
          builderId: { $ifNull: ['$builderId', '$companyId'] },
          builderName: {
            $ifNull: [
              { $arrayElemAt: ['$builderDoc.name', 0] },
              '$builder.name'
            ]
          },
          modelListing: {
            id: '$listing._id',
            address: '$listing.address',
            status: '$listing.status',
            published: '$listing.published',
            updatedAt: '$listing.updatedAt',
            createdAt: '$listing.createdAt'
          }
        }
      }
    ];

    const rows = await PublicHome.aggregate(pipeline).allowDiskUse(true);

    const formatted = rows.map((row) => ({
      builderId: row.builderId ? String(row.builderId) : null,
      builderName: row.builderName || '',
      modelListing: row.modelListing
        ? {
            id: row.modelListing.id ? String(row.modelListing.id) : null,
            address: row.modelListing.address || {},
            status: row.modelListing.status || '',
            published: Boolean(row.modelListing.published),
            updatedAt: row.modelListing.updatedAt || null,
            createdAt: row.modelListing.createdAt || null
          }
        : null
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('[public community builders]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get(['/maps/:communitySlug/package', '/maps/package'], async (req, res) => {
  try {
    const rawSlug = String(req.params.communitySlug || req.query.community || '').trim();
    if (!rawSlug) {
      return res.status(400).json({ error: 'Community identifier is required' });
    }

    const selectFields = [
      'name',
      'communityName',
      'slug',
      'buildrootz.canonicalName',
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

    let community = null;
    if (isId(rawSlug)) {
      community = await Community.findById(rawSlug).select(selectFields).lean();
    } else {
      const slugRegex = buildSlugRegex(rawSlug);
      if (slugRegex) {
        community = await Community.findOne({
          $or: [
            { slug: slugRegex },
            { name: slugRegex },
            { communityName: slugRegex },
            { 'buildrootz.canonicalName': slugRegex }
          ]
        })
          .select(selectFields)
          .lean();
      }
    }

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const manifest = readMapManifest(community._id);
    if (!manifest?.overlayFile) {
      return res.status(404).json({ error: 'Map not found for community' });
    }

    const floorPlanMap = await buildFloorPlanMap(community);
    const links = (() => {
      if (!manifest.linksFile) return [];
      const linksPath = path.join(mapsBaseDir, String(community._id), manifest.linksFile);
      if (!fs.existsSync(linksPath)) return [];
      try {
        const raw = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
        return normalizeLinks(raw);
      } catch (err) {
        console.warn('[public map package] failed to parse links file', err);
        return [];
      }
    })();

    const lotLookup = buildLotLookup(Array.isArray(community.lots) ? community.lots : []);
    const lots = links
      .map((link) => {
        if (!link) return null;
        const regionId = String(link.regionId || link.region || '').trim();
        if (!regionId) return null;
        const matched = matchLotForLink(link, lotLookup);
        const lotLabel = pickFirst(matched?.lot, link.lotNumber, link.lot, link.label) || '';
        const address = pickFirst(matched?.address, link.address) || '';
        const status = extractStatus(matched, link);
        const listingUrl = sanitizeListingUrl(
          pickFirst(link.listingUrl, link.listingURL, link.url, link.href)
        );
        const planInfo = resolvePlanInfo(matched, floorPlanMap);
        const price = toNumber(matched?.listPrice) ?? toNumber(matched?.salesPrice);

        return {
          regionId,
          lotId: matched?._id ? String(matched._id) : (link.lotId ? String(link.lotId) : null),
          label: lotLabel ? String(lotLabel) : '',
          status,
          address,
          listingUrl,
          hasViewHomeLink: Boolean(matched?.hasViewHomeLink),
          floorPlanName: planInfo.floorPlanName,
          floorPlanNumber: planInfo.floorPlanNumber,
          squareFeet: planInfo.squareFeet,
          beds: planInfo.beds,
          baths: planInfo.baths,
          garage: planInfo.garage,
          price
        };
      })
      .filter(Boolean);

    const communityName = community.name || community.communityName || '';
    const communitySlug = community.slug || slugify(communityName);
    const planPalette = normalizePlanPalette(community.planPalette || {});
    const response = {
      community: {
        id: community._id ? String(community._id) : '',
        name: communityName,
        slug: communitySlug,
        planPalette
      },
      map: {
        backgroundUrl: manifest.backgroundFile ? `${manifest.basePath}/${manifest.backgroundFile}` : null,
        overlaySvgUrl: manifest.overlayFile ? `${manifest.basePath}/${manifest.overlayFile}` : null
      },
      lots
    };

    return res.json(response);
  } catch (err) {
    console.error('[public map package]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/map-groups/:groupSlug/package', async (req, res) => {
  try {
    const { groupSlug } = req.params;
    if (!groupSlug) {
      return res.status(400).json({ error: 'Group slug is required' });
    }

    const payload = await buildMapGroupPackage(groupSlug);
    if (!payload) {
      return res.status(404).json({ error: 'Map group not found' });
    }
    if (payload.error) {
      return res.status(404).json({ error: payload.error });
    }

    return res.json(payload);
  } catch (err) {
    console.error('[public map group package]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
