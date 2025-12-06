import { on, emit } from './events.js';
import { getState } from './state.js';
import { createTask, fetchTasks, updateTask } from './api.js';

const INPUT_ID = 'lender-search-input';
const LENDER_LIST_ID = 'lender-list-container';
const COMMUNITY_SELECT_ID = 'community-select';
const WARNING_ATTR = 'data-lender-warning';
const INPUT_WARNING_CLASS = 'input-lender-missing';
const CARD_PRIMARY_WARNING_CLASS = 'lender-card-missing-primary';
const LABEL_PRIMARY_WARNING_CLASS = 'primary-label-missing-primary';
const INVITE_INPUT_WARNING_CLASS = 'lender-invite-date-missing';
const APPROVED_INPUT_WARNING_CLASS = 'lender-approved-date-missing';
const COMMUNITY_WARNING_CLASS = 'community-select-missing';

const PURCHASED_STATUSES = new Set(['purchased', 'purchaser']);
const COMMUNITY_REQUIRED_STATUSES = new Set(['purchased', 'purchaser', 'negotiating', 'possible']);

const TASK_TYPE = 'System Suggestion';
const TASK_PRIORITY = 'High';
const TASK_CATEGORY = 'System';
const STATUS_PENDING = 'Pending';
const STATUS_COMPLETED = 'Completed';
const COMPLETED_STATUS = STATUS_COMPLETED.toLowerCase();

const TASK_DEFINITIONS = {
  primary: {
    reason: 'missing-primary-lender',
    legacyReasons: ['missing-lender-link'],
    title: 'Select primary lender for purchaser',
    legacyTitles: ['Link lender for purchaser'],
    description: 'Please set a primary lender for this purchased contact.'
  },
  invite: {
    reason: 'missing-lender-invite-date',
    legacyReasons: ['missing-lender-invite-date'],
    title: 'Add invite date for lender',
    legacyTitles: ['Add invite date for lender'],
    description: 'Please add an invite date for each linked lender.'
  },
  community: {
    reason: 'missing-linked-community',
    legacyReasons: ['missing-linked-community'],
    title: 'Link community to contact',
    legacyTitles: ['Link community to contact'],
    description: 'Please link this contact to at least one community.'
  }
};

const taskState = Object.fromEntries(
  Object.keys(TASK_DEFINITIONS).map((key) => [
    key,
    { task: null, ensuring: null, completing: null, lookedUp: false }
  ])
);

let currentContactId = null;
let tasksFetchPromise = null;
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

function getCommunitySelect() {
  return document.getElementById(COMMUNITY_SELECT_ID);
}

function applyHighlight({
  highlightInput = false,
  highlightPrimary = false,
  missingInviteIds = [],
  missingApprovedIds = [],
  highlightCommunity = false
} = {}) {
  const input = getInput();
  if (input) {
    if (highlightInput) {
      input.classList.add(INPUT_WARNING_CLASS);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute(WARNING_ATTR, 'true');
    } else {
      input.classList.remove(INPUT_WARNING_CLASS);
      input.removeAttribute('aria-invalid');
      input.removeAttribute(WARNING_ATTR);
    }
  }

  const missingInviteSet = new Set(
    (missingInviteIds || []).filter(Boolean).map((value) => String(value))
  );
  const missingApprovedSet = new Set(
    (missingApprovedIds || []).filter(Boolean).map((value) => String(value))
  );

  const cards = document.querySelectorAll(`#${LENDER_LIST_ID} .lender-card`);
  cards.forEach((card) => {
    const entryId = card.dataset.entryId ? String(card.dataset.entryId) : '';
    const inviteMissing = entryId && missingInviteSet.has(entryId);
    const approvedMissing = entryId && missingApprovedSet.has(entryId);

    card.classList.toggle(CARD_PRIMARY_WARNING_CLASS, highlightPrimary);

    const primaryLabel = card.querySelector('.primary-label');
    if (primaryLabel) {
      primaryLabel.classList.toggle(
        LABEL_PRIMARY_WARNING_CLASS,
        highlightPrimary
      );
      if (highlightPrimary) {
        primaryLabel.setAttribute('aria-invalid', 'true');
      } else {
        primaryLabel.removeAttribute('aria-invalid');
      }
    }

    const primaryRadio = card.querySelector('input[name="primaryLender"]');
    if (primaryRadio) {
      if (highlightPrimary) {
        primaryRadio.setAttribute('aria-invalid', 'true');
      } else {
        primaryRadio.removeAttribute('aria-invalid');
      }
    }

    const inviteInput = card.querySelector('.lender-invite-date');
    if (inviteInput) {
      inviteInput.classList.toggle(INVITE_INPUT_WARNING_CLASS, inviteMissing);
      if (inviteMissing) {
        inviteInput.setAttribute('aria-invalid', 'true');
        inviteInput.setAttribute(WARNING_ATTR, 'true');
      } else {
        inviteInput.removeAttribute('aria-invalid');
        inviteInput.removeAttribute(WARNING_ATTR);
      }
    }

    const approvedInput = card.querySelector('.lender-approved-date');
    if (approvedInput) {
      approvedInput.classList.toggle(APPROVED_INPUT_WARNING_CLASS, approvedMissing);
      if (approvedMissing) {
        approvedInput.setAttribute('aria-invalid', 'true');
        approvedInput.setAttribute(WARNING_ATTR, 'true');
      } else {
        approvedInput.removeAttribute('aria-invalid');
        approvedInput.removeAttribute(WARNING_ATTR);
      }
    }
  });

  const communitySelect = getCommunitySelect();
  if (communitySelect) {
    communitySelect.classList.toggle(COMMUNITY_WARNING_CLASS, highlightCommunity);
    if (highlightCommunity) {
      communitySelect.setAttribute('aria-invalid', 'true');
      communitySelect.setAttribute(WARNING_ATTR, 'true');
    } else {
      communitySelect.removeAttribute('aria-invalid');
      communitySelect.removeAttribute(WARNING_ATTR);
    }
  }
}

