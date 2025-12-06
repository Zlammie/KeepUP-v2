// /assets/js/address-details/releaseDateTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WATCH_STATUSES = new Set(['spec', 'sold', 'closed']);
const WARNING_CLASS = 'release-date-input--warning';
const WARNING_ATTR = 'data-release-date-warning';
const TASK_REASON = 'missing-lot-release-date';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Add release date for this lot';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION = 'Please set a release date so this address can be tracked.';
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

const hasReleaseDate = (value) => Boolean(String(value || '').trim());

const normalize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const requiresReleaseDate = () => WATCH_STATUSES.has(normalize(state.generalStatus));

const notifyTaskPanel = (task) => {
  if (!task) return;
  emit('tasks:external-upsert', task);
};

const matchesReleaseTask = (task) => {
  if (!task) return false;
  const reason = normalize(task.reason);
  if (reason && LEGACY_REASONS.includes(reason)) return true;
  const title = normalize(task.title);
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
        console.error('[release-date-task] fetch failed', err);
        return [];
      }
    })();
  }
  return lookupPromise;
};

const getAutoTask = async () => {
  if (autoTask) return autoTask;
  const tasks = await fetchLotTasks();
  autoTask = tasks.find((task) => matchesReleaseTask(task)) || null;
  return autoTask;
};

const ensureAutoTask = async () => {
  if (!lotContext.lotId) return null;
  if (completingPromise) {
    try {
      await completingPromise;
    } catch (err) {
      console.warn('[release-date-task] prior completion failed', err);
    }
  }
  const existing = await getAutoTask();
  if (existing) {
    const status = normalize(existing.status);
    if (status === COMPLETED_STATUS) {
      try {
        const response = await updateTask(existing._id, { status: STATUS_PENDING });
        autoTask = response.task;
        lookupPromise = null;
        notifyTaskPanel(autoTask);
      } catch (err) {
        console.error('[release-date-task] failed to reopen task', err);
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
      console.error('[release-date-task] failed to create task', err);
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
      console.warn('[release-date-task] prior ensure failed', err);
    }
  }
  const task = await getAutoTask();
  if (!task) return null;
  const status = normalize(task.status);
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
      console.error('[release-date-task] failed to complete task', err);
      return task;
    }
  })();

  try {
    return await completingPromise;
  } finally {
    completingPromise = null;
  }
};

const toggleHighlight = (enabled) => {
  const input = els.releaseDateInput || document.getElementById('releaseDateInput');
  if (!input) return;
  input.classList.toggle(WARNING_CLASS, Boolean(enabled));
  if (enabled) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute(WARNING_ATTR, 'true');
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute(WARNING_ATTR);
  }
};

const evaluate = () => {
  const requires = requiresReleaseDate();
  const missing = requires && !hasReleaseDate(state.releaseDate);
  toggleHighlight(missing);
  if (missing) {
    ensureAutoTask();
  } else {
    completeAutoTaskIfNeeded();
  }
};

const bindReleaseDateInput = () => {
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

const bindGeneralStatusSelect = () => {
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  const sync = () => {
    state.generalStatus = select.value || '';
    evaluate();
  };
  select.addEventListener('change', sync);
};

export const initReleaseDateAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    releaseDate: toDateValue(lot?.releaseDate),
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || ''
  };
  bindReleaseDateInput();
  bindGeneralStatusSelect();
  evaluate();
};
