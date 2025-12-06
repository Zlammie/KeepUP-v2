// /assets/js/address-details/expectedCompletionTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WARNING_CLASS = 'expected-completion-input--warning';
const WARNING_ATTR = 'data-expected-completion-warning';

const TASK_REASON = 'missing-expected-completion-after-release';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Add expected completion date';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION = 'Release date is set but expected completion is blank.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'Medium';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { releaseDate: '', expectedCompletion: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const toDateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const notifyTaskPanel = (task) => {
  if (!task) return;
  emit('tasks:external-upsert', task);
};

const matchesTask = (task) => {
  if (!task) return false;
  const reason = String(task.reason || '').trim().toLowerCase();
  if (reason && LEGACY_REASONS.includes(reason)) return true;
  const title = String(task.title || '').trim().toLowerCase();
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
        console.error('[expected-completion-task] failed to fetch tasks', err);
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
      console.warn('[expected-completion-task] prior completion failed', err);
    }
  }
  const existing = await getAutoTask();
  if (existing) {
    const status = String(existing.status || '').trim().toLowerCase();
    if (status === COMPLETED_STATUS) {
      try {
        const response = await updateTask(existing._id, { status: STATUS_PENDING });
        autoTask = response.task;
        lookupPromise = null;
        notifyTaskPanel(autoTask);
      } catch (err) {
        console.error('[expected-completion-task] failed to reopen task', err);
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
      console.error('[expected-completion-task] failed to create task', err);
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
      console.warn('[expected-completion-task] prior ensure failed', err);
    }
  }
  const task = await getAutoTask();
  if (!task) return null;
  const status = String(task.status || '').trim().toLowerCase();
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
      console.error('[expected-completion-task] failed to complete task', err);
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
  const input = els.expectedCompletionInput || document.getElementById('expectedCompletionInput');
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
  const hasRelease = Boolean(state.releaseDate);
  const missingCompletion = !String(state.expectedCompletion || '').trim();
  const warn = hasRelease && missingCompletion;
  toggleHighlight(warn);
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

const bindCompletionInput = () => {
  const input = els.expectedCompletionInput || document.getElementById('expectedCompletionInput');
  if (!input) return;
  const sync = () => {
    state.expectedCompletion = toDateValue(input.value);
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

export const initExpectedCompletionAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    releaseDate: toDateValue(lot?.releaseDate),
    expectedCompletion: toDateValue(lot?.expectedCompletionDate)
  };
  bindReleaseInput();
  bindCompletionInput();
  evaluate();
};
