const express = require('express');
const mongoose = require('mongoose');

const Task = require('../../models/Task');
const Contact = require('../../models/Contact');
const Community = require('../../models/Community');
const Competition = require('../../models/Competition');
const requireRole = require('../../middleware/requireRole');
const { hydrateTaskLinks, groupTasksByAttachment } = require('../../utils/taskLinkedDetails');

const router = express.Router();

const { Types } = mongoose;

const TASK_STATUS = new Set(Task.STATUS || []);
const TASK_TYPES = new Set(Task.TYPES || []);
const TASK_PRIORITIES = new Set(Task.PRIORITIES || []);
const TASK_CATEGORIES = new Set(Task.CATEGORIES || []);
const TASK_LINKED_MODELS = new Set(Task.LINKED_MODELS || []);

const DEFAULT_TYPE = TASK_TYPES.has('Follow-Up')
  ? 'Follow-Up'
  : (Array.isArray(Task.TYPES) && Task.TYPES[0]) || 'Custom';

const DEFAULT_PRIORITY = TASK_PRIORITIES.has('Medium')
  ? 'Medium'
  : (Array.isArray(Task.PRIORITIES) && Task.PRIORITIES[0]) || 'Medium';

const DEFAULT_STATUS = TASK_STATUS.has('Pending')
  ? 'Pending'
  : (Array.isArray(Task.STATUS) && Task.STATUS[0]) || 'Pending';

const COMM_TYPES = new Set(['Follow-Up', 'Call', 'Email', 'Meeting', 'Reminder', 'Note']);
const OPERATIONS_TYPES = new Set(['Document', 'Approval', 'Review']);
const SYSTEM_TYPES = new Set(['Data Fix', 'System Suggestion']);
const ADMIN_TYPES = new Set(['Admin']);

function inferCategoryFromType(type) {
  if (!type) return 'Custom';
  if (COMM_TYPES.has(type)) return 'Communication';
  if (ADMIN_TYPES.has(type)) return 'Admin';
  if (SYSTEM_TYPES.has(type)) return 'System';
  if (OPERATIONS_TYPES.has(type)) return 'Operations';
  return 'Custom';
}

function canViewAllTasks(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN') || roles.includes('MANAGER');
}

function sanitizeCategory(category, fallbackType) {
  const trimmed = typeof category === 'string' ? category.trim() : '';
  if (TASK_CATEGORIES.has(trimmed)) return trimmed;
  return inferCategoryFromType(fallbackType);
}

function getCategoryList() {
  const list = Array.from(TASK_CATEGORIES);
  if (!list.length) {
    list.push('Custom');
  } else if (!list.includes('Custom')) {
    list.push('Custom');
  }
  return list;
}

