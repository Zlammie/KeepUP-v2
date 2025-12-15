// routes/pages.js (tenant-scoped, READONLY-gated)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');


const Contact     = require('../models/Contact');
const Realtor     = require('../models/Realtor');
const Lender      = require('../models/lenderModel');
const Community   = require('../models/Community');
const Competition = require('../models/Competition');
const FloorPlanComp = require('../models/floorPlanComp');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const Company = require('../models/Company');
const Task = require('../models/Task');
const User = require('../models/User');
const AutoFollowUpSchedule = require('../models/AutoFollowUpSchedule');
const AutoFollowUpAssignment = require('../models/AutoFollowUpAssignment');
const { hydrateTaskLinks, groupTasksByAttachment } = require('../utils/taskLinkedDetails');
const {
  filterCommunitiesForUser,
  hasCommunityAccess,
  getAllowedCommunityIds,
} = require('../utils/communityScope');

const isId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const isCompanyAdmin = req => (req.user?.roles || []).includes('COMPANY_ADMIN');
const base = req => (isSuper(req) ? {} : { company: req.user.company });
const normalizeGarageType = (value) => {
  const norm = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (norm === 'front') return 'Front';
  if (norm === 'rear') return 'Rear';
  return null;
};

const formatRoleName = (role) => {
  if (!role || typeof role !== 'string') return 'Team Member';
  return role
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const buildAutoFollowUpSchedules = () => {
  return [
    {
      id: 'rapid-response',
      name: 'Rapid Lead Reply',
      summary: '4 touchpoints during the first 48 hours that mix text, email, and a personal call.',
      targetStage: 'New Lead',
      defaultOwner: 'Online Sales Concierge',
      tags: ['Speed to Lead', 'Text + Call', 'Automation'],
      metrics: { durationDays: 3, touchpoints: 4 },
      lastUpdatedAt: '2025-10-04T15:30:00.000Z',
      steps: [
        {
          id: 'rr-step-1',
          dayOffset: 0,
          channel: 'SMS',
          title: 'Instant text introduction',
          ownerRole: 'Online Sales Concierge',
          instructions: 'Quick intro + question to confirm preferred contact method.',
          waitForReply: true
        },
        {
          id: 'rr-step-2',
          dayOffset: 0,
          channel: 'Call',
          title: 'First call: qualify and offer appointment',
          ownerRole: 'Online Sales Concierge',
          instructions: 'Use call sheet + log outcome in KeepUP.',
          waitForReply: false
        },
        {
          id: 'rr-step-3',
          dayOffset: 1,
          channel: 'Email',
          title: 'Send curated community recap',
          ownerRole: 'Marketing Assist',
          instructions: 'Include floorplan packet + CTA for scheduling.',
          waitForReply: false
        },
        {
          id: 'rr-step-4',
          dayOffset: 2,
          channel: 'SMS',
          title: 'Reminder text with quick CTA',
          ownerRole: 'Online Sales Concierge',
          instructions: 'Friendly reminder referencing value prop from call.',
          waitForReply: true
        }
      ]
    },
    {
      id: 'handoff-cadence',
      name: 'Warm Handoff to Community Rep',
      summary: 'Ensures the onsite team connects after OSC books an appointment.',
      targetStage: 'Appointment Scheduled',
      defaultOwner: 'Community Representative',
      tags: ['Handoff', 'Onsite Team'],
      metrics: { durationDays: 6, touchpoints: 3 },
      lastUpdatedAt: '2025-09-15T10:00:00.000Z',
      steps: [
        {
          id: 'wh-step-1',
          dayOffset: 0,
          channel: 'Email',
          title: 'Meeting confirmation + driving directions',
          ownerRole: 'Community Representative',
          instructions: 'Personalize greeting + include parking instructions.',
          waitForReply: false
        },
        {
          id: 'wh-step-2',
          dayOffset: 2,
          channel: 'Call',
          title: 'Pre-tour reminder call',
          ownerRole: 'Community Representative',
          instructions: 'Confirm attendees + capture any blockers.',
          waitForReply: false
        },
        {
          id: 'wh-step-3',
          dayOffset: 6,
          channel: 'SMS',
          title: 'Quick check-in after visit',
          ownerRole: 'Community Representative',
          instructions: 'Send thank you text + next-step CTA.',
          waitForReply: true
        }
      ]
    },
    {
      id: 'nurture-vip',
      name: 'VIP Prospect Nurture',
      summary: 'Longer cadence for high-intent prospects that need weekly touches.',
      targetStage: 'Warm Nurture',
      defaultOwner: 'Sales Manager',
      tags: ['High Intent', '12 Day Program'],
      metrics: { durationDays: 12, touchpoints: 5 },
      lastUpdatedAt: '2025-08-22T09:12:00.000Z',
      steps: [
        {
          id: 'vip-step-1',
          dayOffset: 0,
          channel: 'Email',
          title: 'Roadmap email with next steps',
          ownerRole: 'Sales Manager',
          instructions: 'Reference financing + build timeline.',
          waitForReply: false
        },
        {
          id: 'vip-step-2',
          dayOffset: 3,
          channel: 'SMS',
          title: 'Share quick video update',
          ownerRole: 'Sales Manager',
          instructions: 'Embed video link + confirm availability.',
          waitForReply: true
        },
        {
          id: 'vip-step-3',
          dayOffset: 6,
          channel: 'Call',
          title: 'Value call: incentives + timelines',
          ownerRole: 'Sales Manager',
          instructions: 'Discuss incentive expiration + capture objections.',
          waitForReply: false
        },
        {
          id: 'vip-step-4',
          dayOffset: 9,
          channel: 'Email',
          title: 'Send curated progress photos',
          ownerRole: 'Marketing Assist',
          instructions: 'Attach latest site progress or design boards.',
          waitForReply: false
        },
        {
          id: 'vip-step-5',
          dayOffset: 12,
          channel: 'SMS',
          title: 'Next-step CTA and closing check',
          ownerRole: 'Sales Manager',
          instructions: 'Confirm readiness + schedule final review.',
          waitForReply: true
        }
      ]
    }
  ];
};

const DEFAULT_STAGE_OPTIONS = ['New Lead', 'Warm Nurture', 'Appointment Scheduled', 'Under Contract', 'Post Close'];
const DEFAULT_OWNER_OPTIONS = ['Online Sales Concierge', 'Community Representative', 'Sales Manager', 'Marketing Assist'];
const DEFAULT_CHANNEL_OPTIONS = ['SMS', 'Email', 'Call', 'Reminder', 'Meeting'];
const DEFAULT_BUILDER_STEPS = [
  {
    id: 'builder-step-1',
    dayOffset: 0,
    channel: 'SMS',
    title: 'Instant text introduction',
    ownerRole: DEFAULT_OWNER_OPTIONS[0],
    instructions: 'Quickly acknowledge the inquiry and ask a qualifying question.',
    waitForReply: true
  },
  {
    id: 'builder-step-2',
    dayOffset: 1,
    channel: 'Email',
    title: 'Send curated community highlights',
    ownerRole: DEFAULT_OWNER_OPTIONS[3],
    instructions: 'Attach gallery or brochure with CTA to schedule time.',
    waitForReply: false
  },
  {
    id: 'builder-step-3',
    dayOffset: 3,
    channel: 'Call',
    title: 'Live check-in call',
    ownerRole: DEFAULT_OWNER_OPTIONS[0],
    instructions: 'Use the call guide to cover financing + timeline.',
    waitForReply: false
  }
];

const buildScheduleBuilderPreset = (overrides = {}) => {
  const stageOptions =
    Array.isArray(overrides.stageOptions) && overrides.stageOptions.length
      ? overrides.stageOptions
      : DEFAULT_STAGE_OPTIONS;
  const ownerOptions =
    Array.isArray(overrides.ownerOptions) && overrides.ownerOptions.length
      ? overrides.ownerOptions
      : DEFAULT_OWNER_OPTIONS;
  const channelOptions =
    Array.isArray(overrides.channelOptions) && overrides.channelOptions.length
      ? overrides.channelOptions
      : DEFAULT_CHANNEL_OPTIONS;
  const baseSteps =
    Array.isArray(overrides.steps) && overrides.steps.length ? overrides.steps : DEFAULT_BUILDER_STEPS;

  const normalizedSteps = baseSteps.map((step, index) => {
    const selectedChannel = channelOptions.includes(step.channel) ? step.channel : channelOptions[0];
    const selectedOwner = ownerOptions.includes(step.ownerRole) ? step.ownerRole : ownerOptions[0];
    return {
      id: step.id || `builder-step-${index + 1}`,
      dayOffset: Number.isFinite(step.dayOffset) ? step.dayOffset : index * 2,
      channel: selectedChannel,
      title: step.title || `Touchpoint ${index + 1}`,
      ownerRole: selectedOwner,
      instructions: step.instructions || '',
      waitForReply: Boolean(step.waitForReply)
    };
  });

  return {
    name: overrides.name || 'New Follow-Up Schedule',
    description:
      overrides.description ||
      'Outline the cadence you want KeepUP to run automatically once the schedule is applied.',
    stageOptions,
    ownerOptions,
    channelOptions,
    defaultStage: overrides.defaultStage || stageOptions[0],
    defaultOwner: overrides.defaultOwner || ownerOptions[0],
    steps: normalizedSteps
  };
};

const transformScheduleDocForView = (schedule) => {
  if (!schedule) return null;
  const steps = Array.isArray(schedule.steps) ? schedule.steps : [];
  const touchpoints = steps.length;
  const durationDays = steps.reduce((max, step) => {
    const offset = Number(step?.dayOffset ?? 0);
    if (Number.isNaN(offset)) return max;
    return Math.max(max, offset);
  }, 0);

  return {
    id: String(schedule._id),
    name: schedule.name,
    summary: schedule.summary || schedule.description || '',
    targetStage: schedule.stage || 'General',
    defaultOwner: schedule.defaultOwnerRole || 'Team',
    tags: Array.isArray(schedule.tags) ? schedule.tags : [],
    metrics: {
      durationDays,
      touchpoints
    },
    lastUpdatedAt: schedule.updatedAt || schedule.createdAt || null,
    steps: steps.map((step, index) => ({
      id: step.stepId || (step._id ? String(step._id) : `step-${index}`),
      dayOffset: step.dayOffset ?? 0,
      channel: step.channel || 'SMS',
      title: step.title || `Step ${index + 1}`,
      ownerRole: step.ownerRole || schedule.defaultOwnerRole || 'Team',
      instructions: step.instructions || '',
      waitForReply: Boolean(step.waitForReply)
    }))
  };
};

// ????????????????????????? core pages ?????????????????????????
router.get(['/', '/index'], ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/index', { active: 'home' })
);

router.get('/add-lead', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-lead', { active: 'add-lead' })
);

router.get(
  '/task',
  ensureAuth,
  requireRole('READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const allowedTaskViews = ['task', 'calendar', 'settings'];
      const requestedTaskView =
        typeof req.query.view === 'string' ? req.query.view.trim().toLowerCase() : 'task';
      const taskView = allowedTaskViews.includes(requestedTaskView) ? requestedTaskView : 'task';

      if (taskView === 'settings') {
        const companyFilter = req.user?.company ? { company: req.user.company } : { ...base(req) };
        const [scheduleDocs, teamMembers, assignments] = await Promise.all([
          AutoFollowUpSchedule.find(companyFilter).sort({ updatedAt: -1 }).lean(),
          User.find(companyFilter)
            .select('firstName lastName email roles status lastLoginAt')
            .sort({ firstName: 1, lastName: 1 })
            .lean(),
          AutoFollowUpAssignment.find(companyFilter)
            .populate('schedule', 'name status')
            .select('schedule user status')
            .lean()
        ]);

        const followUpSchedules = scheduleDocs.length
          ? scheduleDocs.map(transformScheduleDocForView).filter(Boolean)
          : buildAutoFollowUpSchedules();

        const assignmentByUserId = new Map();
        assignments.forEach((assignment) => {
          const key = assignment?.user ? String(assignment.user._id || assignment.user) : null;
          if (key) assignmentByUserId.set(key, assignment);
        });

        const teamScheduleAssignments = teamMembers.map((member) => {
          const nameParts = [member.firstName, member.lastName].filter(Boolean);
          const displayName = nameParts.length ? nameParts.join(' ') : member.email || 'Team Member';
          const roles = Array.isArray(member.roles) && member.roles.length ? member.roles : ['USER'];
          const primaryRole = roles[0];
          const normalizedStatus = typeof member.status === 'string' ? member.status.toUpperCase() : 'ACTIVE';

          const assignment = assignmentByUserId.get(String(member._id));
          const scheduleRef = assignment?.schedule || null;
          const currentScheduleId = scheduleRef ? String(scheduleRef._id || scheduleRef) : null;

          return {
            id: String(member._id),
            name: displayName,
            email: member.email || '',
            role: formatRoleName(primaryRole),
            status: normalizedStatus,
            lastLoginAt: member.lastLoginAt || null,
            currentScheduleId: currentScheduleId || null,
            assignmentStatus: assignment?.status || null
          };
        });

        const totalSchedules = followUpSchedules.length;
        const totalSteps = followUpSchedules.reduce(
          (sum, schedule) => sum + (schedule.metrics?.touchpoints || 0),
          0
        );
        const averageTouches = totalSchedules ? Math.round(totalSteps / totalSchedules) : 0;
        const longestCadenceDays = followUpSchedules.reduce(
          (max, schedule) => Math.max(max, schedule.metrics?.durationDays || 0),
          0
        );
        const activeTeammates = teamScheduleAssignments.filter(
          (member) => member.status && member.status.toUpperCase() === 'ACTIVE'
        ).length;

        const stageOptionSet = new Set(DEFAULT_STAGE_OPTIONS);
        followUpSchedules.forEach((schedule) => {
          if (schedule.targetStage) stageOptionSet.add(schedule.targetStage);
        });

        const ownerOptionSet = new Set(DEFAULT_OWNER_OPTIONS);
        followUpSchedules.forEach((schedule) => {
          if (schedule.defaultOwner) ownerOptionSet.add(schedule.defaultOwner);
        });
        teamMembers.forEach((member) => {
          const primaryRole =
            Array.isArray(member.roles) && member.roles.length ? member.roles[0] : 'USER';
          ownerOptionSet.add(formatRoleName(primaryRole));
        });

        const scheduleBuilderPreset = buildScheduleBuilderPreset({
          stageOptions: Array.from(stageOptionSet),
          ownerOptions: Array.from(ownerOptionSet)
        });

        const autoFollowUpStats = {
          librarySize: totalSchedules,
          activeTeammates,
          averageTouches,
          longestCadenceDays
        };

        const taskSettingsData = {
          schedules: followUpSchedules,
          builderPreset: scheduleBuilderPreset,
          stats: autoFollowUpStats,
          teamAssignments: teamScheduleAssignments,
          endpoints: {
            schedules: '/api/task-schedules',
            assignments: '/api/task-schedules/assignments'
          }
        };

        return res.render('pages/task-settings', {
          active: 'task',
          taskView,
          followUpSchedules,
          scheduleBuilderPreset,
          autoFollowUpStats,
          teamScheduleAssignments,
          taskSettingsData
        });
      }

      const baseFilter = { ...base(req) };
      const allowedStatuses = Array.isArray(Task.STATUS)
        ? Task.STATUS.filter((status) => status !== 'Completed')
        : ['Pending', 'In Progress', 'Overdue'];

      const filter = {
        ...baseFilter,
        status: { $in: allowedStatuses }
      };

      const assignedId = isId(req.user?._id) ? new mongoose.Types.ObjectId(req.user._id) : null;
      const canViewAll =
        isSuper(req) ||
        isCompanyAdmin(req) ||
        (req.user?.roles || []).includes('MANAGER');

      if (!canViewAll) {
        if (assignedId) {
          filter.assignedTo = assignedId;
        } else {
          filter._id = { $in: [] }; // bail safely if we cannot scope to a user
        }
      }

      const tasks = await Task.find(filter)
        .sort({ dueDate: 1, priority: -1, createdAt: -1 })
        .limit(500)
        .lean();

      await hydrateTaskLinks(tasks, {
        companyIds: baseFilter.company ? [baseFilter.company] : []
      });

      const categories = Array.isArray(Task.CATEGORIES) ? Task.CATEGORIES.slice() : [];
      const fallbackCategory = categories.includes('Custom')
        ? 'Custom'
        : categories[0] || 'Custom';

      const grouped = new Map();
      categories.forEach((category) => grouped.set(category, []));
      grouped.set(fallbackCategory, grouped.get(fallbackCategory) || []);

      tasks.forEach((task) => {
        const category = categories.includes(task.category) ? task.category : fallbackCategory;
        grouped.get(category).push(task);
      });

      const taskGroups = categories
        .map((category) => {
          const categoryTasks = grouped.get(category) || [];
          return {
            category,
            tasks: categoryTasks,
            linkedGroups: category === 'System' ? groupTasksByAttachment(categoryTasks) : []
          };
        })
        .filter((group) => Array.isArray(group.tasks) && group.tasks.length > 0);

      const allowedCommunityIds = Array.isArray(req.user?.allowedCommunityIds)
        ? req.user.allowedCommunityIds.filter((id) => isId(id))
        : [];

      let managedCommunities = [];
      if (allowedCommunityIds.length) {
        const communityObjectIds = allowedCommunityIds.map((id) => new mongoose.Types.ObjectId(id));
        managedCommunities = await Community.find({
          ...baseFilter,
          _id: { $in: communityObjectIds }
        })
          .select('name city state')
          .sort({ name: 1 })
          .lean();
      }

      const contactIds = Array.from(
        new Set(
          tasks
            .filter((task) => task && task.linkedModel === 'Contact' && task.linkedId)
            .map((task) => String(task.linkedId))
        )
      );

      let purchaserContacts = [];
      let contactStatuses = [];
      if (contactIds.length) {
        const contactObjectIds = contactIds.map((id) => new mongoose.Types.ObjectId(id));
        const contacts = await Contact.find({
          ...baseFilter,
          _id: { $in: contactObjectIds }
        })
          .select('firstName lastName status')
          .lean();

        const contactMeta = new Map();
        contacts.forEach((contact) => {
          const key = String(contact._id);
          const label = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || 'Contact';
          const statusValue =
            typeof contact.status === 'string' && contact.status.trim().length
              ? contact.status.trim()
              : 'Unknown';
          contactMeta.set(key, { key, label, status: statusValue });
        });

        if (contactMeta.size) {
          const contactTaskCounts = new Map();
          tasks.forEach((task) => {
            if (!task || task.linkedModel !== 'Contact' || !task.linkedId) return;
            const key = String(task.linkedId);
            contactTaskCounts.set(key, (contactTaskCounts.get(key) || 0) + 1);
          });

          const prioritizedStatusBuckets = [
            { key: 'new', label: 'New' },
            { key: 'target', label: 'Target' },
            { key: 'possible', label: 'Possible' },
            { key: 'negotiation', label: 'Negotiation' },
            { key: 'beback', label: 'Be-Back' }
          ];
          const bucketLabels = new Map(
            prioritizedStatusBuckets.map((bucket) => [bucket.key, bucket.label])
          );
          const bucketCounts = new Map();

          contactTaskCounts.forEach((count, key) => {
            const meta = contactMeta.get(key);
            if (!meta) return;
            const normalized = (meta.status || '').toLowerCase();
            const canonical = normalized.replace(/[^a-z]/g, '') || 'unknown';
            if (canonical === 'purchased') return;
            const bucketKey = bucketLabels.has(canonical) ? canonical : 'misc';
            const bucketLabel = bucketLabels.has(canonical) ? bucketLabels.get(canonical) : 'Misc';
            const existing =
              bucketCounts.get(bucketKey) || { key: bucketKey, label: bucketLabel, count: 0 };
            existing.label = bucketLabel;
            existing.count += count;
            bucketCounts.set(bucketKey, existing);
          });

          contactStatuses = [];
          prioritizedStatusBuckets.forEach((bucket) => {
            const entry = bucketCounts.get(bucket.key);
            if (entry && entry.count > 0) {
              contactStatuses.push(entry);
            }
          });
          const miscEntry = bucketCounts.get('misc');
          if (miscEntry && miscEntry.count > 0) {
            contactStatuses.push(miscEntry);
          }

          purchaserContacts = Array.from(contactMeta.values())
            .filter((meta) => (meta.status || '').toLowerCase() === 'purchased')
            .map((meta) => ({
              key: meta.key,
              label: meta.label,
              count: contactTaskCounts.get(meta.key) || 0
            }))
            .filter((entry) => entry.count > 0)
            .sort((a, b) => a.label.localeCompare(b.label));
        }
      }

      const taskMeta = {
        categories,
        statuses: Array.isArray(Task.STATUS) ? Task.STATUS : [],
        priorities: Array.isArray(Task.PRIORITIES) ? Task.PRIORITIES : [],
        types: Array.isArray(Task.TYPES) ? Task.TYPES : []
      };

      const calendarTasks = tasks.map((task) => {
        if (!task || typeof task !== 'object') {
          return {
            id: '',
            title: 'Task',
            category: 'Custom',
            status: 'Pending',
            priority: 'Medium',
            dueDate: null,
            linkedModel: null,
            linkedLabel: ''
          };
        }

        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
        const dueDateIso =
          dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null;

        let linkedLabel = '';
        if (typeof task.linkedName === 'string' && task.linkedName.trim()) {
          linkedLabel = task.linkedName.trim();
        } else if (task.linkedModel === 'Community' && task.linkedCommunityName) {
          linkedLabel = task.linkedCommunityName;
        } else if (task.linkedModel === 'Competition') {
          linkedLabel = task.linkedName || 'Competition';
        } else if (task.linkedModel) {
          linkedLabel = task.linkedModel;
        }

        return {
          id: task._id ? String(task._id) : '',
          title: task.title || 'Task',
          category: task.category || 'Custom',
          status: task.status || 'Pending',
          priority: task.priority || 'Medium',
          dueDate: dueDateIso,
          linkedModel: task.linkedModel || null,
          linkedLabel,
          description: task.description || ''
        };
      });

      const commonViewData = {
        active: 'task',
        taskView,
        taskGroups,
        taskMeta,
        managedCommunities,
        purchaserContacts,
        contactStatuses
      };

      if (taskView === 'calendar') {
        return res.render('pages/calendar', {
          ...commonViewData,
          calendarTasks
        });
      }

      res.render('pages/task', commonViewData);
    } catch (err) {
      next(err);
    }
  }
);

