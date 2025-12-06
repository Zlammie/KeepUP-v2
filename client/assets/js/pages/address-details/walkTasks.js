// /assets/js/address-details/walkTasks.js
import { els } from './domCache.js';
import { createTask, fetchTasks, updateTask } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_TYPE = 'System Suggestion';
const TASK_CATEGORY = 'System';
const TASK_PRIORITY = 'High';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

const WARNING_ATTR = 'data-walk-warning';

const TASK_CONFIGS = [
  {
    key: 'thirdParty',
    dateId: 'thirdPartyDate',
    timeId: 'thirdPartyTime',
    reason: 'missing-third-party-before-closing',
    legacyReasons: ['missing-third-party-before-closing'],
    title: 'Schedule third-party inspection',
    legacyTitles: [
      'schedule third-party inspection',
      'set third-party inspection date'
    ],
    description: 'Closing is less than 30 days away. Set the third-party inspection date.',
    warningClass: 'walk-input--warning'
  },
  {
    key: 'firstWalk',
    dateId: 'firstWalkDate',
    timeId: 'firstWalkTime',
    reason: 'missing-first-walk-before-closing',
    legacyReasons: ['missing-first-walk-before-closing'],
    title: 'Schedule first walk',
    legacyTitles: [
      'schedule first walk',
      'set first walk date'
    ],
    description: 'Closing is less than 30 days away. Set the first walk date.',
    warningClass: 'walk-input--warning'
  },
  {
    key: 'finalSignOff',
    dateId: 'finalSignOffDate',
    timeId: 'finalSignOffTime',
    reason: 'missing-final-signoff-before-closing',
    legacyReasons: ['missing-final-signoff-before-closing'],
    title: 'Schedule final sign-off',
    legacyTitles: [
      'schedule final sign-off',
      'set final sign off date'
    ],
    description: 'Closing is less than 30 days away. Set the final sign-off date.',
    warningClass: 'walk-input--warning'
  }
];

let initialized = false;
let lotContext = { lotId: null };
const state = {
  closingDate: '',
  thirdParty: '',
  firstWalk: '',
  finalSignOff: ''
};

const runtime = {};
let tasksFetchPromise = null;

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

const parseDate = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const withinWindow = () => {
  const closing = parseDate(state.closingDate);
  if (!closing) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((closing.getTime() - today.getTime()) / DAY_MS);
  return diffDays <= WINDOW_DAYS;
};

const getRuntime = (key) => {
  if (!runtime[key]) {
    runtime[key] = { task: null, ensuring: null, completing: null };
  }
  return runtime[key];
};

const notifyTaskPanel = (task) => {
  if (!task) return;
  emit('tasks:external-upsert', task);
};

const fetchLotTasks = async () => {
  if (!lotContext.lotId) return [];
  if (!tasksFetchPromise) {
    tasksFetchPromise = (async () => {
      try {
        const response = await fetchTasks({
          linkedModel: 'Lot',
          linkedId: lotContext.lotId
        });
        return Array.isArray(response?.tasks) ? response.tasks : [];
      } catch (err) {
        console.error('[walk-tasks] failed to fetch tasks', err);
        return [];
      }
    })();
  }
  return tasksFetchPromise;
};

const matchesTask = (task, config) => {
  if (!task) return false;
  const reason = String(task.reason || '').trim().toLowerCase();
  if (reason && config.legacyReasons.includes(reason)) return true;
  const title = String(task.title || '').trim().toLowerCase();
  return title && config.legacyTitles.includes(title);
};

const getExistingTask = async (config) => {
  const rt = getRuntime(config.key);
  if (rt.task) return rt.task;
  const tasks = await fetchLotTasks();
  rt.task = tasks.find((task) => matchesTask(task, config)) || null;
  return rt.task;
};

