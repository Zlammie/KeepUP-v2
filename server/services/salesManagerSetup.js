const mongoose = require('mongoose');

const Community = require('../models/Community');
const Contact = require('../models/Contact');
const FloorPlan = require('../models/FloorPlan');
const Lender = require('../models/lenderModel');
const Realtor = require('../models/Realtor');
const User = require('../models/User');
const { getAllowedCommunityIds } = require('../utils/communityScope');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const formatCountLabel = (count, singular, plural = `${singular}s`) => {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
};

const buildTask = ({
  key,
  title,
  description,
  complete,
  actionHref,
  actionLabel,
  detail,
  category
}) => ({
  key,
  title,
  description,
  complete: !!complete,
  actionHref,
  actionLabel,
  detail: detail || '',
  category
});

async function buildSalesManagerSetupSummary(userLike = {}) {
  const companyId = userLike?.company;
  if (!isObjectId(companyId)) {
    throw new Error('Invalid company context');
  }

  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const allowedCommunityIds = getAllowedCommunityIds(userLike).filter(isObjectId);
  const allowedCommunityObjectIds = allowedCommunityIds.map((id) => new mongoose.Types.ObjectId(id));
  const hasCommunityRestrictions = allowedCommunityObjectIds.length > 0;

  const communityFilter = hasCommunityRestrictions
    ? { company: companyObjectId, _id: { $in: allowedCommunityObjectIds } }
    : { company: companyObjectId };
  const contactFilter = hasCommunityRestrictions
    ? { company: companyObjectId, communityIds: { $in: allowedCommunityObjectIds } }
    : { company: companyObjectId };
  const floorPlanFilter = hasCommunityRestrictions
    ? { company: companyObjectId, communities: { $in: allowedCommunityObjectIds } }
    : { company: companyObjectId };

  const [communityCount, totalLotsResult, contactCount, floorPlanCount, lenderCount, realtorCount, buyerStatusCount] =
    await Promise.all([
      Community.countDocuments(communityFilter),
      Community.aggregate([
        { $match: communityFilter },
        {
          $project: {
            lotCount: {
              $size: {
                $ifNull: ['$lots', []]
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalLots: { $sum: '$lotCount' }
          }
        }
      ]),
      Contact.countDocuments(contactFilter),
      FloorPlan.countDocuments(floorPlanFilter),
      Lender.countDocuments({ company: companyObjectId }),
      Realtor.countDocuments({ company: companyObjectId }),
      Contact.countDocuments({
        ...contactFilter,
        $or: [
          { statusHistory: { $exists: true, $ne: [] } },
          { status: { $nin: ['', 'New'] } }
        ]
      })
    ]);

  const totalLots = Number(totalLotsResult?.[0]?.totalLots || 0);

  const primaryTasks = [
    buildTask({
      key: 'assigned-communities',
      title: 'Review Assigned Communities',
      description: 'Make sure you can access the communities you are expected to manage.',
      complete: communityCount > 0,
      actionHref: '/view-communities',
      actionLabel: communityCount > 0 ? 'Review Communities' : 'Open Communities',
      detail: communityCount > 0
        ? hasCommunityRestrictions
          ? `${formatCountLabel(communityCount, 'assigned community')} available to you.`
          : `${formatCountLabel(communityCount, 'community')} available across the company.`
        : 'No communities are currently available in your visible scope.',
      category: 'primary'
    }),
    buildTask({
      key: 'first-contacts',
      title: 'Add or Import First Contacts',
      description: 'Load leads so the team has real buyers to work and follow up with.',
      complete: contactCount > 0,
      actionHref: '/contacts',
      actionLabel: contactCount > 0 ? 'View Contacts' : 'Import Contacts',
      detail: contactCount > 0
        ? `${formatCountLabel(contactCount, 'contact')} available in your working scope.`
        : 'No contacts are available in your working scope yet.',
      category: 'primary'
    }),
    buildTask({
      key: 'lot-workflow',
      title: 'Review Lot / Community Workflow',
      description: 'Open the lot and community workflow so inventory operations are ready to use.',
      complete: communityCount > 0 && totalLots > 0,
      actionHref: '/view-lots',
      actionLabel: totalLots > 0 ? 'Review Lots' : 'Open Lots',
      detail: communityCount > 0 && totalLots > 0
        ? `${formatCountLabel(totalLots, 'lot')} available across your visible communities.`
        : communityCount > 0
          ? 'Communities exist, but no lots are loaded yet.'
          : 'Start by confirming communities, then review lots.',
      category: 'primary'
    })
  ];

  const recommendedTasks = [
    buildTask({
      key: 'manage-lots',
      title: 'Upload or Manage Lots',
      description: 'Load or review lot inventory so the team can work current availability.',
      complete: totalLots > 0,
      actionHref: '/view-lots',
      actionLabel: totalLots > 0 ? 'Manage Lots' : 'Upload Lots',
      detail: totalLots > 0
        ? `${formatCountLabel(totalLots, 'lot')} already loaded.`
        : 'No lots have been loaded yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'review-floor-plans',
      title: 'Review Floor Plans',
      description: 'Make sure floor plans exist so communities and lots can reference them.',
      complete: floorPlanCount > 0,
      actionHref: '/add-floorplan',
      actionLabel: floorPlanCount > 0 ? 'Review Floor Plans' : 'Open Floor Plans',
      detail: floorPlanCount > 0
        ? `${formatCountLabel(floorPlanCount, 'floor plan')} in your visible scope.`
        : 'No floor plans are available in your visible scope yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'add-lenders',
      title: 'Add Lenders',
      description: 'Set up lender records so financing workflows have the right partners attached.',
      complete: lenderCount > 0,
      actionHref: '/lenders',
      actionLabel: lenderCount > 0 ? 'Manage Lenders' : 'Add Lenders',
      detail: lenderCount > 0
        ? `${formatCountLabel(lenderCount, 'lender')} available.`
        : 'No lenders have been added yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'add-realtors',
      title: 'Add Realtors',
      description: 'Keep your Realtor partner list current for lead attribution and follow-up.',
      complete: realtorCount > 0,
      actionHref: '/realtors',
      actionLabel: realtorCount > 0 ? 'Manage Realtors' : 'Add Realtors',
      detail: realtorCount > 0
        ? `${formatCountLabel(realtorCount, 'realtor')} available.`
        : 'No realtors have been added yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'buyer-statuses',
      title: 'Start Updating Buyer Statuses',
      description: 'Move contacts through statuses so the pipeline reflects real buyer progress.',
      complete: buyerStatusCount > 0,
      actionHref: '/contacts',
      actionLabel: 'Update Buyer Statuses',
      detail: buyerStatusCount > 0
        ? `${formatCountLabel(buyerStatusCount, 'contact')} already has a tracked buyer status.`
        : 'No buyer statuses have been updated beyond new/default yet.',
      category: 'recommended'
    })
  ];

  const allTasks = [...primaryTasks, ...recommendedTasks];
  const completedTaskCount = allTasks.filter((task) => task.complete).length;
  const primaryCompletedCount = primaryTasks.filter((task) => task.complete).length;
  const recommendedCompletedCount = recommendedTasks.filter((task) => task.complete).length;
  const progressPercent = allTasks.length ? Math.round((completedTaskCount / allTasks.length) * 100) : 0;
  const primaryPercent = primaryTasks.length ? Math.round((primaryCompletedCount / primaryTasks.length) * 100) : 0;
  const primaryComplete = primaryCompletedCount === primaryTasks.length;

  return {
    scope: {
      companyId: String(companyObjectId),
      hasCommunityRestrictions,
      assignedCommunityIds: allowedCommunityIds
    },
    metrics: {
      communities: communityCount,
      contacts: contactCount,
      lots: totalLots,
      floorPlans: floorPlanCount,
      lenders: lenderCount,
      realtors: realtorCount,
      buyerStatuses: buyerStatusCount
    },
    progress: {
      totalTasks: allTasks.length,
      completedTasks: completedTaskCount,
      percent: progressPercent,
      primaryTotal: primaryTasks.length,
      primaryCompleted: primaryCompletedCount,
      primaryPercent,
      recommendedTotal: recommendedTasks.length,
      recommendedCompleted: recommendedCompletedCount
    },
    primaryComplete,
    primaryTasks,
    recommendedTasks
  };
}

module.exports = {
  buildSalesManagerSetupSummary
};