// ????????????????????????? lists ?????????????????????????
router.get('/contacts', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const filter = { ...base(req) }; // tenant scope
      if (!isSuper(req)) {
        const allowed = getAllowedCommunityIds(req.user || {});
        const ownerObjectId = isId(req.user?._id) ? new mongoose.Types.ObjectId(req.user._id) : null;

        if (allowed.length) {
          const allowedObjectIds = allowed
            .filter(isId)
            .map(id => new mongoose.Types.ObjectId(id));
          const orClauses = [{ communityIds: { $in: allowedObjectIds } }];
          if (ownerObjectId) orClauses.push({ ownerId: ownerObjectId });
          filter.$or = orClauses;
        } else if (!isCompanyAdmin(req)) {
          if (ownerObjectId) filter.ownerId = ownerObjectId;
          else filter._id = { $in: [] };
        }
      }

      const contacts = await Contact.find(filter)
        .select('firstName lastName email phone status communityIds realtorId lenderId lotId ownerId updatedAt')
        .populate('communityIds', 'name')                                  // array of communities
        .populate('realtorId', 'firstName lastName brokerage email phone') // real field
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone') // real field
        .populate('lotId',     'jobNumber lot block address')
        .populate('ownerId',   'email firstName lastName')
        .sort({ updatedAt: -1 })
        .lean();

      res.render('pages/contacts', { contacts, active: 'contacts' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/realtors', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const realtors = await Realtor.find({ ...base(req) })
      .select('firstName lastName email phone brokerage company')
      .lean();
    res.render('pages/realtors', { realtors, active: 'realtors' });
  }
);

router.get('/lenders', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const lenders = await Lender.find({ ...base(req) })
      .select('firstName lastName email phone lenderBrokerage visitDate company')
      .lean();
    res.render('pages/lenders', { lenders, active: 'lenders' });
  }
);

