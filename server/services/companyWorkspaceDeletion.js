const mongoose = require('mongoose');

const AuditLog = require('../models/AuditLog');
const AutoFollowUpAssignment = require('../models/AutoFollowUpAssignment');
const AutoFollowUpSchedule = require('../models/AutoFollowUpSchedule');
const AutomationRule = require('../models/AutomationRule');
const BrzPublishAudit = require('../models/BrzPublishAudit');
const BuildRootzCommunityRequest = require('../models/BuildRootzCommunityRequest');
const Comment = require('../models/comment');
const Community = require('../models/Community');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const Company = require('../models/Company');
const CompanyEmailDomain = require('../models/CompanyEmailDomain');
const Competition = require('../models/Competition');
const Contact = require('../models/Contact');
const ContactAssignment = require('../models/ContactAssignment');
const EmailAsset = require('../models/EmailAsset');
const EmailBlast = require('../models/EmailBlast');
const EmailEvent = require('../models/EmailEvent');
const EmailJob = require('../models/EmailJob');
const EmailSettings = require('../models/EmailSettings');
const EmailTemplate = require('../models/EmailTemplate');
const FeatureRequest = require('../models/FeatureRequest');
const FloorPlan = require('../models/FloorPlan');
const FloorPlanComp = require('../models/floorPlanComp');
const Lender = require('../models/lenderModel');
const PasswordToken = require('../models/PasswordToken');
const PriceRecord = require('../models/PriceRecord');
const QuickMoveIn = require('../models/quickMoveIn');
const Realtor = require('../models/Realtor');
const RealtorAssignment = require('../models/RealtorAssignment');
const SalesRecord = require('../models/salesRecord');
const SignupRequest = require('../models/SignupRequest');
const StripeEventLog = require('../models/StripeEventLog');
const Suppression = require('../models/Suppression');
const Task = require('../models/Task');
const User = require('../models/User');
const BrzBuilderProfileDraft = require('../models/brz/BrzBuilderProfileDraft');
const BrzCommunityDraft = require('../models/brz/BrzCommunityDraft');
const BrzCommunityFloorPlanDraft = require('../models/brz/BrzCommunityFloorPlanDraft');
const BrzFloorPlanDraft = require('../models/brz/BrzFloorPlanDraft');
const BrzPublishedSnapshot = require('../models/brz/BrzPublishedSnapshot');
const BuilderProfile = require('../models/buildrootz/BuilderProfile');
const PublicCommunity = require('../models/buildrootz/PublicCommunity');
const PublicHome = require('../models/buildrootz/PublicHome');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const toDeletedCount = (result) => Number(result?.deletedCount || 0);

const PRIORITY_SUMMARY_KEYS = [
  'company',
  'users',
  'contacts',
  'communities',
  'lots',
  'floorPlans',
  'realtors',
  'lenders',
  'signupRequests'
];
const SUMMARY_LABELS = {
  company: 'company',
  users: 'users',
  contacts: 'contacts',
  communities: 'communities',
  lots: 'lots',
  floorPlans: 'floor plans',
  realtors: 'realtors',
  lenders: 'lenders',
  signupRequests: 'signup requests'
};

const createCompanyFilter = (companyObjectId) => ({ company: companyObjectId });
const createCompanyIdFilter = (companyObjectId) => ({ companyId: companyObjectId });

