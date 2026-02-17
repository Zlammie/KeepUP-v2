const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const AutoFollowUpSchedule = require('../../models/AutoFollowUpSchedule');
const AutoFollowUpAssignment = require('../../models/AutoFollowUpAssignment');
const User = require('../../models/User');

const router = express.Router();

const { Types } = mongoose;

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const CHANNEL_SET = new Set(AutoFollowUpSchedule.STEP_CHANNELS || []);
const AUTO_RULE_SET = new Set(Object.values(AutoFollowUpSchedule.AUTO_COMPLETE_RULES || {}));
const SCHEDULE_STATUS_VALUES = Object.values(AutoFollowUpSchedule.STATUS || {});
const DEFAULT_SCHEDULE_STATUS =
  AutoFollowUpSchedule.STATUS?.DRAFT || SCHEDULE_STATUS_VALUES[0] || 'DRAFT';
const ASSIGNMENT_STATUS_VALUES = Object.values(AutoFollowUpAssignment.STATUS || {});
const DEFAULT_CHANNEL = CHANNEL_SET.has('SMS') ? 'SMS' : Array.from(CHANNEL_SET)[0];

function ensureObjectId(value) {
  if (!value) return null;
  const str = String(value);
  return Types.ObjectId.isValid(str) ? new Types.ObjectId(str) : null;
}

function toIso(date) {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeChannel(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!CHANNEL_SET.size) return normalized || 'SMS';
  if (CHANNEL_SET.has(normalized)) return normalized;
  if (DEFAULT_CHANNEL && CHANNEL_SET.has(DEFAULT_CHANNEL)) return DEFAULT_CHANNEL;
  return CHANNEL_SET.values().next().value || normalized || 'SMS';
}

function normalizeAutoRule(value, waitForReply = false) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (AUTO_RULE_SET.has(normalized)) return normalized;
  if (waitForReply && AUTO_RULE_SET.has('ON_REPLY')) return 'ON_REPLY';
  if (AUTO_RULE_SET.has('MANUAL')) return 'MANUAL';
  return normalized || 'MANUAL';
}

function normalizeSteps(rawSteps) {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps.map((step, index) => {
    const title = typeof step.title === 'string' ? step.title.trim() : '';
    const instructions = typeof step.instructions === 'string' ? step.instructions.trim() : '';
    const ownerRole = typeof step.ownerRole === 'string' ? step.ownerRole.trim() : '';
    const dayOffset = Number(step.dayOffset ?? step.day ?? 0);
    const waitForReply = typeof step.waitForReply === 'boolean' ? step.waitForReply : Boolean(step.rule === 'reply');
    const autoRule = normalizeAutoRule(step.autoCompleteRule || (step.rule ? step.rule : ''), waitForReply);

    if (Number.isNaN(dayOffset) || dayOffset < 0) {
      throw new Error('Each step must include a valid non-negative day offset.');
    }

    const channel = normalizeChannel(step.channel);
    if (CHANNEL_SET.size && !CHANNEL_SET.has(channel)) {
      throw new Error(`Invalid channel "${step.channel}" supplied for step ${index + 1}.`);
    }

    const templateRef = ensureObjectId(step.templateId || step.templateRef);

    return {
      stepId:
        typeof step.stepId === 'string' && step.stepId.trim()
          ? step.stepId.trim()
          : new Types.ObjectId().toString(),
      order: Number.isFinite(step.order) ? step.order : index,
      dayOffset,
      channel,
      title: title || `Step ${index + 1}`,
      instructions: instructions || undefined,
      ownerRole: ownerRole || undefined,
      waitForReply,
      autoCompleteRule: autoRule,
      templateRef: templateRef || undefined,
      metadata: step.metadata || undefined
    };
  });
}

function deriveDurationDays(steps) {
  if (!Array.isArray(steps) || !steps.length) return 0;
  return steps.reduce((max, step) => {
    const offset = Number(step?.dayOffset ?? 0);
    if (Number.isNaN(offset)) return max;
    return Math.max(max, offset);
  }, 0);
}