function ensureObjectId(value) {
  if (!value) return null;
  const str = String(value);
  return Types.ObjectId.isValid(str) ? new Types.ObjectId(str) : null;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeTask(task) {
  if (!task) return null;
  const source = typeof task.toObject === 'function' ? task.toObject() : task;

  const toString = (val) => (val == null ? null : String(val));

  return {
    _id: toString(source._id),
    company: toString(source.company),
    assignedTo: toString(source.assignedTo),
    createdBy: toString(source.createdBy),
    linkedModel: source.linkedModel ?? null,
    linkedId: toString(source.linkedId),
    linkedName: source.linkedName || null,
    linkedStatus: source.linkedStatus || null,
    linkedCommunityId: toString(source.linkedCommunityId),
    linkedCommunityName: source.linkedCommunityName || null,
    title: source.title || '',
    description: source.description || '',
    type: source.type || 'Follow-Up',
    category: source.category || 'Custom',
    priority: source.priority || 'Medium',
    status: source.status || 'Pending',
    dueDate: toIso(source.dueDate),
    completedAt: toIso(source.completedAt),
    autoCreated: Boolean(source.autoCreated),
    reason: source.reason || null,
    createdAt: toIso(source.createdAt),
    updatedAt: toIso(source.updatedAt)
  };
}

router.get(
  '/',
  requireRole('READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const companyId = ensureObjectId(req.user?.company);
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company context' });
      }

      const { linkedModel = 'Contact', linkedId, status, type, limit } = req.query || {};

      if (!linkedId) {
        return res.status(400).json({ error: 'linkedId is required' });
      }

      const normalizedModel =
        typeof linkedModel === 'string' && linkedModel.trim().length
          ? linkedModel.trim()
          : 'Contact';

      if (normalizedModel && TASK_LINKED_MODELS.size && !TASK_LINKED_MODELS.has(normalizedModel)) {
        return res.status(400).json({ error: 'Unsupported linked model' });
      }

      const linkedObjectId = ensureObjectId(linkedId);
      if (!linkedObjectId) {
        return res.status(400).json({ error: 'Invalid linkedId' });
      }

      if (normalizedModel === 'Contact') {
        // Contact validation handled implicitly by company scoping below
      } else if (normalizedModel === 'Lot') {
        const lotOwner = await Community.findOne({
          company: companyId,
          'lots._id': linkedObjectId
        })
          .select('_id')
          .lean();

        if (!lotOwner) {
          return res.status(404).json({ error: 'Lot not found' });
        }
      } else if (normalizedModel === 'Community') {
        const community = await Community.findOne({
          _id: linkedObjectId,
          company: companyId
        })
          .select('_id')
          .lean();

        if (!community) {
          return res.status(404).json({ error: 'Community not found' });
        }
      } else if (normalizedModel === 'Competition') {
        const competition = await Competition.findOne({
          _id: linkedObjectId,
          company: companyId
        })
          .select('_id')
          .lean();

        if (!competition) {
          return res.status(404).json({ error: 'Competition not found' });
        }
      } else if (normalizedModel) {
        return res
          .status(400)
          .json({ error: 'Only contact-, community-, competition-, or lot-linked tasks are supported right now.' });
      }

      const filters = {
        company: companyId,
        linkedModel: normalizedModel,
        linkedId: linkedObjectId
      };

      if (status) {
        const statuses = String(status)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const validStatuses = statuses.filter((s) => TASK_STATUS.has(s));
        if (!validStatuses.length) {
          return res.status(400).json({ error: 'Invalid status filter' });
        }
        filters.status = validStatuses.length === 1 ? validStatuses[0] : { $in: validStatuses };
      }

      if (type) {
        const types = String(type)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const validTypes = types.filter((t) => TASK_TYPES.has(t));
        if (!validTypes.length) {
          return res.status(400).json({ error: 'Invalid type filter' });
        }
        filters.type = validTypes.length === 1 ? validTypes[0] : { $in: validTypes };
      }

      let limitInt = parseInt(limit, 10);
      if (Number.isNaN(limitInt) || limitInt <= 0) limitInt = 100;
      limitInt = Math.min(limitInt, 250);

      const tasks = await Task.find(filters)
        .sort({ createdAt: -1 })
        .limit(limitInt)
        .lean();

      await hydrateTaskLinks(tasks, { companyIds: [companyId] });

      return res.json({
        tasks: tasks.map(serializeTask)
      });
    } catch (err) {
      console.error('[tasks.api] Failed to list tasks:', err);
      return res.status(500).json({ error: 'Failed to load tasks' });
    }
  }
);

router.get(
  '/overview',
  requireRole('READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const companyId = ensureObjectId(req.user?.company);
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company context' });
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const statusFilter = Array.from(TASK_STATUS).filter((status) => status !== 'Completed');
      if (!statusFilter.length) statusFilter.push('Pending', 'In Progress', 'Overdue');

      const assignedId = ensureObjectId(req.user?._id);
      const filter = {
        company: companyId,
        status: { $in: statusFilter }
      };

      if (!canViewAllTasks(req.user)) {
        if (assignedId) {
          filter.assignedTo = assignedId;
        } else {
          return res.json({
            categories: [],
            meta: {
              totals: { due: 0, overdue: 0 },
              categories: getCategoryList(),
              statuses: Array.from(TASK_STATUS),
              priorities: Array.from(TASK_PRIORITIES),
              types: Array.from(TASK_TYPES)
            }
          });
        }
      }

      const tasks = await Task.find(filter)
        .sort({ dueDate: 1, priority: -1, createdAt: -1 })
        .limit(500)
        .lean();

      await hydrateTaskLinks(tasks, { companyIds: [companyId] });

      const categoriesList = getCategoryList();

      const fallbackCategory = categoriesList.includes('Custom') ? 'Custom' : categoriesList[0];

      const grouped = new Map();
      categoriesList.forEach((category) => grouped.set(category, []));

      tasks.forEach((task) => {
        const category = TASK_CATEGORIES.has(task.category) ? task.category : fallbackCategory;
        const bucket = grouped.get(category);
        bucket.push(serializeTask(task));
      });

      const responseCategories = categoriesList
        .map((category) => {
          const items = grouped.get(category) || [];
          if (!items.length) return null;
          const overdueCount = items.filter((task) => {
            if (!task.dueDate) return false;
            if ((task.status || '').toLowerCase() === 'completed') return false;
            const due = new Date(task.dueDate);
            if (Number.isNaN(due.getTime())) return false;
            return due < startOfToday;
          }).length;
          return {
            name: category,
            total: items.length,
            overdue: overdueCount,
            tasks: items,
            linkedGroups: category === 'System' ? groupTasksByAttachment(items) : []
          };
        })
        .filter(Boolean);

      const overdueTotal = responseCategories.reduce((acc, category) => acc + category.overdue, 0);

      return res.json({
        categories: responseCategories,
        meta: {
          totals: {
            due: tasks.length,
            overdue: overdueTotal
          },
          categories: categoriesList,
          statuses: Array.from(TASK_STATUS),
          priorities: Array.from(TASK_PRIORITIES),
          types: Array.from(TASK_TYPES)
        }
      });
    } catch (err) {
      console.error('[tasks.api] Failed to load overview:', err);
      return res.status(500).json({ error: 'Failed to load task overview' });
    }
  }
);