// ????????????????????????? community pages ?????????????????????????
router.get('/community-management', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/community-management', { active: 'community' })
);

router.get('/view-communities', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const communities = await Community.find({ ...base(req) })
      .select('name city state totalLots company')
      .lean();
    const scoped = filterCommunitiesForUser(req.user, communities);
    res.render('pages/view-communities', { communities: scoped, active: 'community' });
  }
);

router.get('/add-floorplan', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-floorplan', { active: 'floor-plans' })
);

router.get('/view-lots', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    let communityId = isId(req.query.communityId) ? req.query.communityId : '';
    if (communityId && !hasCommunityAccess(req.user, communityId)) {
      communityId = '';
    }
    res.render('pages/view-lots', { communityId, active: 'community' });
  }
);

router.get('/address-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    const { communityId, lotId } = req.query;
    if (communityId && !isId(communityId)) return res.status(400).send('Invalid community ID');
    if (lotId && !isId(lotId)) return res.status(400).send('Invalid lot ID');
    if (communityId && !hasCommunityAccess(req.user, communityId)) {
      return res.status(404).send('Community not found');
    }
    res.render('pages/address-details', { communityId, lotId, active: 'community' });
  }
);

// ????????????????????????? details: contact / realtor / lender ?????????????????????????
router.get('/contact-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const id = req.query.id;
      if (!isId(id)) return res.status(400).send('Invalid contact ID');

      const contact = await Contact.findOne({ _id: id, ...base(req) })
        .select('firstName lastName email phone visitDate status notes source communityIds realtorId lenderId lenderStatus lenderInviteDate lenderApprovedDate linkedLot lotLineUp buyTime buyMonth facing living investor renting ownSelling ownNotSelling')
        .populate('realtorId', 'firstName lastName brokerage')
        .populate('lenderId',  'firstName lastName lenderBrokerage')
        .lean();
      if (contact?.visitDate) {
        const dt = new Date(contact.visitDate);
        if (!Number.isNaN(dt.valueOf())) { contact.visitDate = dt.toISOString(); }
      }
      if (!contact) return res.status(404).send('Contact not found');

      res.render('pages/contact-details', { contact, active: 'contacts' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/realtor-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const id = req.query.id;
    if (!isId(id)) return res.status(400).send('Invalid realtor ID');

    const realtor = await Realtor.findOne({ _id: id, ...base(req) }).lean();
    if (!realtor) return res.status(404).send('Realtor not found');

    const contacts = await Contact.find({ ...base(req), realtorId: id })
      .select('firstName lastName email phone')
      .lean();
    res.render('pages/realtor-details', { realtor, contacts, active: 'realtors' });
  }
);

router.get('/lender-view', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const id = req.query.id;
    if (!isId(id)) return res.status(400).send('Invalid lender ID');

    const lender = await Lender.findOne({ _id: id, ...base(req) })
      .populate('company', 'name')
      .lean();
    if (!lender) return res.status(404).send('Lender not found');

    // adjust this filter to your actual schema: either "lenders: { $in: [id] }" (array) or "linkedLender: id" (single)
    const contacts = await Contact.find({ ...base(req), lenderId: id })
   .select('firstName lastName email phone')
   .lean();

    res.render('pages/lender-view', { lender, contacts, active: 'lenders' });
  }
);