function serializeSchedule(schedule) {
  if (!schedule) return null;
  const source =
    typeof schedule.toObject === 'function'
      ? schedule.toObject({ virtuals: true })
      : schedule;

  const steps = Array.isArray(source.steps) ? source.steps : [];
  const totalSteps = steps.length;

  return {
    _id: String(source._id),
    company: String(source.company),
    name: source.name,
    summary: source.summary || '',
    description: source.description || '',
    stage: source.stage || null,
    defaultOwnerRole: source.defaultOwnerRole || null,
    fallbackOwnerRole: source.fallbackOwnerRole || null,
    tags: Array.isArray(source.tags) ? source.tags : [],
    status: source.status,
    version: source.version || 1,
    lastPublishedAt: toIso(source.lastPublishedAt),
    createdAt: toIso(source.createdAt),
    updatedAt: toIso(source.updatedAt),
    createdBy: source.createdBy ? String(source.createdBy) : null,
    updatedBy: source.updatedBy ? String(source.updatedBy) : null,
    publishedBy: source.publishedBy ? String(source.publishedBy) : null,
    metrics: {
      totalSteps,
      durationDays: deriveDurationDays(steps)
    },
    stopOnStatuses: Array.isArray(source.stopOnStatuses) ? source.stopOnStatuses : [],
    steps: steps.map((step) => ({
      stepId: step.stepId || (step._id ? String(step._id) : ''),
      order: typeof step.order === 'number' ? step.order : 0,
      dayOffset: step.dayOffset ?? 0,
      channel: step.channel,
      title: step.title,
      instructions: step.instructions || '',
      ownerRole: step.ownerRole || '',
      waitForReply: Boolean(step.waitForReply),
      autoCompleteRule: step.autoCompleteRule || normalizeAutoRule(null, step.waitForReply),
      templateId: step.templateRef ? String(step.templateRef) : null,
      metadata: step.metadata || null
    }))
  };
}

function serializeAssignment(assignment) {
  if (!assignment) return null;
  const source =
    typeof assignment.toObject === 'function'
      ? assignment.toObject({ virtuals: true })
      : assignment;

  const schedule = source.schedule || {};
  const user = source.user || {};

  const toStringId = (value) => (value == null ? null : String(value));

  return {
    _id: toStringId(source._id),
    company: toStringId(source.company),
    scheduleId: toStringId(schedule._id || source.schedule),
    scheduleName: schedule.name || null,
    userId: toStringId(user._id || source.user),
    userName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || null,
    userEmail: user.email || null,
    userStatus: user.status || null,
    status: source.status,
    appliedAt: toIso(source.appliedAt),
    startedAt: toIso(source.startedAt),
    completedAt: toIso(source.completedAt),
    pausedAt: toIso(source.pausedAt),
    cancelledAt: toIso(source.cancelledAt),
    cursor: source.cursor || {},
    metrics: source.metrics || { totalSteps: 0, completedSteps: 0, skippedSteps: 0 },
    settings: source.settings || {}
  };
}

function buildBaseFilter(req) {
  const companyId = ensureObjectId(req.user?.company);
  if (!companyId) {
    const err = new Error('Missing company context');
    err.statusCode = 400;
    throw err;
  }
  return { companyId };
}

router.get(
  '/',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const { status } = req.query || {};

      const filter = { company: companyId };
      if (typeof status === 'string' && status.trim()) {
        filter.status = status.trim().toUpperCase();
      }

      const schedules = await AutoFollowUpSchedule.find(filter)
        .sort({ updatedAt: -1 })
        .lean({ virtuals: true });

      return res.json({
        schedules: schedules.map(serializeSchedule),
        meta: {
          total: schedules.length
        }
      });
    } catch (err) {
      console.error('[task-schedules.api] Failed to list schedules', err);
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message || 'Failed to load schedules' });
    }
  }
);

router.get(
  '/:scheduleId',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const scheduleId = ensureObjectId(req.params.scheduleId);
      if (!scheduleId) {
        return res.status(400).json({ error: 'Invalid schedule id' });
      }

      const schedule = await AutoFollowUpSchedule.findOne({
        _id: scheduleId,
        company: companyId
      }).lean({ virtuals: true });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      return res.json({ schedule: serializeSchedule(schedule) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to fetch schedule', err);
      return res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  }
);

router.post(
  '/',
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);

      const payload = req.body || {};
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const steps = normalizeSteps(payload.steps || []);

      const desiredStatus = typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';
      const scheduleStatus = SCHEDULE_STATUS_VALUES.includes(desiredStatus)
        ? desiredStatus
        : DEFAULT_SCHEDULE_STATUS;

      const schedule = await AutoFollowUpSchedule.create({
        company: companyId,
        name,
        summary: typeof payload.summary === 'string' ? payload.summary.trim() : undefined,
        description: typeof payload.description === 'string' ? payload.description.trim() : undefined,
        stage: typeof payload.stage === 'string' ? payload.stage.trim() : undefined,
        defaultOwnerRole:
          typeof payload.defaultOwnerRole === 'string' ? payload.defaultOwnerRole.trim() : undefined,
        fallbackOwnerRole:
          typeof payload.fallbackOwnerRole === 'string' ? payload.fallbackOwnerRole.trim() : undefined,
        tags: Array.isArray(payload.tags)
          ? payload.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
          : [],
        status: scheduleStatus,
        version: 1,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        steps,
        stopOnStatuses: Array.isArray(payload.stopOnStatuses)
          ? payload.stopOnStatuses.map((status) => String(status).trim()).filter(Boolean)
          : [],
        metadata: payload.metadata || undefined
      });

      return res.status(201).json({ schedule: serializeSchedule(schedule) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to create schedule', err);
      if (err.code === 11000) {
        return res.status(409).json({ error: 'A schedule with that name already exists' });
      }
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message || 'Failed to create schedule' });
    }
  }
);