function resetTaskState(contactId) {
  if (currentContactId === contactId) return;
  currentContactId = contactId || null;
  tasksFetchPromise = null;
  Object.values(taskState).forEach((tracker) => {
    tracker.task = null;
    tracker.ensuring = null;
    tracker.completing = null;
    tracker.lookedUp = false;
  });
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

function hasInviteDate(entry) {
  const raw = entry?.inviteDate;
  if (raw == null) return false;
  if (raw instanceof Date) return !Number.isNaN(raw.valueOf());
  const str = String(raw).trim();
  if (!str) return false;
  if (str.toLowerCase() === 'invalid date') return false;
  return true;
}

function normalizeIdValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
    if (value.communityId) return normalizeIdValue(value.communityId);
    if (value.community) return normalizeIdValue(value.community);
  }
  return String(value);
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeIdValue)
    .filter(Boolean);
}

function isCommunityMissing(state) {
  const contact = state?.contact;
  if (contact) {
    const candidateArrays = [
      normalizeIdList(contact.communities),
      normalizeIdList(contact.communityIds)
    ];
    const flattened = candidateArrays.flat();
    if (flattened.length > 0) return false;

    const singleCommunity =
      normalizeIdValue(contact.communityId) ??
      normalizeIdValue(contact.community);
    if (singleCommunity) return false;

    const hidden = document.getElementById('communities');
    if (hidden) {
      try {
        const parsed = JSON.parse(hidden.value || '[]');
        if (normalizeIdList(Array.isArray(parsed) ? parsed : []).length > 0) {
          return false;
        }
      } catch (_) {
        /* ignore parse issues */
      }
    }
  }

  const select = getCommunitySelect();
  if (select) {
    const hasSelection = Array.from(select.selectedOptions || []).some(
      (opt) => Boolean(opt?.value?.trim())
    );
    if (hasSelection) return false;
  }

  return true;
}

function resolveHighlightState(state) {
  if (!state?.contact) {
    return {
      highlightInput: false,
      highlightPrimary: false,
      missingInviteIds: [],
      missingApprovedIds: [],
      highlightCommunity: false
    };
  }

  const status = normalizeStatus(state.contact.status || state.initialStatus);
  const requireCommunity = COMMUNITY_REQUIRED_STATUSES.has(status);

  if (!PURCHASED_STATUSES.has(status)) {
    return {
      highlightInput: false,
      highlightPrimary: false,
      missingInviteIds: [],
      missingApprovedIds: [],
      highlightCommunity: requireCommunity && isCommunityMissing(state)
    };
  }

  const list = document.getElementById(LENDER_LIST_ID);
  const domHasCards = Boolean(list && list.querySelector('.lender-card'));

  const lenders = Array.isArray(state.contact.lenders)
    ? state.contact.lenders.filter(Boolean)
    : [];

  const hasPrimary = lenders.some((entry) => Boolean(entry?.isPrimary));
  const missingInviteIds = lenders
    .filter((entry) => !hasInviteDate(entry))
    .map((entry) => entry?._id)
    .filter(Boolean)
    .map((id) => String(id));
  const missingApprovedIds = lenders
    .filter((entry) => {
      const entryStatus = String(entry?.status || '').trim().toLowerCase();
      if (entryStatus !== 'approved') return false;
      const raw = entry?.approvedDate;
      if (raw == null) return true;
      if (raw instanceof Date) return Number.isNaN(raw.valueOf());
      const str = String(raw).trim();
      if (!str) return true;
      if (str.toLowerCase() === 'invalid date') return true;
      return false;
    })
    .map((entry) => entry?._id)
    .filter(Boolean)
    .map((id) => String(id));

  const hasLegacyLinked = Boolean(state.contact.lenderId);
  const hasAnyLender = domHasCards || lenders.length > 0 || hasLegacyLinked;

  const communityEmpty = isCommunityMissing(state);

  return {
    highlightInput: !hasAnyLender,
    highlightPrimary: hasAnyLender && !hasPrimary,
    missingInviteIds,
    missingApprovedIds,
    highlightCommunity: requireCommunity && communityEmpty
  };
}

