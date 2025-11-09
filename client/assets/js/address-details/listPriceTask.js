// /assets/js/address-details/listPriceTask.js
import { els } from './domCache.js';
import { parseCurrency } from './utils.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WATCH_STATUSES = new Set(['spec', 'sold']);
const WARNING_CLASS = 'list-price-input--warning';
const WARNING_ATTR = 'data-list-price-warning';

const TASK_REASON = 'missing-lot-list-price';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Add list price before SPEC/Sold';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION = 'This SPEC or Sold home is missing a list price. Please enter one.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { generalStatus: '', listPrice: null };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const toNumber = (value) => {
  const numeric = parseCurrency(value);
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
};

const hasListPrice = (value) => {
  const numeric = toNumber(value);
  return numeric != null && numeric > 0;
};

const matchesAutoTask = (task) => {
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
        const response = await fetchTasks({
          linkedModel: 'Lot',
          linkedId: lotContext.lotId
        });
        return Array.isArray(response?.tasks) ? response.tasks : [];
      } catch (err) {
        console.error('[list-price-task] failed to fetch tasks', err);
        return [];
      }
    })();
  }
  return lookupPromise;
};

const getAutoTask = async () => {
  if (autoTask) return autoTask;
  const tasks = await fetchLotTasks();
  autoTask = tasks.find((task) => matchesAutoTask(task)) || null;
  return autoTask;
};

const notifyTaskPanel = (task) => {
  if (task && typeof emit === 'function') {
    emit('tasks:external-upsert', task);
  }
};

const ensureAutoTask = async () => {
  if (!lotContext.lotId) return null;
  if (completingPromise) {
    try { await completingPromise; } catch (err) { /* noop */ }
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
        console.error('[list-price-task] failed to reopen task', err);
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
      console.error('[list-price-task] failed to create task', err);
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
    try { await ensuringPromise; } catch (err) { /* noop */ }
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
      console.error('[list-price-task] failed to complete task', err);
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
  const input = els.listPriceInput || document.getElementById('listPriceInput');
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
  const needsListPrice = WATCH_STATUSES.has(normalizeStatus(state.generalStatus));
  const hasPrice = hasListPrice(state.listPrice);
  const shouldWarn = needsListPrice && !hasPrice;

  toggleHighlight(shouldWarn);

  if (shouldWarn) {
    ensureAutoTask();
  } else {
    completeAutoTaskIfNeeded();
  }
};

const bindGeneralStatus = () => {
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  state.generalStatus = select.value || state.generalStatus;
  select.addEventListener('change', () => {
    state.generalStatus = select.value;
    evaluate();
  });
};

const bindListPriceInput = () => {
  const input = els.listPriceInput || document.getElementById('listPriceInput');
  if (!input) return;
  if (state.listPrice == null) {
    state.listPrice = toNumber(input.value);
  }
  const sync = () => {
    state.listPrice = toNumber(input.value);
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

export const initListPriceAutomation = ({ lotId, lot }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    generalStatus: lot?.generalStatus || lot?.statusGeneral || lot?.general || '',
    listPrice: toNumber(lot?.listPrice)
  };

  bindGeneralStatus();
  bindListPriceInput();
  evaluate();
};