router.put(
  '/:scheduleId',
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const scheduleId = ensureObjectId(req.params.scheduleId);
      if (!scheduleId) {
        return res.status(400).json({ error: 'Invalid schedule id' });
      }

      const schedule = await AutoFollowUpSchedule.findOne({
        _id: scheduleId,
        company: companyId
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const payload = req.body || {};
      let hasChanges = false;

      if (typeof payload.name === 'string' && payload.name.trim() && schedule.name !== payload.name.trim()) {
        schedule.name = payload.name.trim();
        hasChanges = true;
      }

      const updatableFields = [
        ['summary', 'string'],
        ['description', 'string'],
        ['stage', 'string'],
        ['defaultOwnerRole', 'string'],
        ['fallbackOwnerRole', 'string']
      ];

      updatableFields.forEach(([field, type]) => {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          const value = typeof payload[field] === type ? payload[field].trim?.() ?? payload[field] : undefined;
          schedule.set(field, value);
          hasChanges = true;
        }
      });

      if (Array.isArray(payload.tags)) {
        schedule.tags = payload.tags
          .filter((tag) => typeof tag === 'string' && tag.trim())
          .map((tag) => tag.trim());
        hasChanges = true;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'steps')) {
        schedule.steps = normalizeSteps(payload.steps);
        hasChanges = true;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'stopOnStatuses')) {
        schedule.stopOnStatuses = Array.isArray(payload.stopOnStatuses)
          ? payload.stopOnStatuses.map((status) => String(status).trim()).filter(Boolean)
          : [];
        hasChanges = true;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        const nextStatus = String(payload.status || '').trim().toUpperCase();
        if (SCHEDULE_STATUS_VALUES.includes(nextStatus)) {
          schedule.status = nextStatus;
          if (nextStatus === AutoFollowUpSchedule.STATUS.ACTIVE) {
            schedule.lastPublishedAt = new Date();
          }
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        return res.json({ schedule: serializeSchedule(schedule) });
      }

      schedule.version = (schedule.version || 1) + 1;
      schedule.updatedBy = req.user._id;
      await schedule.save();

      return res.json({ schedule: serializeSchedule(schedule) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to update schedule', err);
      if (err.code === 11000) {
        return res.status(409).json({ error: 'A schedule with that name already exists' });
      }
      return res.status(500).json({ error: err.message || 'Failed to update schedule' });
    }
  }
);