// ????????????????????????? competition pages ?????????????????????????
router.get('/competition-home', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/competition-home', { active: 'competition' })
);

router.get('/add-competition', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-competition', { active: 'add-competition' })
);

router.get('/manage-competition', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/manage-competition', { active: 'manage-competition' })
);

router.get('/competition-details/:id', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).send('Invalid competition ID');

    const comp = await Competition.findOne({ _id: id, ...base(req) })
      // include fields consumed by competition-details view
      .select([
          'communityName','builderName','address','city','state','zip','company',
          'builderWebsite','modelPlan','lotSize','garageType','totalLots',
          'schoolISD','elementarySchool','middleSchool','highSchool',
          'hoaFee','hoaFrequency','tax','feeTypes','mudFee','pidFee','pidFeeFrequency',
          'promotion','pros','cons','monthlyMetrics','communityAmenities','soldLots','quickMoveInLots',
          'salesPerson','salesPersonPhone','salesPersonEmail'
        ].join(' '))
      .lean();
    if (!comp) return res.status(404).send('Competition not found');

    const garageType = normalizeGarageType(comp.garageType);
    comp.garageType = garageType;

    const floorPlans = await FloorPlanComp.find({ competition: comp._id, ...base(req) })
      .select('name')
      .lean();

    res.render('pages/competition-details', {
      active: 'competition',
      competition: comp,
      floorPlans: floorPlans.map(fp => fp.name)
    });
  }
);

