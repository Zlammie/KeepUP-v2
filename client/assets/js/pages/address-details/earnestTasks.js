// /assets/js/address-details/earnestTasks.js
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

const CONFIGS = {
  missing: {
    reason: 'earnest-missing',
    legacyReasons: ['earnest-missing'],
    title: 'Add earnest money entry',
    legacyTitles: ['Add earnest money'],
    description: 'Add at least one earnest money entry for this address.',
    priority: 'High'
  },
  due: {
    reason: 'earnest-due',
    legacyReasons: ['earnest-due'],
    title: 'Earnest money due',
    legacyTitles: ['Earnest due'],
    description: 'Collect the upcoming earnest money.',
    priorityDue: 'Low',
    priorityOverdue: 'High'
  }
};

const runtime = {
  lotId: null,
  entries: []
};

const taskRuntime = {};
let tasksFetchPromise = null;

const getTracker = (key) => {
  if (!taskRuntime[key]) taskRuntime[key] = { task: null, ensuring: null, completing: null };
  return taskRuntime[key];
};

const notifyPanel = (task) => task && emit('tasks:external-upsert', task);

const fetchLotTasks = async () => {
  if (!runtime.lotId) return [];
  if (!tasksFetchPromise) {
    tasksFetchPromise = (async () => {
      try {
        const res = await fetchTasks({ linkedModel: 'Lot', linkedId: runtime.lotId });
        return Array.isArray(res?.tasks) ? res.tasks : [];
      } catch (err) {
        console.error('[earnest-tasks] failed to load tasks', err);
        return [];
      }
    })();
  }
  return tasksFetchPromise;
};

const matchesConfig = (task, key) => {
  const cfg = CONFIGS[key];
  if (!cfg || !task) return false;
  const reason = String(task.reason || '').toLowerCase();
  const title = String(task.title || '').toLowerCase();
  const reasons = [cfg.reason, ...(cfg.legacyReasons || [])].map((r) => String(r || '').toLowerCase());
  const titles = [cfg.title, ...(cfg.legacyTitles || [])].map((t) => String(t || '').toLowerCase());
  return reasons.includes(reason) || titles.includes(title);
};

const assignExistingTasks = (tasks = []) => {
  tasks.forEach((task) => {
    const key = Object.keys(CONFIGS).find((k) => matchesConfig(task, k));
    if (!key) return;
    const tracker = getTracker(key);
    if (!tracker.task) tracker.task = task;
  });
};

const ensureTask = async (key, priorityOverride) => {
  const cfg = CONFIGS[key];
  if (!cfg || !runtime.lotId) return null;
  const tracker = getTracker(key);
  if (tracker.ensuring) return tracker.ensuring;

  tracker.ensuring = (async () => {
    if (!tracker.task) {
      const tasks = await fetchLotTasks();
      assignExistingTasks(tasks);
    }

    if (tracker.task) {
      const desiredPriority = priorityOverride || cfg.priority;
      const currentPriority = tracker.task.priority || '';
      if (desiredPriority && desiredPriority !== currentPriority) {
        try {
          const res = await updateTask(tracker.task._id, { priority: desiredPriority });
          tracker.task = res.task;
          notifyPanel(tracker.task);
          tasksFetchPromise = null;
        } catch (err) {
          console.error(`[earnest-tasks] failed to update priority for ${key}`, err);
        }
      }
      const status = String(tracker.task.status || '').toLowerCase();
      if (status === COMPLETED_STATUS) {
        try {
          const res = await updateTask(tracker.task._id, { status: STATUS_PENDING, priority: priorityOverride || cfg.priority });
          tracker.task = res.task;
          notifyPanel(tracker.task);
          tasksFetchPromise = null;
        } catch (err) {
          console.error(`[earnest-tasks] failed to reopen ${key}`, err);
        }
      }
      return tracker.task;
    }

    try {
      const res = await createTask({
        linkedModel: 'Lot',
        linkedId: runtime.lotId,
        title: cfg.title,
        description: cfg.description,
        type: TASK_TYPE,
        priority: priorityOverride || cfg.priority,
        category: TASK_CATEGORY,
        status: STATUS_PENDING,
        autoCreated: true,
        reason: cfg.reason
      });
      tracker.task = res.task;
      notifyPanel(tracker.task);
      tasksFetchPromise = null;
    } catch (err) {
      console.error(`[earnest-tasks] failed to create task ${key}`, err);
    }
    return tracker.task;
  })();

  try {
    return await tracker.ensuring;
  } finally {
    tracker.ensuring = null;
  }
};

const completeTask = async (key) => {
  const tracker = getTracker(key);
  if (!tracker.task) return;
  if (tracker.completing) return tracker.completing;

  const status = String(tracker.task.status || '').toLowerCase();
  if (status === COMPLETED_STATUS) return tracker.task;

  tracker.completing = (async () => {
    try {
      const res = await updateTask(tracker.task._id, { status: STATUS_COMPLETED });
      tracker.task = res.task;
      notifyPanel(tracker.task);
      tasksFetchPromise = null;
    } catch (err) {
      console.error(`[earnest-tasks] failed to complete task ${key}`, err);
    }
    return tracker.task;
  })();

  try {
    return await tracker.completing;
  } finally {
    tracker.completing = null;
  }
};

const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T00:00:00`);
    if (t.includes('T')) {
      const [datePart] = t.split('T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(`${datePart}T00:00:00`);
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getEarliestDue = (entries = []) => {
  let earliest = null;
  entries.forEach((entry) => {
    if (!entry) return;
    const amount = entry.amount;
    if (amount == null || Number.isNaN(Number(amount))) return;
    if (entry.collectedDate) return;
    const d = parseLocalDate(entry.dueDate);
    if (!d) return;
    if (!earliest || d < earliest) earliest = d;
  });
  return earliest;
};

const evaluate = () => {
  const entries = runtime.entries || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasAmount = entries.some((e) => e && e.amount != null && !Number.isNaN(Number(e.amount)));
  const missing = !hasAmount;

  if (missing) {
    ensureTask('missing', CONFIGS.missing.priority);
  } else {
    completeTask('missing');
  }

  const outstanding = entries.filter((e) => e && e.amount != null && !Number.isNaN(Number(e.amount)) && !e.collectedDate);
  if (!outstanding.length) {
    completeTask('due');
    return;
  }

  const dueDate = getEarliestDue(outstanding);
  if (!dueDate) {
    ensureTask('due', CONFIGS.due.priorityDue);
    return;
  }

  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const overdue = diffDays < 0;
  const desiredPriority = overdue ? CONFIGS.due.priorityOverdue : CONFIGS.due.priorityDue;

  ensureTask('due', desiredPriority);
};

export function initEarnestTasks({ lotId, entries = [] }) {
  runtime.lotId = lotId || null;
  runtime.entries = Array.isArray(entries) ? entries.slice() : [];
  Object.keys(taskRuntime).forEach((k) => { taskRuntime[k] = { task: null, ensuring: null, completing: null }; });
  tasksFetchPromise = null;
  evaluate();
}

export function updateEarnestTasks(entries = []) {
  runtime.entries = Array.isArray(entries) ? entries.slice() : [];
  evaluate();
}
