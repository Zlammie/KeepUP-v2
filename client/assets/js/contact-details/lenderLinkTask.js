import { on, emit } from './events.js';
import { getState } from './state.js';
import { createTask, fetchTasks, updateTask } from './api.js';

const INPUT_ID = 'lender-search-input';
const LENDER_LIST_ID = 'lender-list-container';
const WARNING_CLASS = 'input-lender-missing';
const WARNING_ATTR = 'data-lender-warning';

const PURCHASED_STATUSES = new Set(['purchased', 'purchaser']);

const TASK_REASON = 'missing-lender-link';
const TASK_TITLE = 'Link lender for purchaser';
const TASK_DESCRIPTION = 'Please link a lender to this purchased contact.';
const TASK_TYPE = 'System Suggestion';
const TASK_PRIORITY = 'High';
const TASK_CATEGORY = 'System';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

let currentContactId = null;
let autoTask = null;
let ensuringPromise = null;
let completingPromise = null;
let tasksFetchPromise = null;
let lookedUpExisting = false;
let lenderListObserver = null;

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function getInput() {
  return document.getElementById(INPUT_ID);
}

function applyHighlight(enabled) {
  const input = getInput();
  if (!input) return;

  if (enabled) {
    input.classList.add(WARNING_CLASS);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute(WARNING_ATTR, 'true');
  } else {
    input.classList.remove(WARNING_CLASS);
    input.removeAttribute('aria-invalid');
    input.removeAttribute(WARNING_ATTR);
  }
}

function hasLinkedLender(state) {
  const list = document.getElementById(LENDER_LIST_ID);
  if (list && list.querySelector('.lender-card')) return true;

  const contact = state?.contact;
  if (!contact) return false;

  if (contact.lenderId) return true;

  if (Array.isArray(contact.lenders)) {
    return contact.lenders.some((entry) => {
      if (!entry) return false;
      if (entry.isPrimary) return true;
      if (entry.lender) return true;
      if (entry.lenderId) return true;
      if (entry._id) return true;
      return false;
    });
  }

  return false;
}

function shouldHighlight(state) {
  if (!state?.contact) return false;
  const status = normalizeStatus(state.contact.status || state.initialStatus);
  if (!PURCHASED_STATUSES.has(status)) return false;
  return !hasLinkedLender(state);
}

function resetTaskState(contactId) {
  if (currentContactId === contactId) return;
  currentContactId = contactId || null;
  autoTask = null;
  ensuringPromise = null;
  completingPromise = null;
  tasksFetchPromise = null;
  lookedUpExisting = false;
}

function observeLenderList() {
  const list = document.getElementById(LENDER_LIST_ID);
  if (!list) return;

  if (!lenderListObserver) {
    lenderListObserver = new MutationObserver(() => {
      evaluateLenderHighlight();
    });
  }

  lenderListObserver.disconnect();
  lenderListObserver.observe(list, { childList: true });
}

function matchesAutoTask(task) {
  if (!task) return false;
  const reason = task.reason || '';
  const title = task.title || '';
  return reason === TASK_REASON || title === TASK_TITLE;
}

async function fetchTasksForContact(contactId) {
  if (!contactId) return [];
  if (!tasksFetchPromise) {
    tasksFetchPromise = (async () => {
      try {
        const response = await fetchTasks({
          linkedModel: 'Contact',
          linkedId: contactId,
          limit: 100
        });
        return Array.isArray(response?.tasks) ? response.tasks : [];
      } catch (err) {
        console.error('[lender-task] failed to load tasks', err);
        return [];
      }
    })();
  }
  return tasksFetchPromise;
}

async function ensureAutoTask(contactId) {
  if (!contactId) return null;
  if (ensuringPromise) return ensuringPromise;

  ensuringPromise = (async () => {
    if (!autoTask && !lookedUpExisting) {
      const tasks = await fetchTasksForContact(contactId);
      autoTask = tasks.find(matchesAutoTask) || null;
      lookedUpExisting = true;
    }

    if (autoTask) {
      const status = String(autoTask.status || '').trim().toLowerCase();
      if (status === COMPLETED_STATUS) {
        try {
          const response = await updateTask(autoTask._id, { status: STATUS_PENDING });
          autoTask = response.task;
          emit('tasks:external-upsert', autoTask);
          tasksFetchPromise = null;
        } catch (err) {
          console.error('[lender-task] failed to reopen task', err);
        }
      }
      return autoTask;
    }

    try {
      const response = await createTask({
        title: TASK_TITLE,
        description: TASK_DESCRIPTION,
        linkedModel: 'Contact',
        linkedId: contactId,
        type: TASK_TYPE,
        priority: TASK_PRIORITY,
        category: TASK_CATEGORY,
        status: STATUS_PENDING,
        autoCreated: true,
        reason: TASK_REASON
      });
      autoTask = response.task;
      emit('tasks:external-upsert', autoTask);
      tasksFetchPromise = null;
    } catch (err) {
      console.error('[lender-task] failed to create task', err);
    }

    return autoTask;
  })();

  try {
    return await ensuringPromise;
  } finally {
    ensuringPromise = null;
  }
}

async function completeAutoTaskIfNeeded(contactId) {
  if (completingPromise) return completingPromise;

  if (!autoTask && !lookedUpExisting && contactId) {
    const tasks = await fetchTasksForContact(contactId);
    autoTask = tasks.find(matchesAutoTask) || null;
    lookedUpExisting = true;
  }

  if (!autoTask) return null;

  const status = String(autoTask.status || '').trim().toLowerCase();
  if (status === COMPLETED_STATUS) return autoTask;

  completingPromise = (async () => {
    try {
      const response = await updateTask(autoTask._id, { status: STATUS_COMPLETED });
      autoTask = response.task;
      emit('tasks:external-upsert', autoTask);
      tasksFetchPromise = null;
    } catch (err) {
      console.error('[lender-task] failed to complete task', err);
    }
    return autoTask;
  })();

  try {
    return await completingPromise;
  } finally {
    completingPromise = null;
  }
}

export function evaluateLenderHighlight() {
  const state = getState();
  const contactId = state?.contactId || null;

  resetTaskState(contactId);
  observeLenderList();

  const highlight = shouldHighlight(state);
  applyHighlight(highlight);

  if (!contactId) return;

  if (highlight) {
    ensureAutoTask(contactId);
  } else {
    completeAutoTaskIfNeeded(contactId);
  }
}

export function initLenderLinkAutomation() {
  on('state:contact', evaluateLenderHighlight);
  on('init:done', () => {
    requestAnimationFrame(evaluateLenderHighlight);
  });
  observeLenderList();
}