router.get('/update-competition/:id', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).send('Invalid competition ID');

    const comp = await Competition.findOne({ _id: id, ...base(req) }).lean();
    if (!comp) return res.status(404).send('Competition not found');

    const garageType = normalizeGarageType(comp.garageType);
    comp.garageType = garageType;

    res.render('pages/update-competition', { active: 'competition', competition: comp });
  }
);

// ????????????????????????? my community competition pages ?????????????????????????
router.get('/manage-my-community-competition/:communityId',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).send('Invalid community ID');

    const community = await Community.findOne({ _id: communityId, ...base(req) })
      .select('name city state company')
      .lean();
    if (!community) return res.status(404).send('Community not found');

    // Pull company from community first, then fall back to the competition profile's company if needed
    const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...base(req) })
      .select('company')
      .lean();
    const companyRef = community.company || profile?.company;

    // Resolve a friendly company name mirroring my-community-competition behavior
    let companyName = '';
    if (companyRef && typeof companyRef === 'object' && (companyRef.name || companyRef.companyName)) {
      companyName = companyRef.name || companyRef.companyName || companyRef.title || companyRef.label || '';
    } else if (companyRef) {
      const companyId = (typeof companyRef === 'object' && companyRef._id) ? companyRef._id : companyRef;
      const companyDoc = await Company.findById(companyId).select('name companyName title label').lean();
      if (companyDoc) {
        companyName = companyDoc.name || companyDoc.companyName || companyDoc.title || companyDoc.label || '';
      }
    }

    const communityWithCompany = companyName ? { ...community, companyName } : community;

    res.render('pages/manage-my-community-competition', { communityId, community: communityWithCompany, profile: null });
  }
);

