import { on, emit } from './events.js';
import { getState } from './state.js';
import { createTask, fetchTasks, updateTask } from './api.js';
import { parseCurrency } from './utils.js';

const STATUS_COMPLETED = 'Completed';
const STATUS_PENDING = 'Pending';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();
const WARNING_CLASS = 'input-sales-detail-missing';
const COMMON_LEGACY_REASON = 'missing-linked-lot-sales-details';
const COMMON_LEGACY_TITLE = 'Complete linked lot sales details';
const TASK_TYPE = 'System Suggestion';
const TASK_PRIORITY = 'High';
const TASK_CATEGORY = 'System';

const TASK_CONFIGS = {
  price: {
    key: 'price',
    reason: 'missing-linked-lot-sales-price',
    legacyReasons: [COMMON_LEGACY_REASON],
    title: 'Fill in sales price for linked lot',
    legacyTitles: [COMMON_LEGACY_TITLE],
    description: 'Sales price is required for this purchased buyer.',
    inputId: 'linked-sales-price',
    warningAttr: 'data-sales-price-warning',
    hasValue: hasSalesPrice
  },
  date: {
    key: 'date',
    reason: 'missing-linked-lot-sales-date',
    legacyReasons: [],
    title: 'Fill in sales date for linked lot',
    legacyTitles: [],
    description: 'Sales date is required for this purchased buyer.',
    inputId: 'linked-sale-date',
    warningAttr: 'data-sales-date-warning',
    hasValue: hasSalesDate
  }
};

const runtime = {
  price: { autoTask: null, ensuring: null, completing: null, highlight: false },
  date: { autoTask: null, ensuring: null, completing: null, highlight: false }
};

let lookupPromise = null;

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

function getRuntime(config) {
  if (!runtime[config.key]) {
    runtime[config.key] = { autoTask: null, ensuring: null, completing: null, highlight: false };
  }
  return runtime[config.key];
}

function getClaimedTaskIds(exceptKey) {
  return new Set(
    Object.entries(runtime)
      .filter(([key]) => key !== exceptKey)
      .map(([, entry]) => entry?.autoTask?._id)
      .filter(Boolean)
      .map((id) => String(id))
  );
}

function getInput(config) {
  return document.getElementById(config.inputId);
}

function setHighlight(el, enabled, attr) {
  if (!el) return;
  el.classList.toggle(WARNING_CLASS, Boolean(enabled));
  if (enabled) {
    el.setAttribute('aria-invalid', 'true');
    if (attr) el.setAttribute(attr, 'true');
  } else {
    el.removeAttribute('aria-invalid');
    if (attr) el.removeAttribute(attr);
  }
}

function updateHighlight(config, missing) {
  const entry = getRuntime(config);
  entry.highlight = Boolean(missing);
  setHighlight(getInput(config), entry.highlight, config.warningAttr);
}

function bindInput(config) {
  const input = getInput(config);
  if (!input || input.dataset.salesTaskBound === '1') {
    if (input) setHighlight(input, getRuntime(config).highlight, config.warningAttr);
    return;
  }

  input.dataset.salesTaskBound = '1';
  input.addEventListener('input', handleInputChange, { passive: true });
  input.addEventListener('change', handleInputChange);
  setHighlight(input, getRuntime(config).highlight, config.warningAttr);
}

function attachInputListeners() {
  Object.values(TASK_CONFIGS).forEach(bindInput);
}

function hasLinkedLot(state) {
  const lot = state?.linkedLot;
  if (!lot) return false;
  return Boolean(
    lot.lotId ||
      lot.communityId ||
      lot.address ||
      lot.jobNumber ||
      lot.lot ||
      lot.block
  );
}

function hasSalesPrice(state) {
  const input = document.getElementById('linked-sales-price');
  const inputValue = input ? parseCurrency(input.value) : null;
  if (inputValue != null && inputValue > 0) return true;
  const storedValue = parseCurrency(state?.linkedLot?.salesPrice);
  return storedValue != null && storedValue > 0;
}

