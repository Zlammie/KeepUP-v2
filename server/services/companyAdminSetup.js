const mongoose = require('mongoose');

const Company = require('../models/Company');
const Community = require('../models/Community');
const Contact = require('../models/Contact');
const FloorPlan = require('../models/FloorPlan');
const User = require('../models/User');
const { getSeatCounts } = require('../utils/seatCounts');
const {
  KEEPUP_MANAGED_BILLING_MESSAGE,
  deriveStripeBillability,
  isSelfServeBillingBlocked
} = require('../utils/stripeBillingPolicy');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeStripeStatus = (status) => String(status || '').trim().toLowerCase();
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const ACTIVE_USER_STATUSES = [User.STATUS.ACTIVE, User.STATUS.INVITED];

const isBuildrootzActiveForStripe = (company) => {
  const feature = company?.features?.buildrootz || {};
  const status = normalizeStripeStatus(feature.status);
  if (status) return status === 'active';
  return !!feature.enabled;
};

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

async function buildCompanyAdminSetupSummary(companyId) {
  if (!isObjectId(companyId)) {
    throw new Error('Invalid company context');
  }

  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const [
    company,
    communityCount,
    floorPlanCount,
    linkedFloorPlanCount,
    contactCount,
    activeOrInvitedUserCount,
    seatCounts,
    websiteMapActiveQty,
    lotCountResult
  ] = await Promise.all([
    Company.findById(companyObjectId)
      .select(
        [
          'name',
          'address',
          'primaryContact',
          'branding.logoUrl',
          'settings.timezone',
          'billing',
          'billingPolicy',
          'features.buildrootz',
          'features.websiteMap'
        ].join(' ')
      )
      .lean(),
    Community.countDocuments({ company: companyObjectId }),
    FloorPlan.countDocuments({ company: companyObjectId }),
    FloorPlan.countDocuments({ company: companyObjectId, 'communities.0': { $exists: true } }),
    Contact.countDocuments({ company: companyObjectId }),
    User.countDocuments({ company: companyObjectId, status: { $in: ACTIVE_USER_STATUSES } }),
    getSeatCounts(companyObjectId),
    Community.countDocuments({ company: companyObjectId, 'websiteMap.status': 'active' }),
    Community.aggregate([
      { $match: { company: companyObjectId } },
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
    ])
  ]);

  if (!company) {
    throw new Error('Company not found');
  }

  const totalLots = Number(lotCountResult?.[0]?.totalLots || 0);
  const companyProfileChecks = [
    hasText(company.name),
    hasText(company.address?.street),
    hasText(company.address?.city),
    hasText(company.address?.state),
    hasText(company.address?.zip),
    hasText(company.primaryContact?.name),
    hasText(company.primaryContact?.email),
    hasText(company.primaryContact?.phone),
    hasText(company.settings?.timezone),
    hasText(company.branding?.logoUrl)
  ];
  const companyProfileComplete = companyProfileChecks.every(Boolean);

  const seatsConfigured = Number(company.billing?.seatsPurchased || 0) > 0;
  const billingManagedByKeepUp = isSelfServeBillingBlocked(company);
  const stripeBillability = deriveStripeBillability(company, {
    activeUsers: seatCounts.active,
    buildrootzActive: isBuildrootzActiveForStripe(company),
    websiteMapActiveQty
  });
  const paymentMethodReady =
    billingManagedByKeepUp
    || !stripeBillability.shouldUseStripe
    || !!company.billing?.hasPaymentMethodOnFile
    || hasText(company.billing?.stripeSubscriptionId)
    || hasText(company.billing?.stripeCustomerId);
  const billingComplete = seatsConfigured && paymentMethodReady;

  const requiredTasks = [
    buildTask({
      key: 'company-profile',
      title: 'Complete Company Profile',
      description: 'Add company details, address, primary contact, timezone, and logo.',
      complete: companyProfileComplete,
      actionHref: '/admin-section?tab=company',
      actionLabel: 'Review Company Profile',
      detail: companyProfileComplete
        ? 'Company profile is complete.'
        : 'Company name, full address, primary contact info, timezone, and logo are required.',
      category: 'required'
    }),
    buildTask({
      key: 'billing-setup',
      title: 'Set Up Billing',
      description: 'Confirm seats and make sure billing or managed-seat coverage is in place.',
      complete: billingComplete,
      actionHref: '/admin-section?tab=billing',
      actionLabel: 'Review Billing',
      detail: billingManagedByKeepUp
        ? KEEPUP_MANAGED_BILLING_MESSAGE
        : billingComplete
          ? `Seats confirmed at ${company.billing?.seatsPurchased || 0}. Billing is satisfied.`
          : seatsConfigured
            ? 'Seats are configured, but payment or subscription setup still needs attention.'
            : 'Confirm the seat count first.',
      category: 'required'
    }),
    buildTask({
      key: 'first-community',
      title: 'Add First Community',
      description: 'Create your first community so teams can manage inventory and listings.',
      complete: communityCount > 0,
      actionHref: '/community-management',
      actionLabel: communityCount > 0 ? 'Manage Communities' : 'Add First Community',
      detail: communityCount > 0
        ? `${formatCountLabel(communityCount, 'community')} available.`
        : 'No communities have been created yet.',
      category: 'required'
    })
  ];

  const recommendedTasks = [
    buildTask({
      key: 'floor-plans',
      title: 'Add Floor Plans',
      description: 'Load at least one floor plan so communities and lots can reference it.',
      complete: floorPlanCount > 0,
      actionHref: '/add-floorplan',
      actionLabel: floorPlanCount > 0 ? 'Manage Floor Plans' : 'Add Floor Plans',
      detail: floorPlanCount > 0
        ? `${formatCountLabel(floorPlanCount, 'floor plan')} added.`
        : 'No floor plans added yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'link-floor-plans',
      title: 'Link Floor Plans to Communities',
      description: 'Associate floor plans with communities so availability and pricing stay connected.',
      complete: linkedFloorPlanCount > 0,
      actionHref: '/add-floorplan',
      actionLabel: 'Link Floor Plans',
      detail: linkedFloorPlanCount > 0
        ? `${formatCountLabel(linkedFloorPlanCount, 'floor plan')} already linked to a community.`
        : 'No floor plans are linked to communities yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'invite-team',
      title: 'Invite Team Members',
      description: 'Bring in at least one more teammate so the workspace is ready for daily use.',
      complete: activeOrInvitedUserCount > 1,
      actionHref: '/admin-section?tab=users',
      actionLabel: 'Manage Team Members',
      detail: activeOrInvitedUserCount > 1
        ? `${formatCountLabel(activeOrInvitedUserCount, 'team member')} with login access.`
        : 'Only the initial company admin is set up so far.',
      category: 'recommended'
    }),
    buildTask({
      key: 'import-contacts',
      title: 'Import Contacts',
      description: 'Load leads so your team has real contacts to work from inside KeepUP.',
      complete: contactCount > 0,
      actionHref: '/contacts',
      actionLabel: contactCount > 0 ? 'View Contacts' : 'Import Contacts',
      detail: contactCount > 0
        ? `${formatCountLabel(contactCount, 'contact')} in the workspace.`
        : 'No contacts imported yet.',
      category: 'recommended'
    }),
    buildTask({
      key: 'upload-lots',
      title: 'Upload Lots',
      description: 'Add lots so communities can support inventory, pricing, and listing workflows.',
      complete: totalLots > 0,
      actionHref: '/view-lots',
      actionLabel: totalLots > 0 ? 'Manage Lots' : 'Upload Lots',
      detail: totalLots > 0
        ? `${formatCountLabel(totalLots, 'lot')} currently loaded.`
        : 'No lots uploaded yet.',
      category: 'recommended'
    })
  ];

  const allTasks = [...requiredTasks, ...recommendedTasks];
  const completedTaskCount = allTasks.filter((task) => task.complete).length;
  const requiredCompletedCount = requiredTasks.filter((task) => task.complete).length;
  const recommendedCompletedCount = recommendedTasks.filter((task) => task.complete).length;
  const progressPercent = allTasks.length ? Math.round((completedTaskCount / allTasks.length) * 100) : 0;
  const requiredPercent = requiredTasks.length ? Math.round((requiredCompletedCount / requiredTasks.length) * 100) : 0;
  const requiredComplete = requiredCompletedCount === requiredTasks.length;

  return {
    company: {
      id: String(company._id),
      name: company.name || '',
      seatCount: Number(company.billing?.seatsPurchased || 0)
    },
    metrics: {
      communities: communityCount,
      floorPlans: floorPlanCount,
      linkedFloorPlans: linkedFloorPlanCount,
      contacts: contactCount,
      lots: totalLots,
      usersWithAccess: activeOrInvitedUserCount,
      activeUsers: seatCounts.active,
      invitedUsers: seatCounts.invited
    },
    progress: {
      totalTasks: allTasks.length,
      completedTasks: completedTaskCount,
      percent: progressPercent,
      requiredTotal: requiredTasks.length,
      requiredCompleted: requiredCompletedCount,
      requiredPercent,
      recommendedTotal: recommendedTasks.length,
      recommendedCompleted: recommendedCompletedCount
    },
    requiredComplete,
    requiredTasks,
    recommendedTasks
  };
}

module.exports = {
  buildCompanyAdminSetupSummary
};