router.get('/my-community-competition',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/my-community-competition', { title: 'My Company - Competition' })
);

router.get('/competition-dashboard',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    const communityId = isId(req.query.communityId) ? req.query.communityId : '';
    res.render('pages/competition-dashboard', {
      active: 'competition',
      communityId,
      currentUserId: req.user?._id ? String(req.user._id) : ''
    });
  }
);

// ????????????????????????? toolbar/help ?????????????????????????
router.get('/toolbar/help', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/toolbar/help', {})
);

router.get('/admin-section',
  ensureAuth,
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/admin-section', { active: 'admin-section' })
);

router.get('/admin/companies',
  ensureAuth,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');
      const filter = isSuper ? {} : { _id: req.user.company };

      const companies = await Company.find(filter)
        .select('name slug isActive createdAt')
        .lean();

      res.render('admin/admin-companies', {
        companies,
        form: { name: '', slug: '' }, // default empty form values
        error: null,
        active: 'admin'
      });
    } catch (err) { next(err); }
  }
);

router.post('/admin/companies',
  ensureAuth,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { name = '', slug = '' } = req.body;

      // basic validation
      const trimmedName = String(name).trim();
      const trimmedSlug = String(slug).trim();

      if (!trimmedName) {
        const companies = await Company.find({}).select('name slug isActive createdAt').lean();
        return res.status(400).render('admin/admin-companies', {
          companies,
          form: { name, slug },
          error: 'Company name is required.',
          active: 'admin'
        });
      }

      // Let schema auto-generate slug if you don't provide one
      await Company.create({
        name: trimmedName,
        slug: trimmedSlug || undefined, // undefined ? pre('validate') builds it
        isActive: true
      });

      return res.redirect('/admin/companies');
    } catch (err) {
      // handle duplicate name/slug nicely
      if (err?.code === 11000) {
        const companies = await Company.find({}).select('name slug isActive createdAt').lean();
        return res.status(400).render('admin/admin-companies', {
          companies,
          form: { name: req.body.name, slug: req.body.slug },
          error: 'Name or slug already exists. Please choose another.',
          active: 'admin'
        });
      }
      next(err);
    }
  }
);

module.exports = router;
