// /assets/js/address-details/releaseStatusTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const SAFE_STATUSES = new Set(['spec', 'sold', 'closed']);
const SELECT_WARNING_CLASS = 'general-status-select--release-warning';
const WARNING_ATTR = 'data-general-status-release-warning';

const TASK_REASON = 'past-release-status-mismatch';
const LEGACY_REASONS = ['future-release-status-mismatch', TASK_REASON];
const TASK_TITLE = 'Review general status after release';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase(), 'review general status before release'];
const TASK_DESCRIPTION =
  'Release date is in the past but this home is not marked as SPEC, Sold, or Closed.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { releaseDate: '', generalStatus: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const toDateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const isPastDate = (value) => {
  const normalized = toDateValue(value);
  if (!normalized) return false;
  const dt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dt.getTime() < today.getTime();
};

const requiresWarning = () => {
  if (!isPastDate(state.releaseDate)) return false;
  const status = normalizeStatus(state.generalStatus);
  return status && !SAFE_STATUSES.has(status);
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
        console.error('[release-status-task] failed to fetch tasks', err);
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
      console.warn('[release-status-task] prior completion failed', err);
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
        console.error('[release-status-task] failed to reopen task', err);
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
      console.error('[release-status-task] failed to create task', err);
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
      console.warn('[release-status-task] prior ensure failed', err);
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
      console.error('[release-status-task] failed to complete task', err);
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
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
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

const bindReleaseInput = () => {
  const input = els.releaseDateInput || document.getElementById('releaseDateInput');
  if (!input) return;
  const sync = () => {
    state.releaseDate = toDateValue(input.value);
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
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

export const initReleaseStatusAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    releaseDate: toDateValue(lot?.releaseDate),
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || ''
  };

  bindReleaseInput();
  bindGeneralSelect();
  evaluate();
};
