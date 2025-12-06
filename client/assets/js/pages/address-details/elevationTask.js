// /assets/js/address-details/elevationTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WATCH_STATUSES = new Set(['spec', 'sold', 'closed']);
const INPUT_WARNING_CLASS = 'elevation-input--warning';
const WARNING_ATTR = 'data-elevation-warning';

const TASK_REASON = 'missing-elevation-for-spec';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Add elevation for SPEC / Sold home';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION =
  'General status is SPEC/Sold/Closed but the elevation field is blank.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'Medium';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { generalStatus: '', elevation: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const normalize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const requiresElevation = () => WATCH_STATUSES.has(normalize(state.generalStatus));
const hasElevation = () => Boolean(String(state.elevation || '').trim());

const notifyTaskPanel = (task) => {
  if (!task) return;
  emit('tasks:external-upsert', task);
};

const matchesTask = (task) => {
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
        console.error('[elevation-task] failed to fetch tasks', err);
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
      console.warn('[elevation-task] prior completion failed', err);
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
        console.error('[elevation-task] failed to reopen task', err);
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
      console.error('[elevation-task] failed to create task', err);
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
      console.warn('[elevation-task] prior ensure failed', err);
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
      console.error('[elevation-task] failed to complete task', err);
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
  const input = els.elevationInput || document.getElementById('elevationInput');
  if (!input) return;
  input.classList.toggle(INPUT_WARNING_CLASS, Boolean(enabled));
  if (enabled) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute(WARNING_ATTR, 'true');
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute(WARNING_ATTR);
  }
};

const evaluate = () => {
  const requires = requiresElevation();
  const missing = requires && !hasElevation();
  toggleHighlight(missing);
  if (missing) ensureAutoTask();
  else completeAutoTaskIfNeeded();
};

const bindGeneralStatus = () => {
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  const sync = () => {
    state.generalStatus = select.value || '';
    evaluate();
  };
  select.addEventListener('change', sync);
};

const bindElevationInput = () => {
  const input = els.elevationInput || document.getElementById('elevationInput');
  if (!input) return;
  const sync = () => {
    state.elevation = input.value || '';
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

export const initElevationAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || '',
    elevation: lot?.elevation || ''
  };
  bindGeneralStatus();
  bindElevationInput();
  evaluate();
};