const MODEL_OPERATIONS = [
  { key: 'auditLogs', label: 'Audit Logs', createFilter: createCompanyIdFilter, model: AuditLog },
  { key: 'contactAssignments', label: 'Contact Assignments', createFilter: createCompanyFilter, model: ContactAssignment },
  { key: 'realtorAssignments', label: 'Realtor Assignments', createFilter: createCompanyFilter, model: RealtorAssignment },
  { key: 'autoFollowUpAssignments', label: 'Auto Follow-Up Assignments', createFilter: createCompanyFilter, model: AutoFollowUpAssignment },
  { key: 'autoFollowUpSchedules', label: 'Auto Follow-Up Schedules', createFilter: createCompanyFilter, model: AutoFollowUpSchedule },
  { key: 'automationRules', label: 'Automation Rules', createFilter: createCompanyIdFilter, model: AutomationRule },
  { key: 'companyEmailDomains', label: 'Company Email Domains', createFilter: createCompanyIdFilter, model: CompanyEmailDomain },
  { key: 'emailSettings', label: 'Email Settings', createFilter: createCompanyIdFilter, model: EmailSettings },
  { key: 'emailTemplates', label: 'Email Templates', createFilter: createCompanyIdFilter, model: EmailTemplate },
  { key: 'emailAssets', label: 'Email Assets', createFilter: createCompanyIdFilter, model: EmailAsset },
  { key: 'emailBlasts', label: 'Email Blasts', createFilter: createCompanyIdFilter, model: EmailBlast },
  { key: 'emailJobs', label: 'Email Jobs', createFilter: createCompanyIdFilter, model: EmailJob },
  { key: 'emailEvents', label: 'Email Events', createFilter: createCompanyIdFilter, model: EmailEvent },
  { key: 'suppressions', label: 'Email Suppressions', createFilter: createCompanyIdFilter, model: Suppression },
  { key: 'featureRequests', label: 'Feature Requests', createFilter: createCompanyIdFilter, model: FeatureRequest },
  { key: 'stripeEventLogs', label: 'Stripe Event Logs', createFilter: createCompanyIdFilter, model: StripeEventLog },
  { key: 'buildrootzRequests', label: 'BuildRootz Requests', createFilter: createCompanyIdFilter, model: BuildRootzCommunityRequest },
  { key: 'brzPublishAudits', label: 'BRZ Publish Audits', createFilter: createCompanyIdFilter, model: BrzPublishAudit },
  { key: 'builderProfiles', label: 'Published Builder Profiles', createFilter: createCompanyIdFilter, model: BuilderProfile },
  { key: 'publicCommunities', label: 'Published Communities', createFilter: createCompanyIdFilter, model: PublicCommunity },
  { key: 'publicHomes', label: 'Published Homes', createFilter: createCompanyIdFilter, model: PublicHome },
  { key: 'brzBuilderProfileDrafts', label: 'BRZ Builder Profile Drafts', createFilter: createCompanyIdFilter, model: BrzBuilderProfileDraft },
  { key: 'brzCommunityDrafts', label: 'BRZ Community Drafts', createFilter: createCompanyIdFilter, model: BrzCommunityDraft },
  { key: 'brzCommunityFloorPlanDrafts', label: 'BRZ Community Floor Plan Drafts', createFilter: createCompanyIdFilter, model: BrzCommunityFloorPlanDraft },
  { key: 'brzFloorPlanDrafts', label: 'BRZ Floor Plan Drafts', createFilter: createCompanyIdFilter, model: BrzFloorPlanDraft },
  { key: 'brzPublishedSnapshots', label: 'BRZ Published Snapshots', createFilter: createCompanyIdFilter, model: BrzPublishedSnapshot },
  { key: 'comments', label: 'Comments', createFilter: createCompanyFilter, model: Comment },
  { key: 'tasks', label: 'Tasks', createFilter: createCompanyFilter, model: Task },
  { key: 'communityCompetitionProfiles', label: 'Community Competition Profiles', createFilter: createCompanyFilter, model: CommunityCompetitionProfile },
  { key: 'competitions', label: 'Competitions', createFilter: createCompanyFilter, model: Competition },
  { key: 'competitionFloorPlans', label: 'Competitive Floor Plans', createFilter: createCompanyFilter, model: FloorPlanComp },
  { key: 'priceRecords', label: 'Price Records', createFilter: createCompanyFilter, model: PriceRecord },
  { key: 'quickMoveIns', label: 'Quick Move-Ins', createFilter: createCompanyFilter, model: QuickMoveIn },
  { key: 'salesRecords', label: 'Sales Records', createFilter: createCompanyFilter, model: SalesRecord },
  { key: 'contacts', label: 'Contacts', createFilter: createCompanyFilter, model: Contact },
  { key: 'realtors', label: 'Realtors', createFilter: createCompanyFilter, model: Realtor },
  { key: 'lenders', label: 'Lenders', createFilter: createCompanyFilter, model: Lender },
  { key: 'floorPlans', label: 'Floor Plans', createFilter: createCompanyFilter, model: FloorPlan },
  { key: 'communities', label: 'Communities', createFilter: createCompanyFilter, model: Community },
  { key: 'signupRequests', label: 'Signup Requests', createFilter: createCompanyIdFilter, model: SignupRequest }
];

const buildCountItem = (key, label, count) => ({
  key,
  label,
  count: Number.isFinite(count) ? count : 0
});

const countEmbeddedLots = async (companyObjectId) => {
  const result = await Community.aggregate([
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
        total: { $sum: '$lotCount' }
      }
    }
  ]);

  return Number(result?.[0]?.total || 0);
};

const countPasswordTokens = async (userIds) => {
  if (!userIds.length) return 0;
  return PasswordToken.countDocuments({ userId: { $in: userIds } });
};

const deletePasswordTokens = async (userIds) => {
  if (!userIds.length) return 0;
  const result = await PasswordToken.deleteMany({ userId: { $in: userIds } });
  return toDeletedCount(result);
};

const summarizeDeletedCounts = (deletedCounts = {}) => {
  const summaryBits = PRIORITY_SUMMARY_KEYS
    .filter((key) => Number(deletedCounts[key] || 0) > 0)
    .map((key) => `${deletedCounts[key]} ${SUMMARY_LABELS[key] || key}`);

  const additionalGroups = Object.entries(deletedCounts)
    .filter(([key, value]) => Number(value || 0) > 0 && !PRIORITY_SUMMARY_KEYS.includes(key))
    .length;

  if (!summaryBits.length && !additionalGroups) {
    return 'No company-linked records were deleted.';
  }

  const prefix = summaryBits.join(', ');
  if (!additionalGroups) return prefix;
  if (!prefix) return `${additionalGroups} additional record groups removed.`;
  return `${prefix}, and ${additionalGroups} additional record groups removed.`;
};

