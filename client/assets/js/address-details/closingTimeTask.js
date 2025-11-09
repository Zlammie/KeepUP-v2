// /assets/js/address-details/closingTimeTask.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const WARNING_CLASS = 'closing-time-input--warning';
const WARNING_ATTR = 'data-closing-time-warning';

const TASK_REASON = 'missing-closing-time-before-closing';
const LEGACY_REASONS = [TASK_REASON];
const TASK_TITLE = 'Set closing time';
const LEGACY_TITLES = [TASK_TITLE.toLowerCase()];
const TASK_DESCRIPTION = 'Closing is less than 14 days away but the closing time is blank.';
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let initialized = false;
let lotContext = { lotId: null };
let state = { closingDate: '', closingTime: '' };
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

const toTimeValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{2}:\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 5);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return '';
    }
    if (trimmed.includes('T')) {
      const [, timePart = ''] = trimmed.split('T');
      return timePart.slice(0, 5);
    }
    return '';
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  if (dt.getHours() === 0 && dt.getMinutes() === 0) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const parseDate = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const isWithinWindow = () => {
  const closing = parseDate(state.closingDate);
  if (!closing) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((closing.getTime() - today.getTime()) / DAY_MS);
  return diffDays <= WINDOW_DAYS;
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
        console.error('[closing-time-task] failed to fetch tasks', err);
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
      console.warn('[closing-time-task] prior completion failed', err);
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
        console.error('[closing-time-task] failed to reopen task', err);
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
      console.error('[closing-time-task] failed to create task', err);
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
      console.warn('[closing-time-task] prior ensure failed', err);
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
      console.error('[closing-time-task] failed to complete task', err);
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
  const input = els.closingTimeInput || document.getElementById('closingTimeInput');
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
  const warn = isWithinWindow() && !state.closingTime;
  toggleHighlight(warn);
  if (warn) ensureAutoTask();
  else completeAutoTaskIfNeeded();
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

const bindClosingTimeInput = () => {
  const input = els.closingTimeInput || document.getElementById('closingTimeInput');
  if (!input) return;
  const sync = () => {
    state.closingTime = toTimeValue(input.value);
    evaluate();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

const extractFromPrimary = (primaryEntry) => {
  const source = primaryEntry?.closingDateTime || primaryEntry?.closingDate || '';
  return {
    date: toDateValue(source),
    time: toTimeValue(source)
  };
};

const syncStateFromInputs = () => {
  const dateInput = els.closingDateInput || document.getElementById('closingDateInput');
  const timeInput = els.closingTimeInput || document.getElementById('closingTimeInput');
  if (dateInput && dateInput.value) {
    state.closingDate = toDateValue(dateInput.value);
  }
  if (timeInput) {
    state.closingTime = toTimeValue(timeInput.value);
  }
};

export const initClosingTimeAutomation = ({ lotId, lot, primaryEntry }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };

  const primary = extractFromPrimary(primaryEntry || null);
  state.closingDate =
    toDateValue(lot?.closingDate || lot?.closingDateTime) || primary.date || '';
  state.closingTime =
    toTimeValue(lot?.closingTime || lot?.closingDateTime || primaryEntry?.closingDateTime) ||
    toTimeValue(primaryEntry?.closingDate) ||
    '';

  bindClosingDateInput();
  bindClosingTimeInput();
  syncStateFromInputs();
  evaluate();
};