router.post(
  '/:scheduleId/status',
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const scheduleId = ensureObjectId(req.params.scheduleId);
      if (!scheduleId) {
        return res.status(400).json({ error: 'Invalid schedule id' });
      }

      const { status } = req.body || {};
      const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
      if (!SCHEDULE_STATUS_VALUES.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const schedule = await AutoFollowUpSchedule.findOneAndUpdate(
        { _id: scheduleId, company: companyId },
        {
          $set: {
            status: normalizedStatus,
            updatedBy: req.user._id,
            lastPublishedAt:
              normalizedStatus === AutoFollowUpSchedule.STATUS.ACTIVE ? new Date() : undefined
          },
          $inc: { version: 1 }
        },
        { new: true }
      ).lean({ virtuals: true });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      return res.json({ schedule: serializeSchedule(schedule) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to update status', err);
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

router.get(
  '/assignments',
  requireRole(...READ_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const assignments = await AutoFollowUpAssignment.find({ company: companyId })
        .populate('user', 'firstName lastName email status roles lastLoginAt company')
        .populate('schedule', 'name status stage defaultOwnerRole')
        .sort({ updatedAt: -1 })
        .lean({ virtuals: true });

      return res.json({
        assignments: assignments.map(serializeAssignment),
        meta: { total: assignments.length }
      });
    } catch (err) {
      console.error('[task-schedules.api] Failed to fetch assignments', err);
      return res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  }
);

router.post(
  '/:scheduleId/assign',
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const scheduleId = ensureObjectId(req.params.scheduleId);
      if (!scheduleId) {
        return res.status(400).json({ error: 'Invalid schedule id' });
      }

      const payload = req.body || {};
      const userId = ensureObjectId(payload.userId);
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const schedule = await AutoFollowUpSchedule.findOne({
        _id: scheduleId,
        company: companyId
      }).lean();
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const user = await User.findOne({ _id: userId, company: companyId })
        .select('firstName lastName email status roles')
        .lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found for this company' });
      }

      const existingAssignment = await AutoFollowUpAssignment.findOne({
        company: companyId,
        schedule: scheduleId,
        user: userId
      });

      const settings = {
        stage: typeof payload.stage === 'string' ? payload.stage.trim() : schedule.stage || null,
        autoStart: payload.autoStart !== false,
        startOffsetDays: Number(payload.startOffsetDays || 0) || 0,
        notes: typeof payload.notes === 'string' ? payload.notes.trim() : undefined
      };

      const cursor = schedule.steps.length
        ? {
            stepIndex: 0,
            stepId: schedule.steps[0].stepId || null,
            dueAt: payload.autoStart === false ? null : null,
            taskId: null,
            lastCompletedAt: null
          }
        : {};

      let assignment;
      if (existingAssignment) {
        existingAssignment.status = AutoFollowUpAssignment.STATUS.ACTIVE;
        existingAssignment.appliedBy = req.user._id;
        existingAssignment.appliedAt = new Date();
        existingAssignment.startedAt = payload.autoStart === false ? null : new Date();
        existingAssignment.settings = settings;
        existingAssignment.cursor = cursor;
        existingAssignment.metrics.totalSteps = schedule.steps.length;
        await existingAssignment.save();
        assignment = await existingAssignment
          .populate('user', 'firstName lastName email status roles')
          .populate('schedule', 'name status stage defaultOwnerRole');
      } else {
        assignment = await AutoFollowUpAssignment.create({
          company: companyId,
          schedule: scheduleId,
          user: userId,
          status: AutoFollowUpAssignment.STATUS.ACTIVE,
          appliedBy: req.user._id,
          appliedAt: new Date(),
          startedAt: payload.autoStart === false ? null : new Date(),
          settings,
          cursor,
          metrics: {
            totalSteps: schedule.steps.length,
            completedSteps: 0,
            skippedSteps: 0
          },
          auditLog: [
            {
              at: new Date(),
              action: 'ASSIGNED',
              actor: req.user._id,
              payload: { via: 'task-settings' }
            }
          ]
        });

        assignment = await assignment
          .populate('user', 'firstName lastName email status roles')
          .populate('schedule', 'name status stage defaultOwnerRole');
      }

      return res.status(201).json({ assignment: serializeAssignment(assignment) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to assign schedule', err);
      return res.status(500).json({ error: err.message || 'Failed to assign schedule' });
    }
  }
);

router.post(
  '/assignments/:assignmentId/status',
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    try {
      const { companyId } = buildBaseFilter(req);
      const assignmentId = ensureObjectId(req.params.assignmentId);
      if (!assignmentId) {
        return res.status(400).json({ error: 'Invalid assignment id' });
      }

      const { status } = req.body || {};
      const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
      if (!ASSIGNMENT_STATUS_VALUES.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid assignment status' });
      }

      const updates = {
        status: normalizedStatus,
        updatedAt: new Date()
      };

      if (normalizedStatus === AutoFollowUpAssignment.STATUS.PAUSED) {
        updates.pausedAt = new Date();
      } else if (normalizedStatus === AutoFollowUpAssignment.STATUS.COMPLETED) {
        updates.completedAt = new Date();
      } else if (normalizedStatus === AutoFollowUpAssignment.STATUS.CANCELLED) {
        updates.cancelledAt = new Date();
      }

      const assignment = await AutoFollowUpAssignment.findOneAndUpdate(
        { _id: assignmentId, company: companyId },
        { $set: updates, $push: { auditLog: { at: new Date(), action: normalizedStatus, actor: req.user._id } } },
        { new: true }
      )
        .populate('user', 'firstName lastName email status roles')
        .populate('schedule', 'name status stage defaultOwnerRole');

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      return res.json({ assignment: serializeAssignment(assignment) });
    } catch (err) {
      console.error('[task-schedules.api] Failed to update assignment status', err);
      return res.status(500).json({ error: 'Failed to update assignment status' });
    }
  }
);

module.exports = router;