async function buildCompanyWorkspaceDeletePreview(companyId) {
  if (!isObjectId(companyId)) {
    const err = new Error('Invalid company id');
    err.statusCode = 400;
    throw err;
  }

  const companyObjectId = new mongoose.Types.ObjectId(String(companyId));
  const company = await Company.findById(companyObjectId)
    .select('name slug createdAt')
    .lean();

  if (!company) {
    const err = new Error('Company not found');
    err.statusCode = 404;
    throw err;
  }

  const userDocs = await User.find({ company: companyObjectId }).select('_id').lean();
  const userIds = userDocs.map((user) => user._id);

  const [lots, passwordTokens, ...modelCounts] = await Promise.all([
    countEmbeddedLots(companyObjectId),
    countPasswordTokens(userIds),
    ...MODEL_OPERATIONS.map((entry) => entry.model.countDocuments(entry.createFilter(companyObjectId)))
  ]);

  const items = [
    buildCountItem('company', 'Company', 1),
    buildCountItem('users', 'Users', userIds.length),
    buildCountItem('passwordTokens', 'Password Tokens', passwordTokens),
    buildCountItem('lots', 'Lots (embedded under communities)', lots),
    ...MODEL_OPERATIONS.map((entry, index) => buildCountItem(entry.key, entry.label, modelCounts[index]))
  ];

  const counts = items.reduce((acc, item) => {
    acc[item.key] = item.count;
    return acc;
  }, {});

  return {
    company: {
      id: String(company._id),
      name: company.name || '',
      slug: company.slug || '',
      createdAt: company.createdAt || null
    },
    items,
    counts,
    previewSummaryLine: summarizeDeletedCounts(counts)
  };
}

async function deleteCompanyWorkspace(companyId, options = {}) {
  const preview = await buildCompanyWorkspaceDeletePreview(companyId);
  const confirmationName = String(options.confirmationName || '').trim();

  if (!confirmationName || confirmationName !== preview.company.name) {
    const err = new Error('Type the exact company name to confirm deletion.');
    err.statusCode = 400;
    err.code = 'CONFIRMATION_MISMATCH';
    throw err;
  }

  const companyObjectId = new mongoose.Types.ObjectId(String(companyId));
  const actorUserId = isObjectId(options.actorUserId) ? new mongoose.Types.ObjectId(String(options.actorUserId)) : null;
  const userDocs = await User.find({ company: companyObjectId }).select('_id').lean();
  const userIds = userDocs.map((user) => user._id);
  const deletedCounts = {
    lots: Number(preview.counts.lots || 0)
  };

  try {
    deletedCounts.passwordTokens = await deletePasswordTokens(userIds);

    for (const entry of MODEL_OPERATIONS) {
      const result = await entry.model.deleteMany(entry.createFilter(companyObjectId));
      deletedCounts[entry.key] = toDeletedCount(result);
    }

    deletedCounts.users = toDeletedCount(await User.deleteMany({ company: companyObjectId }));
    deletedCounts.company = toDeletedCount(await Company.deleteOne({ _id: companyObjectId }));
  } catch (err) {
    err.deletionSummary = {
      companyId: String(companyObjectId),
      companyName: preview.company.name,
      deletedCounts
    };
    console.error('[company-workspace-delete] deletion failed', {
      companyId: String(companyObjectId),
      companyName: preview.company.name,
      deletedCounts,
      error: err?.message || err
    });
    throw err;
  }

  const summaryLine = summarizeDeletedCounts(deletedCounts);
  let auditLogged = false;

  try {
    await AuditLog.create({
      companyId: companyObjectId,
      actorUserId,
      action: 'company_workspace_deleted',
      before: {
        company: preview.company,
        previewCounts: preview.counts
      },
      after: {
        deletedCounts,
        summaryLine
      },
      metadata: {
        deletionType: 'hard_delete_workspace',
        companyName: preview.company.name,
        companySlug: preview.company.slug
      }
    });
    auditLogged = true;
  } catch (auditErr) {
    console.error('[company-workspace-delete] failed to write audit log', {
      companyId: String(companyObjectId),
      companyName: preview.company.name,
      deletedCounts,
      error: auditErr?.message || auditErr
    });
  }

  console.info('[company-workspace-delete] completed', {
    companyId: String(companyObjectId),
    companyName: preview.company.name,
    deletedCounts,
    auditLogged
  });

  return {
    company: preview.company,
    deletedCounts,
    summaryLine,
    auditLogged
  };
}

module.exports = {
  buildCompanyWorkspaceDeletePreview,
  deleteCompanyWorkspace,
  summarizeDeletedCounts
};
