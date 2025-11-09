// /assets/js/address-details/purchaserStatusTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const SAFE_STATUSES = new Set(['sold', 'closed']);
const SELECT_WARNING_CLASS = 'general-status-select--purchaser-warning';
const WARNING_ATTR = 'data-general-status-purchaser-warning';

const TASK_REASON = 'linked-purchaser-status-mismatch';
const LEGACY_REASONS = ['purchaser-status-mismatch', TASK_REASON];
const TASK_TITLE = 'Update general status for purchased home';
const LEGACY_TITLES = [
  TASK_TITLE.toLowerCase(),
  'review general status for purchased home'
];
const TASK_DESCRIPTION =
  'This address has a linked purchaser but the general status is not Sold or Closed.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { hasPurchaser: false, generalStatus: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const resolvePurchaserFlag = (lot, purchaser) => {
  if (purchaser && (purchaser._id || purchaser.id)) return true;
  const lotPurchaser = lot?.purchaser;
  if (!lotPurchaser) return false;
  if (typeof lotPurchaser === 'string') return Boolean(lotPurchaser.trim());
  if (typeof lotPurchaser === 'object') {
    return Boolean(lotPurchaser?._id || lotPurchaser?.id || lotPurchaser);
  }
  return Boolean(lotPurchaser);
};

const requiresWarning = () => {
  if (!state.hasPurchaser) return false;
  const status = normalizeStatus(state.generalStatus);
  return !SAFE_STATUSES.has(status);
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
        console.error('[purchaser-status-task] failed to fetch tasks', err);
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
      console.warn('[purchaser-status-task] prior completion failed', err);
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
        console.error('[purchaser-status-task] failed to reopen task', err);
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
      console.error('[purchaser-status-task] failed to create task', err);
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
      console.warn('[purchaser-status-task] prior ensure failed', err);
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
      console.error('[purchaser-status-task] failed to complete task', err);
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

const bindGeneralSelect = () => {
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  const sync = () => {
    state.generalStatus = select.value || '';
    evaluate();
  };
  select.addEventListener('change', sync);
};

export const initPurchaserStatusAutomation = ({ lotId, lot, purchaser }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    hasPurchaser: resolvePurchaserFlag(lot, purchaser),
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || ''
  };

  bindGeneralSelect();
  evaluate();
};
