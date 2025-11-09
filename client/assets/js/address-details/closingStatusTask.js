// /assets/js/address-details/closingStatusTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const SAFE_STATUS = 'closed';
const WARNING_CLASS = 'general-status-select--closing-warning';
const WARNING_ATTR = 'data-general-status-closing-warning';

const TASK_REASON = 'closing-date-past-status-mismatch';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Mark home as Closed';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION = 'Closing date is in the past but the general status is not Closed.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { closingDate: '', generalStatus: '' };
let autoTask = null;
let lookupPromise = null;
let ensuringPromise = null;
let completingPromise = null;

const toDateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0] || '';
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const parseDate = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const isClosedStatus = () =>
  String(state.generalStatus || '')
    .trim()
    .toLowerCase() === SAFE_STATUS;

const isClosingPast = () => {
  const closing = parseDate(state.closingDate);
  if (!closing) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return closing.getTime() < today.getTime();
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
        console.error('[closing-status-task] failed to fetch tasks', err);
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
      console.warn('[closing-status-task] prior completion failed', err);
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
        console.error('[closing-status-task] failed to reopen task', err);
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
      console.error('[closing-status-task] failed to create task', err);
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
      console.warn('[closing-status-task] prior ensure failed', err);
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
      console.error('[closing-status-task] failed to complete task', err);
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
  const select = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (!select) return;
  select.classList.toggle(WARNING_CLASS, Boolean(enabled));
  if (enabled) {
    select.setAttribute('aria-invalid', 'true');
    select.setAttribute(WARNING_ATTR, 'true');
  } else {
    select.removeAttribute('aria-invalid');
    select.removeAttribute(WARNING_ATTR);
  }
};

const evaluate = () => {
  const needs = isClosingPast() && !isClosedStatus();
  toggleHighlight(needs);
  if (needs) ensureAutoTask();
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

const bindClosingDateInput = () => {
  const input = els.closingDateInput || document.getElementById('closingDateInput');
  if (!input) return;
  const sync = () => {
    state.closingDate = toDateValue(input.value);
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

export const initClosingStatusAutomation = ({ lotId, lot, primaryEntry }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  state = {
    closingDate:
      toDateValue(lot?.closingDate || lot?.closingDateTime) ||
      toDateValue(primaryEntry?.closingDateTime || primaryEntry?.closingDate) ||
      '',
    generalStatus: lot?.generalStatus || lot?.general || lot?.statusGeneral || ''
  };
  bindGeneralSelect();
  bindClosingDateInput();
  evaluate();
};
