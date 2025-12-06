// /assets/js/address-details/floorPlanTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WATCH_STATUSES = new Set(['spec', 'sold', 'closed']);
const SELECT_WARNING_CLASS = 'floor-plan-select--warning';
const WARNING_ATTR = 'data-floor-plan-warning';

const TASK_REASON = 'missing-floor-plan-for-spec';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Select floor plan for SPEC / Sold home';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION =
  'General status is SPEC/Sold/Closed but no floor plan has been selected.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'Medium';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { generalStatus: '', floorPlan: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const resolveFloorPlanValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(value?._id || value?.id || '').trim();
  }
  return '';
};

const requiresWarning = () => {
  const status = normalizeStatus(state.generalStatus);
  if (!WATCH_STATUSES.has(status)) return false;
  return !resolveFloorPlanValue(state.floorPlan);
};

const notifyTaskPanel = (task) => {
  if (!task) return;
  emit('tasks:external-upsert', task);
};

const matchesTask = (task) => {
  if (!task) return false;
  const reason = normalizeStatus(task.reason);
  if (reason && LEGACY_REASONS.includes(reason)) return true;
  const title = normalizeStatus(task.title);
  return title && LEGACY_TITLES.includes(title);
};

const fetchLotTasks = async () => {
  if (!lotContext.lotId) return [];
  if (!lookupPromise) {
    lookupPromise = (async () => {
      try {
        const res = await fetchTasks({
          linkedModel: 'Lot',
          linkedId: lotContext.lotId
        });
        return Array.isArray(res?.tasks) ? res.tasks : [];
      } catch (err) {
        console.error('[floor-plan-task] failed to fetch tasks', err);
        return [];
      }
    })();
  }
  return lookupPromise;
};

const getAutoTask = async () => {
  if (autoTask) return autoTask;
  const tasks = await fetchLotTasks();
  autoTask = tasks.find((task) => matchesTask(task)) || null;
  return autoTask;
};

const ensureAutoTask = async () => {
  if (!lotContext.lotId) return null;
  if (completingPromise) {
    try {
      await completingPromise;
    } catch (err) {
      console.warn('[floor-plan-task] prior completion failed', err);
    }
  }

  const existing = await getAutoTask();
  if (existing) {
    const status = normalizeStatus(existing.status);
    if (status === COMPLETED_STATUS) {
      try {
        const response = await updateTask(existing._id, { status: STATUS_PENDING });
        autoTask = response.task;
        lookupPromise = null;
        notifyTaskPanel(autoTask);
      } catch (err) {
        console.error('[floor-plan-task] failed to reopen task', err);
      }
    }
    return autoTask;
  }

  if (ensuringPromise) return ensuringPromise;
  ensuringPromise = (async () => {
    try {
      const response = await createTask({
        title: TASK_TITLE,
        description: TASK_DESCRIPTION,
        linkedModel: 'Lot',
        linkedId: lotContext.lotId,
        type: TASK_TYPE,
        category: TASK_CATEGORY,
        priority: TASK_PRIORITY,
        status: STATUS_PENDING,
        autoCreated: true,
        reason: TASK_REASON
      });
      autoTask = response.task;
      lookupPromise = null;
      notifyTaskPanel(autoTask);
      return autoTask;
    } catch (err) {
      console.error('[floor-plan-task] failed to create task', err);
      return null;
    }
  })();

  try {
    return await ensuringPromise;
  } finally {
    ensuringPromise = null;
  }
};

const completeAutoTaskIfNeeded = async () => {
  if (ensuringPromise) {
    try {
      await ensuringPromise;
    } catch (err) {
      console.warn('[floor-plan-task] prior ensure failed', err);
    }
  }
  const task = await getAutoTask();
  if (!task) return null;
  const status = normalizeStatus(task.status);
  if (status === COMPLETED_STATUS) return task;
  if (completingPromise) return completingPromise;
  completingPromise = (async () => {
    try {
      const response = await updateTask(task._id, { status: STATUS_COMPLETED });
      autoTask = response.task;
      lookupPromise = null;
      notifyTaskPanel(autoTask);
      return autoTask;
    } catch (err) {
      console.error('[floor-plan-task] failed to complete task', err);
      return task;
    }
  })();

  try {
    return await completingPromise;
  } finally {
    completingPromise = null;
  }
};

const toggleSelectWarning = (enabled) => {
  const select = els.floorPlanSelect || document.getElementById('floorPlanSelect');
  if (!select) return;
  select.classList.toggle(SELECT_WARNING_CLASS, Boolean(enabled));
  if (enabled) {
    select.setAttribute('aria-invalid', 'true');
    select.setAttribute(WARNING_ATTR, 'true');
  } else {
    select.removeAttribute('aria-invalid');
    select.removeAttribute(WARNING_ATTR);
  }
};

const evaluate = () => {
  const warn = requiresWarning();
  toggleSelectWarning(warn);
  if (warn) ensureAutoTask();
  else completeAutoTaskIfNeeded();
};

const bindGeneralSelect = () => {
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  const sync = () => {
    state.generalStatus = select.value || '';
    evaluate();
  };
  select.addEventListener('change', sync);
};

const bindFloorPlanSelect = () => {
  const select = els.floorPlanSelect || document.getElementById('floorPlanSelect');
  if (!select) return;
  const sync = () => {
    state.floorPlan = select.value || '';
    evaluate();
  };
  select.addEventListener('change', sync);
  select.addEventListener('input', sync, { passive: true });
};

export const initFloorPlanAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || '',
    floorPlan: resolveFloorPlanValue(lot?.floorPlan)
  };

  bindGeneralSelect();
  bindFloorPlanSelect();
  evaluate();
};