function parseDateValue(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasSalesDate(state) {
  const input = document.getElementById('linked-sale-date');
  const inputValue = input ? parseDateValue(input.value) : null;
  if (inputValue) return true;
  const storedValue = parseDateValue(state?.linkedLot?.salesDate);
  return Boolean(storedValue);
}

function isPurchased(state) {
  const status = state?.contact?.status || state?.initialStatus || '';
  const normalized = normalizeStatus(status);
  return normalized === 'purchased' || normalized === 'purchaser';
}

function matchesConfigTask(task, config) {
  if (!task) return false;
  const reason = task.reason || '';
  const title = task.title || '';
  return (
    reason === config.reason ||
    (config.legacyReasons && config.legacyReasons.includes(reason)) ||
    title === config.title ||
    (config.legacyTitles && config.legacyTitles.includes(title))
  );
}

async function lookupTasks(contactId) {
  if (!contactId) return [];
  if (!lookupPromise) {
    lookupPromise = (async () => {
      try {
        const response = await fetchTasks({
          linkedModel: 'Contact',
          linkedId: contactId,
          limit: 100
        });
        return Array.isArray(response?.tasks) ? response.tasks : [];
      } catch (err) {
        console.error('[sales-detail-task] failed to load tasks', err);
        return [];
      }
    })();
  }
  return lookupPromise;
}

async function ensureAutoTask(config, contactId) {
  if (!contactId) return null;
  const entry = getRuntime(config);
  if (entry.ensuring) return entry.ensuring;

  entry.ensuring = (async () => {
    if (!entry.autoTask) {
      const tasks = await lookupTasks(contactId);
      const claimed = getClaimedTaskIds(config.key);
      const match = tasks.find(
        (task) => !claimed.has(String(task?._id)) && matchesConfigTask(task, config)
      );
      if (match) {
        entry.autoTask = match;
      }
    }

    if (entry.autoTask) {
      const status = String(entry.autoTask.status || '').trim().toLowerCase();
      if (status === COMPLETED_STATUS) {
        try {
          const response = await updateTask(entry.autoTask._id, { status: STATUS_PENDING });
          entry.autoTask = response.task;
          emit('tasks:external-upsert', entry.autoTask);
          lookupPromise = null;
        } catch (err) {
          console.error('[sales-detail-task] failed to reopen task', err);
        }
      }
      return entry.autoTask;
    }

    try {
      const response = await createTask({
        title: config.title,
        description: config.description,
        linkedModel: 'Contact',
        linkedId: contactId,
        type: TASK_TYPE,
        priority: TASK_PRIORITY,
        category: TASK_CATEGORY,
        status: STATUS_PENDING,
        autoCreated: true,
        reason: config.reason
      });
      entry.autoTask = response.task;
      emit('tasks:external-upsert', entry.autoTask);
      lookupPromise = null;
    } catch (err) {
      console.error('[sales-detail-task] failed to create task', err);
    }

    return entry.autoTask;
  })();

  try {
    return await entry.ensuring;
  } finally {
    entry.ensuring = null;
  }
}

async function completeAutoTaskIfNeeded(config) {
  const entry = getRuntime(config);
  if (!entry.autoTask) return;
  if (entry.completing) return;

  const status = String(entry.autoTask.status || '').trim().toLowerCase();
  if (status === COMPLETED_STATUS) return;

  entry.completing = (async () => {
    try {
      const response = await updateTask(entry.autoTask._id, { status: STATUS_COMPLETED });
      entry.autoTask = response.task;
      emit('tasks:external-upsert', entry.autoTask);
      lookupPromise = null;
    } catch (err) {
      console.error('[sales-detail-task] failed to complete task', err);
    }
  })();

  try {
    await entry.completing;
  } finally {
    entry.completing = null;
  }
}

function handleInputChange() {
  evaluate();
}

export function evaluate() {
  const state = getState();
  if (!state?.contactId) return;

  attachInputListeners();

  const shouldMonitor = isPurchased(state) && hasLinkedLot(state);
  if (!shouldMonitor) {
    Object.values(TASK_CONFIGS).forEach((config) => {
      updateHighlight(config, false);
      completeAutoTaskIfNeeded(config);
    });
    return;
  }

  const missingPrice = !TASK_CONFIGS.price.hasValue(state);
  const missingDate = !TASK_CONFIGS.date.hasValue(state);

  updateHighlight(TASK_CONFIGS.price, missingPrice);
  updateHighlight(TASK_CONFIGS.date, missingDate);

  if (missingPrice) ensureAutoTask(TASK_CONFIGS.price, state.contactId);
  else completeAutoTaskIfNeeded(TASK_CONFIGS.price);

  if (missingDate) ensureAutoTask(TASK_CONFIGS.date, state.contactId);
  else completeAutoTaskIfNeeded(TASK_CONFIGS.date);
}

export function initLotSalesPriceAutomation() {
  on('state:contact', evaluate);
  on('state:linkedLot', () => {
    attachInputListeners();
    evaluate();
  });
  on('init:done', () => {
    requestAnimationFrame(() => {
      attachInputListeners();
      evaluate();
    });
  });
}