function getTaskTracker(key) {
  return taskState[key] || null;
}

function getTaskConfig(key) {
  return TASK_DEFINITIONS[key] || null;
}

function getTaskKeyFromTask(task) {
  if (!task) return null;
  const reason = String(task.reason || '').trim();
  const title = String(task.title || '').trim();

  for (const [key, config] of Object.entries(TASK_DEFINITIONS)) {
    const reasons = [config.reason, ...(config.legacyReasons || [])].filter(Boolean);
    const titles = [config.title, ...(config.legacyTitles || [])].filter(Boolean);

    if (reasons.includes(reason) || titles.includes(title)) {
      return key;
    }
  }

  return null;
}

function assignExistingTasks(tasks) {
  if (!Array.isArray(tasks)) return;
  tasks.forEach((task) => {
    const key = getTaskKeyFromTask(task);
    if (!key) return;
    const tracker = getTaskTracker(key);
    if (tracker && !tracker.task) {
      tracker.task = task;
    }
  });
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

async function ensureAutoTask(contactId, key) {
  if (!contactId) return null;
  const tracker = getTaskTracker(key);
  const config = getTaskConfig(key);
  if (!tracker || !config) return null;
  if (tracker.ensuring) return tracker.ensuring;

  tracker.ensuring = (async () => {
    if (!tracker.task && !tracker.lookedUp) {
      const tasks = await fetchTasksForContact(contactId);
      assignExistingTasks(tasks);
      tracker.lookedUp = true;
    }

    if (tracker.task) {
      const status = String(tracker.task.status || '').trim().toLowerCase();
      if (status === COMPLETED_STATUS) {
        try {
          const response = await updateTask(tracker.task._id, { status: STATUS_PENDING });
          tracker.task = response.task;
          emit('tasks:external-upsert', tracker.task);
          tasksFetchPromise = null;
        } catch (err) {
          console.error(`[lender-task] failed to reopen task (${key})`, err);
        }
      }
      return tracker.task;
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
      tracker.task = response.task;
      emit('tasks:external-upsert', tracker.task);
      tasksFetchPromise = null;
    } catch (err) {
      console.error(`[lender-task] failed to create task (${key})`, err);
    }

    return tracker.task;
  })();

  try {
    return await tracker.ensuring;
  } finally {
    tracker.ensuring = null;
  }
}

async function completeAutoTaskIfNeeded(contactId, key) {
  const tracker = getTaskTracker(key);
  if (!tracker) return null;
  if (tracker.completing) return tracker.completing;

  if (!tracker.task && !tracker.lookedUp && contactId) {
    const tasks = await fetchTasksForContact(contactId);
    assignExistingTasks(tasks);
    tracker.lookedUp = true;
  }

  if (!tracker.task) return null;

  const status = String(tracker.task.status || '').trim().toLowerCase();
  if (status === COMPLETED_STATUS) return tracker.task;

  tracker.completing = (async () => {
    try {
      const response = await updateTask(tracker.task._id, { status: STATUS_COMPLETED });
      tracker.task = response.task;
      emit('tasks:external-upsert', tracker.task);
      tasksFetchPromise = null;
    } catch (err) {
      console.error(`[lender-task] failed to complete task (${key})`, err);
    }
    return tracker.task;
  })();

  try {
    return await tracker.completing;
  } finally {
    tracker.completing = null;
  }
}

export function evaluateLenderHighlight() {
  const state = getState();
  const contactId = state?.contactId || null;

  resetTaskState(contactId);
  observeLenderList();

  const {
    highlightInput,
    highlightPrimary,
    missingInviteIds,
    missingApprovedIds,
    highlightCommunity
  } = resolveHighlightState(state);

  applyHighlight({
    highlightInput,
    highlightPrimary,
    missingInviteIds,
    missingApprovedIds,
    highlightCommunity
  });

  if (!contactId) return;

  const needsPrimaryTask = highlightInput || highlightPrimary;
  if (needsPrimaryTask) {
    ensureAutoTask(contactId, 'primary');
  } else {
    completeAutoTaskIfNeeded(contactId, 'primary');
  }

  const needsInviteTask = missingInviteIds.length > 0;
  if (needsInviteTask) {
    ensureAutoTask(contactId, 'invite');
  } else {
    completeAutoTaskIfNeeded(contactId, 'invite');
  }

  const needsCommunityTask = highlightCommunity;
  if (needsCommunityTask) {
    ensureAutoTask(contactId, 'community');
  } else {
    completeAutoTaskIfNeeded(contactId, 'community');
  }
}

export function initLenderLinkAutomation() {
  on('state:contact', evaluateLenderHighlight);
  on('init:done', () => {
    requestAnimationFrame(evaluateLenderHighlight);
  });

  const communitySelect = getCommunitySelect();
  if (communitySelect) {
    communitySelect.addEventListener('change', () => evaluateLenderHighlight());
  }

  observeLenderList();
}
