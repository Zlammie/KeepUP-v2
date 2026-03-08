/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const Company = require('../server/models/Company');
const Community = require('../server/models/Community');
const FloorPlan = require('../server/models/FloorPlan');
const BrzFloorPlanDraft = require('../server/models/brz/BrzFloorPlanDraft');
const BrzCommunityFloorPlanDraft = require('../server/models/brz/BrzCommunityFloorPlanDraft');

const DEFAULT_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const toStringId = (value) => (value == null ? '' : String(value));
const toNullableNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const dryRun = String(process.env.DRY_RUN || '1').trim() !== '0';
const companyFilterId = String(process.env.COMPANY_ID || '').trim();

async function migrateCompany(company) {
  const stats = {
    communities: 0,
    floorPlans: 0,
    offeringPairs: 0,
    insertedDrafts: 0,
    copiedPrices: 0
  };

  const communities = await Community.find({ company: company._id })
    .select('_id lots.floorPlan')
    .lean();
  stats.communities = communities.length;
  if (!communities.length) return stats;

  const communityIds = communities.map((community) => community._id);
  const lotFloorPlanIds = collectCommunityLotFloorPlanIds(communities)
    .map((id) => new mongoose.Types.ObjectId(id));
  const floorPlanOr = [{ communities: { $in: communityIds } }];
  if (lotFloorPlanIds.length) {
    floorPlanOr.push({ _id: { $in: lotFloorPlanIds } });
  }

  const floorPlans = await FloorPlan.find({
    company: company._id,
    $or: floorPlanOr
  })
    .select('_id communities')
    .lean();
  stats.floorPlans = floorPlans.length;
  if (!floorPlans.length) return stats;

  const offeredFloorPlanIdsByCommunity = buildCommunityOfferedFloorPlanIds({ communities, floorPlans });
  const floorPlanIds = floorPlans.map((floorPlan) => floorPlan._id);
  const planDrafts = await BrzFloorPlanDraft.find({
    companyId: company._id,
    floorPlanId: { $in: floorPlanIds }
  })
    .select('floorPlanId basePriceFrom basePriceAsOf')
    .lean();
  const planDraftByFloorPlanId = new Map(
    planDrafts.map((draft) => [toStringId(draft.floorPlanId), draft])
  );

  for (const [communityId, offeredIds] of offeredFloorPlanIdsByCommunity.entries()) {
    for (const floorPlanId of (Array.isArray(offeredIds) ? offeredIds : [])) {
      stats.offeringPairs += 1;

      const planDraft = planDraftByFloorPlanId.get(toStringId(floorPlanId));
      const fallbackPrice = toNullableNumber(planDraft?.basePriceFrom);
      const fallbackAsOf = planDraft?.basePriceAsOf ? new Date(planDraft.basePriceAsOf) : null;

      const existing = await BrzCommunityFloorPlanDraft.findOne({
        companyId: company._id,
        communityId,
        floorPlanId
      })
        .select('_id basePriceFrom')
        .lean();

      if (!existing) {
        stats.insertedDrafts += 1;
        if (!dryRun) {
          await BrzCommunityFloorPlanDraft.create({
            companyId: company._id,
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
          });
        }
      }

      const hasCommunityPrice = existing && toNullableNumber(existing.basePriceFrom) != null;
      if (hasCommunityPrice || fallbackPrice == null) continue;

      stats.copiedPrices += 1;
      if (!dryRun) {
        await BrzCommunityFloorPlanDraft.updateOne(
          {
            companyId: company._id,
            communityId,
            floorPlanId,
            $or: [{ basePriceFrom: null }, { basePriceFrom: { $exists: false } }]
          },
          {
            $set: {
              basePriceFrom: fallbackPrice,
              basePriceAsOf: fallbackAsOf || new Date(),
              basePriceVisibility: 'public'
            }
          }
        );
      }
    }
  }

  return stats;
}

(async () => {
  await mongoose.connect(DEFAULT_URI);
  try {
    const companyQuery = {};
    if (companyFilterId) {
      if (!isObjectId(companyFilterId)) {
        throw new Error('COMPANY_ID must be a valid ObjectId');
      }
      companyQuery._id = companyFilterId;
    }

    const companies = await Company.find(companyQuery).select('_id name').lean();
    if (!companies.length) {
      console.log('No companies matched the filter.');
      return;
    }

    console.log(
      `[migrate-plan-baseprice-to-community-offerings] dryRun=${dryRun ? 'yes' : 'no'} companies=${companies.length}`
    );

    const totals = {
      communities: 0,
      floorPlans: 0,
      offeringPairs: 0,
      insertedDrafts: 0,
      copiedPrices: 0
    };

    for (const company of companies) {
      const stats = await migrateCompany(company);
      Object.keys(totals).forEach((key) => {
        totals[key] += stats[key] || 0;
      });

      console.log(
        `[${company.name || company._id}] communities=${stats.communities} floorPlans=${stats.floorPlans} offeringPairs=${stats.offeringPairs} insertedDrafts=${stats.insertedDrafts} copiedPrices=${stats.copiedPrices}`
      );
    }

    console.log(
      `Done. communities=${totals.communities} floorPlans=${totals.floorPlans} offeringPairs=${totals.offeringPairs} insertedDrafts=${totals.insertedDrafts} copiedPrices=${totals.copiedPrices}`
    );
    if (dryRun) {
      console.log('Dry run only. Re-run with DRY_RUN=0 to apply changes.');
    }
  } finally {
    await mongoose.connection.close();
  }
})().catch((err) => {
  console.error('[migrate-plan-baseprice-to-community-offerings] failed:', err);
  process.exit(1);
});