const ensureTask = async (config) => {
  const rt = getRuntime(config.key);
  if (!lotContext.lotId) return null;
  if (rt.completing) {
    try {
      await rt.completing;
    } catch (err) {
      console.warn('[walk-tasks] prior completion failed', err);
    }
  }
  const existing = await getExistingTask(config);
  if (existing) {
    const status = String(existing.status || '').trim().toLowerCase();
    if (status === COMPLETED_STATUS) {
      try {
        const response = await updateTask(existing._id, { status: STATUS_PENDING });
        rt.task = response.task;
        tasksFetchPromise = null;
        notifyTaskPanel(rt.task);
      } catch (err) {
        console.error('[walk-tasks] failed to reopen task', err);
      }
    }
    return rt.task;
  }
  if (rt.ensuring) return rt.ensuring;
  rt.ensuring = (async () => {
    try {
      const response = await createTask({
        title: config.title,
        description: config.description,
        linkedModel: 'Lot',
        linkedId: lotContext.lotId,
        type: TASK_TYPE,
        category: TASK_CATEGORY,
        priority: TASK_PRIORITY,
        status: STATUS_PENDING,
        autoCreated: true,
        reason: config.reason
      });
      rt.task = response.task;
      tasksFetchPromise = null;
      notifyTaskPanel(rt.task);
      return rt.task;
    } catch (err) {
      console.error('[walk-tasks] failed to create task', err);
      return null;
    }
  })();

  try {
    return await rt.ensuring;
  } finally {
    rt.ensuring = null;
  }
};

const completeTaskIfNeeded = async (config) => {
  const rt = getRuntime(config.key);
  if (rt.ensuring) {
    try {
      await rt.ensuring;
    } catch (err) {
      console.warn('[walk-tasks] ensure failed', err);
    }
  }
  if (!rt.task) return null;
  const status = String(rt.task.status || '').trim().toLowerCase();
  if (status === COMPLETED_STATUS) return rt.task;
  if (rt.completing) return rt.completing;
  rt.completing = (async () => {
    try {
      const response = await updateTask(rt.task._id, { status: STATUS_COMPLETED });
      rt.task = response.task;
      tasksFetchPromise = null;
      notifyTaskPanel(rt.task);
      return rt.task;
    } catch (err) {
      console.error('[walk-tasks] failed to complete task', err);
      return rt.task;
    }
  })();

  try {
    return await rt.completing;
  } finally {
    rt.completing = null;
  }
};

const toggleHighlight = (config, enabled) => {
  const dateInput = document.getElementById(config.dateId);
  const timeInput = document.getElementById(config.timeId);
  const apply = (node) => {
    if (!node) return;
    node.classList.toggle(config.warningClass, Boolean(enabled));
    if (enabled) {
      node.setAttribute('aria-invalid', 'true');
      node.setAttribute(WARNING_ATTR, 'true');
    } else {
      node.removeAttribute('aria-invalid');
      node.removeAttribute(WARNING_ATTR);
    }
  };
  apply(dateInput);
  apply(timeInput);
};

const hasMilestoneValue = (config) => Boolean(state[config.key]);

const evaluateConfig = (config) => {
  const needs = withinWindow() && !hasMilestoneValue(config);
  toggleHighlight(config, needs);
  if (needs) ensureTask(config);
  else completeTaskIfNeeded(config);
};

const evaluateAll = () => {
  TASK_CONFIGS.forEach(evaluateConfig);
};

const bindClosingInput = () => {
  const input = els.closingDateInput || document.getElementById('closingDateInput');
  if (!input) return;
  const sync = () => {
    state.closingDate = toDateValue(input.value);
    evaluateAll();
  };
  input.addEventListener('input', sync, { passive: true });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
};

const bindMilestoneInputs = () => {
  TASK_CONFIGS.forEach((config) => {
    const dateInput = document.getElementById(config.dateId);
    const timeInput = document.getElementById(config.timeId);
    const sync = () => {
      const dateVal = toDateValue(dateInput?.value || state[config.key]);
      const hasValue = Boolean(dateVal);
      state[config.key] = hasValue ? dateVal : '';
      evaluateConfig(config);
    };
    if (dateInput) {
      dateInput.addEventListener('input', sync, { passive: true });
      dateInput.addEventListener('change', sync);
      dateInput.addEventListener('blur', sync);
    }
    if (timeInput) {
      timeInput.addEventListener('input', sync, { passive: true });
      timeInput.addEventListener('change', sync);
      timeInput.addEventListener('blur', sync);
    }
  });
};

export const initWalkTasksAutomation = ({ lotId, lot, primaryEntry }) => {
  if (initialized) return;
  initialized = true;
  lotContext = { lotId: lotId || null };
  const closingSource =
    lot?.closingDate ||
    lot?.closingDateTime ||
    primaryEntry?.closingDateTime ||
    primaryEntry?.closingDate ||
    null;
  state.closingDate = toDateValue(closingSource);
  state.thirdParty = toDateValue(lot?.thirdParty);
  state.firstWalk = toDateValue(lot?.firstWalk);
  state.finalSignOff = toDateValue(lot?.finalSignOff);

  bindClosingInput();
  bindMilestoneInputs();
  evaluateAll();
};