router.post(
  '/',
  requireRole('USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const companyId = ensureObjectId(req.user?.company);
      const actorId = ensureObjectId(req.user?._id);
      if (!companyId || !actorId) {
        return res.status(400).json({ error: 'Missing company context' });
      }

      const {
        title,
        description,
        dueDate,
        linkedId,
        linkedModel = null,
        type = DEFAULT_TYPE,
        priority,
        reason,
        category,
        status,
        assignedTo
      } = req.body || {};

      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const normalizedModel =
        typeof linkedModel === 'string' && linkedModel.trim().length
          ? linkedModel.trim()
          : null;

      if (normalizedModel && TASK_LINKED_MODELS.size && !TASK_LINKED_MODELS.has(normalizedModel)) {
        return res.status(400).json({ error: 'Unsupported linked model' });
      }

      let linkedObjectId = null;

      if (normalizedModel === 'Contact') {
        const contactId = ensureObjectId(linkedId);
        if (!contactId) {
          return res.status(400).json({ error: 'A valid contact id is required.' });
        }

        const contact = await Contact.findOne({
          _id: contactId,
          company: companyId
        })
          .select('_id')
          .lean();

        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }

        linkedObjectId = contact._id;
      } else if (normalizedModel === 'Lot') {
        const lotObjectId = ensureObjectId(linkedId);
        if (!lotObjectId) {
          return res.status(400).json({ error: 'A valid lot id is required.' });
        }

        const lotOwner = await Community.findOne({
          company: companyId,
          'lots._id': lotObjectId
        })
          .select('_id')
          .lean();

        if (!lotOwner) {
          return res.status(404).json({ error: 'Lot not found' });
        }

        linkedObjectId = lotObjectId;
      } else if (normalizedModel === 'Community') {
        const communityObjectId = ensureObjectId(linkedId);
        if (!communityObjectId) {
          return res.status(400).json({ error: 'A valid community id is required.' });
        }

        const communityDoc = await Community.findOne({
          _id: communityObjectId,
          company: companyId
        })
          .select('_id')
          .lean();

        if (!communityDoc) {
          return res.status(404).json({ error: 'Community not found' });
        }

        linkedObjectId = communityDoc._id;
      } else if (normalizedModel === 'Competition') {
        const competitionObjectId = ensureObjectId(linkedId);
        if (!competitionObjectId) {
          return res.status(400).json({ error: 'A valid competition id is required.' });
        }

        const competitionDoc = await Competition.findOne({
          _id: competitionObjectId,
          company: companyId
        })
          .select('_id')
          .lean();

        if (!competitionDoc) {
          return res.status(404).json({ error: 'Competition not found' });
        }

        linkedObjectId = competitionDoc._id;
      } else if (normalizedModel) {
        return res
          .status(400)
          .json({ error: 'Only contact-, community-, competition-, or lot-linked tasks are supported right now.' });
      }

      let normalizedDueDate = null;
      if (dueDate) {
        const parsed = new Date(dueDate);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'Invalid due date' });
        }
        normalizedDueDate = parsed;
      }

      const sanitizedType = TASK_TYPES.has(type) ? type : DEFAULT_TYPE;
      const sanitizedPriority = TASK_PRIORITIES.has(priority) ? priority : DEFAULT_PRIORITY;
      const sanitizedCategory = sanitizeCategory(category, sanitizedType);
      const sanitizedStatus = (() => {
        const incoming = typeof status === 'string' ? status.trim() : '';
        return TASK_STATUS.has(incoming) ? incoming : DEFAULT_STATUS;
      })();

      const safeDescription = typeof description === 'string' ? description.trim() : '';
      const safeReason = typeof reason === 'string' ? reason.trim() : '';

      const assignedObjectId = ensureObjectId(assignedTo) || actorId;

      const autoCreatedFlag = Boolean(req.body?.autoCreated);

      if (autoCreatedFlag && safeReason) {
        const duplicateFilter = {
          company: companyId,
          reason: safeReason
        };

        if (normalizedModel !== null && normalizedModel !== undefined) {
          duplicateFilter.linkedModel = normalizedModel;
        } else {
          duplicateFilter.linkedModel = null;
        }

        if (linkedObjectId) {
          duplicateFilter.linkedId = linkedObjectId;
        } else {
          duplicateFilter.linkedId = { $exists: false };
        }

        const existingTask = await Task.findOne(duplicateFilter).lean();
        if (existingTask) {
          await hydrateTaskLinks([existingTask], { companyIds: [companyId] });
          return res.status(200).json({ task: serializeTask(existingTask) });
        }
      }

      const task = await Task.create({
        company: companyId,
        assignedTo: assignedObjectId,
        createdBy: actorId,
        linkedModel: normalizedModel,
        linkedId: linkedObjectId || undefined,
        title: trimmedTitle,
        description: safeDescription || undefined,
        type: sanitizedType,
        category: sanitizedCategory,
        priority: sanitizedPriority,
        status: sanitizedStatus,
        dueDate: normalizedDueDate || undefined,
        autoCreated: autoCreatedFlag,
        reason: safeReason || undefined
      });

      const plainTask = task.toObject();
      await hydrateTaskLinks([plainTask], { companyIds: [companyId] });
      return res.status(201).json({ task: serializeTask(plainTask) });
    } catch (err) {
      console.error('[tasks.api] Failed to create task:', err);
      return res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

router.patch(
  '/:taskId',
  requireRole('USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const companyId = ensureObjectId(req.user?.company);
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company context' });
      }

      const taskObjectId = ensureObjectId(req.params.taskId);
      if (!taskObjectId) {
        return res.status(400).json({ error: 'Invalid task id' });
      }

      const task = await Task.findOne({ _id: taskObjectId, company: companyId });
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const payload = req.body || {};
      const hasOwn = Object.prototype.hasOwnProperty;
      let hasChanges = false;

      if (hasOwn.call(payload, 'title')) {
        const nextTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!nextTitle) {
          return res.status(400).json({ error: 'Title is required' });
        }
        if (task.title !== nextTitle) {
          task.title = nextTitle;
          hasChanges = true;
        }
      }

      if (hasOwn.call(payload, 'description')) {
        const nextDescription = typeof payload.description === 'string' ? payload.description.trim() : '';
        if (nextDescription) {
          if (task.description !== nextDescription) {
            task.description = nextDescription;
            hasChanges = true;
          }
        } else if (task.description) {
          task.set('description', undefined);
          hasChanges = true;
        }
      }

      if (hasOwn.call(payload, 'reason')) {
        const nextReason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
        if (nextReason) {
          if (task.reason !== nextReason) {
            task.reason = nextReason;
            hasChanges = true;
          }
        } else if (task.reason) {
          task.set('reason', undefined);
          hasChanges = true;
        }
      }

      if (hasOwn.call(payload, 'dueDate')) {
        const dueValue = payload.dueDate;
        if (!dueValue) {
          if (task.dueDate) {
            task.set('dueDate', undefined);
            hasChanges = true;
          }
        } else {
          const parsed = new Date(dueValue);
          if (Number.isNaN(parsed.getTime())) {
            return res.status(400).json({ error: 'Invalid due date' });
          }
          if (!task.dueDate || task.dueDate.getTime() !== parsed.getTime()) {
            task.dueDate = parsed;
            hasChanges = true;
          }
        }
      }

      if (hasOwn.call(payload, 'type')) {
        const nextType = typeof payload.type === 'string' ? payload.type.trim() : '';
        if (!TASK_TYPES.has(nextType)) {
          return res.status(400).json({ error: 'Invalid task type' });
        }
        if (task.type !== nextType) {
          task.type = nextType;
          task.category = inferCategoryFromType(nextType);
          hasChanges = true;
        }
      }

      if (hasOwn.call(payload, 'priority')) {
        const nextPriority = typeof payload.priority === 'string' ? payload.priority.trim() : '';
        if (!TASK_PRIORITIES.has(nextPriority)) {
          return res.status(400).json({ error: 'Invalid priority' });
        }
        if (task.priority !== nextPriority) {
          task.priority = nextPriority;
          hasChanges = true;
        }
      }

      if (hasOwn.call(payload, 'status')) {
        const nextStatus = typeof payload.status === 'string' ? payload.status.trim() : '';
        if (!TASK_STATUS.has(nextStatus)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        if (task.status !== nextStatus) {
          task.status = nextStatus;
          hasChanges = true;
          if (nextStatus === 'Completed') {
            task.completedAt = new Date();
          } else if (task.completedAt) {
            task.set('completedAt', undefined);
          }
        } else if (nextStatus === 'Completed' && !task.completedAt) {
          task.completedAt = new Date();
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        const plainTask = task.toObject();
        await hydrateTaskLinks([plainTask], { companyIds: [companyId] });
        return res.json({ task: serializeTask(plainTask) });
      }

      await task.save();
      const plainTask = task.toObject();
      await hydrateTaskLinks([plainTask], { companyIds: [companyId] });
      return res.json({ task: serializeTask(plainTask) });
    } catch (err) {
      console.error('[tasks.api] Failed to update task:', err);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  }
);


module.exports = router;
