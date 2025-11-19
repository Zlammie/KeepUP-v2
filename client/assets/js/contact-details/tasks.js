import { getContact, setContact } from './state.js';
import {
  assignFollowUpSchedule,
  createTask,
  fetchFollowUpSchedules,
  fetchTasks,
  unassignFollowUpSchedule,
  updateTask
} from './api.js';
import { on } from './events.js';

const TASK_TYPES = [
  'Follow-Up',
  'Call',
  'Email',
  'Meeting',
  'Reminder',
  'Document',
  'Approval',
  'Review',
  'Data Fix',
  'System Suggestion',
  'Admin',
  'Custom'
];

const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const TASK_STATUSES = ['Pending', 'In Progress', 'Completed', 'Overdue'];

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

const CHANNEL_TASK_TYPE_MAP = new Map([
  ['SMS', 'Follow-Up'],
  ['TEXT', 'Follow-Up'],
  ['MESSAGE', 'Follow-Up'],
  ['EMAIL', 'Email'],
  ['CALL', 'Call'],
  ['PHONE', 'Call'],
  ['MEETING', 'Meeting'],
  ['REMINDER', 'Reminder'],
  ['TASK', 'Follow-Up'],
  ['NOTE', 'Note']
]);

const taskState = {
  items: [],
  filter: 'all'
};

let taskPanelInstance = null;

const normalizeObjectId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return (
      value._id ||
      value.id ||
      value.$id ||
      (typeof value.toString === 'function' ? value.toString() : null)
    );
  }
  return null;
};

const buildLenderOptions = (contact) => {
  if (!contact) return [];
  const lenders = Array.isArray(contact.lenders) ? contact.lenders : [];
  return lenders
    .map((entry) => {
      const lenderRef = entry?.lender || entry?.lenderId || entry?.lenderRef;
      const id = normalizeObjectId(lenderRef) || normalizeObjectId(entry?.lender);
      if (!id) return null;
      const first = lenderRef?.firstName || entry?.firstName || '';
      const last = lenderRef?.lastName || entry?.lastName || '';
      const company = lenderRef?.lenderBrokerage || lenderRef?.company || '';
      const name = [first, last].filter(Boolean).join(' ').trim() || company || 'Lender';
      return { id: String(id), name, isPrimary: Boolean(entry?.isPrimary) };
    })
    .filter(Boolean);
};

const normalizeExternalLenderOptions = (options) => {
  if (!Array.isArray(options)) return [];
  return options
    .map((entry) => {
      if (!entry) return null;
      const id = normalizeObjectId(entry.id || entry._id || entry.value || entry.lenderId);
      if (!id) return null;
      const name = entry.name || entry.label || 'Lender';
      return { id: String(id), name, isPrimary: Boolean(entry.isPrimary) };
    })
    .filter(Boolean);
};

function normalizeTask(raw, fallbackModel = 'Contact') {
  if (!raw) return null;
  const fallbackDate = new Date().toISOString();
  return {
    _id: String(raw._id),
    title: raw.title || '',
    description: raw.description || '',
    type: raw.type || 'Follow-Up',
    status: raw.status || 'Pending',
    priority: raw.priority || 'Medium',
    category: raw.category || 'Communication',
    dueDate: raw.dueDate || null,
    reminderAt: raw.reminderAt || null,
    assignments: Array.isArray(raw.assignments)
      ? raw.assignments.map((assignment) => ({
          target: assignment.target,
          status: assignment.status || 'Pending',
          refId: assignment.refId ? String(assignment.refId) : null
        }))
      : [],
    completedAt: raw.completedAt || null,
    linkedModel: raw.linkedModel || fallbackModel,
    linkedId: raw.linkedId ? String(raw.linkedId) : null,
    assignedTo: raw.assignedTo ? String(raw.assignedTo) : null,
    createdBy: raw.createdBy ? String(raw.createdBy) : null,
    createdAt: raw.createdAt || fallbackDate,
    updatedAt: raw.updatedAt || raw.createdAt || fallbackDate
  };
}

function findTaskById(taskId) {
  return taskState.items.find((task) => task._id === taskId) || null;
}

function replaceTask(updatedTask) {
  if (!updatedTask) return;
  const index = taskState.items.findIndex((task) => task._id === updatedTask._id);
  if (index >= 0) {
    taskState.items[index] = updatedTask;
  } else {
    taskState.items.unshift(updatedTask);
  }
}

function formatDueDate(task) {
  if ((task?.status || '').toLowerCase() === 'completed') {
    if (task?.completedAt) {
      const completed = new Date(task.completedAt);
      if (!Number.isNaN(completed.getTime())) {
        return `Completed ${DATE_FORMAT.format(completed)}`;
      }
    }
    return 'Completed';
  }

  if (!task?.dueDate) return 'No due date';
  const parsed = new Date(task.dueDate);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return `Due ${DATE_FORMAT.format(parsed)}`;
}

function isOverdue(task) {
  if (!task?.dueDate) return false;
  if ((task.status || '').toLowerCase() === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate);
  return !Number.isNaN(due.getTime()) && due < today;
}

function toDateInputValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 10);
}

function toTimeInputValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildReminderIso(dateValue, timeValue) {
  if (!dateValue) return null;
  const trimmedDate = dateValue.trim();
  if (!trimmedDate) return null;
  const trimmedTime = (timeValue || '').trim();
  const fallbackTime = trimmedTime || '09:00';
  const candidate = new Date(`${trimmedDate}T${fallbackTime}`);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString();
}

function updateCounts(panel, countEl, filterButtons) {
  const total = taskState.items.length;
  if (countEl) countEl.textContent = String(total);

  const counts = taskState.items.reduce((acc, task) => {
    const key = task.status || 'Pending';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  filterButtons.forEach((btn) => {
    const filter = btn.dataset.filter;
    const pillCount = btn.querySelector('.pill-count');
    if (!pillCount) return;

    let value = total;
    if (filter && filter !== 'all') {
      value = counts[filter] || 0;
    }
    pillCount.textContent = String(value);
  });

  if (panel) {
    panel.dataset.taskCount = String(total);
  }
}

function renderTasks(listEl, emptyState, currentUserId, handlers = {}) {
  if (!listEl || !emptyState) return;
  const { onOpenTask, onToggleComplete } = handlers;

  listEl.querySelectorAll('.todo-item').forEach((node) => node.remove());

  const filtered =
    taskState.filter === 'all'
      ? taskState.items
      : taskState.items.filter((task) => task.status === taskState.filter);

  if (!filtered.length) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const getSortTimestamp = (task) => {
    if (!task) return Number.MAX_SAFE_INTEGER;
    const due = task.dueDate ? new Date(task.dueDate) : null;
    if (due && !Number.isNaN(due.getTime())) {
      return due.getTime();
    }
    const created = task.createdAt ? new Date(task.createdAt) : null;
    if (created && !Number.isNaN(created.getTime())) {
      return created.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  };

  const sorted = filtered.slice().sort((a, b) => getSortTimestamp(a) - getSortTimestamp(b));

  sorted.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'todo-item';
    item.dataset.taskId = task._id;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Open task "${task.title || 'Task'}"`);

    const isCompleted = (task.status || '').toLowerCase() === 'completed';
    if (isCompleted) item.classList.add('is-completed');

    const header = document.createElement('div');
    header.className = 'todo-item-header';

    const headerMain = document.createElement('div');
    headerMain.className = 'todo-item-header-main';

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'todo-item-complete';
    completeBtn.dataset.taskId = task._id;
    completeBtn.setAttribute(
      'aria-label',
      isCompleted ? 'Mark task as pending' : 'Mark task as completed'
    );
    completeBtn.setAttribute('aria-pressed', isCompleted ? 'true' : 'false');
    completeBtn.title = isCompleted ? 'Reopen task' : 'Complete task';
    if (isCompleted) completeBtn.classList.add('is-completed');

    const completeIcon = document.createElement('span');
    completeIcon.className = 'todo-item-complete-icon';
    completeIcon.setAttribute('aria-hidden', 'true');
    completeIcon.innerHTML = '&#10003;';
    completeBtn.append(completeIcon);

    headerMain.append(completeBtn);

    const typeEl = document.createElement('span');
    typeEl.className = 'todo-item-type';
    typeEl.textContent = task.type;
    headerMain.append(typeEl);

    header.append(headerMain);

    const statusEl = document.createElement('span');
    statusEl.className = 'todo-item-status';
    statusEl.textContent = task.status;
    if (isCompleted) statusEl.classList.add('is-completed');
    header.append(statusEl);

    item.append(header);

    const titleEl = document.createElement('div');
    titleEl.className = 'todo-item-title';
    titleEl.textContent = task.title;
    item.append(titleEl);

    if (task.description) {
      const notes = document.createElement('p');
      notes.className = 'todo-item-notes';
      notes.textContent = task.description;
      item.append(notes);
    }

    const footer = document.createElement('div');
    footer.className = 'todo-item-footer';

    const dueEl = document.createElement('span');
    dueEl.className = 'todo-item-due';
    if (isCompleted) {
      dueEl.classList.add('completed');
    } else if (isOverdue(task)) {
      dueEl.classList.add('overdue');
    }
    dueEl.textContent = formatDueDate(task);
    footer.append(dueEl);

    if (task.priority) {
      const priorityEl = document.createElement('span');
      priorityEl.className = `todo-item-priority priority-${task.priority.toLowerCase()}`;
      priorityEl.textContent = `Priority: ${task.priority}`;
      footer.append(priorityEl);
    }

    const assignee = document.createElement('span');
    assignee.className = 'todo-item-assignee';
    assignee.textContent = currentUserId ? 'Assigned to you' : 'Assigned';
    footer.append(assignee);

    item.append(footer);

    if (Array.isArray(task.assignments) && task.assignments.length) {
      const assignmentsWrapper = document.createElement('div');
      assignmentsWrapper.className = 'todo-assignment-chips';
      assignmentsWrapper.dataset.taskId = task._id;

      const completedCount = task.assignments.filter(
        (assignment) => (assignment.status || '').toLowerCase() === 'completed'
      ).length;
      if (task.assignments.length > 1) {
        const progress = document.createElement('span');
        progress.className = 'todo-assignment-progress';
        progress.textContent = `${completedCount}/${task.assignments.length} complete`;
        assignmentsWrapper.append(progress);
      }

      task.assignments.forEach((assignment) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'todo-assignment-chip';
        chip.dataset.assignmentTarget = assignment.target;
        if (assignment.refId) chip.dataset.assignmentRef = String(assignment.refId);
        const isComplete = (assignment.status || '').toLowerCase() === 'completed';
        if (isComplete) chip.classList.add('is-complete');
        const label =
          assignment.target === 'realtor'
            ? 'Realtor'
            : assignment.target === 'lender'
              ? 'Lender'
              : 'Contact';
        chip.textContent = label;
        assignmentsWrapper.append(chip);
      });

      item.append(assignmentsWrapper);
    }

    if (typeof onToggleComplete === 'function') {
      completeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleComplete(task, completeBtn);
      });
    }

    if (typeof onOpenTask === 'function') {
      const open = () => onOpenTask(task);
      item.addEventListener('click', (event) => {
        if (event.target.closest('.todo-item-complete')) return;
        open();
      });
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    }

    listEl.append(item);
  });
}

function buildDefaultTitle() {
  const contact = getContact();
  if (!contact) return 'Follow up with this contact';
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return name ? `Follow up with ${name}` : 'Follow up with this contact';
}

function populateSelectOptions(select, options) {
  if (!select || !Array.isArray(options)) return;
  if (select.options.length > 0) return;
  options.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function createTaskPanel({
  contactId = null,
  currentUserId = null,
  linkedModel = 'Contact',
  linkedId = null,
  defaultTitleBuilder = null,
  defaultAssignmentTarget = 'contact',
  lenderOptions = null
} = {}) {
  const panel = document.getElementById('todo-panel');
  if (!panel) {
    return {
      setContext() {}
    };
  }

  const toggle = panel.querySelector('#todo-toggle');
  const addBtn = panel.querySelector('#todo-add');
  const listEl = panel.querySelector('#todo-list');
  const emptyState = listEl?.querySelector('.todo-empty') || null;
  const countEl = panel.querySelector('#todo-count');
  const filterButtons = Array.from(panel.querySelectorAll('.todo-pill'));
  const followupAutomation = {
    section: panel.querySelector('[data-followup-schedule]') || null,
    select: panel.querySelector('[data-followup-select]') || null,
    apply: panel.querySelector('[data-followup-apply]') || null,
    status: panel.querySelector('[data-followup-status]') || null,
    active: panel.querySelector('[data-followup-active]') || null,
    activeName: panel.querySelector('[data-followup-active-name]') || null,
    activeMeta: panel.querySelector('[data-followup-active-meta]') || null,
    unassign: panel.querySelector('[data-followup-unassign]') || null
  };

  if (listEl) {
    listEl.addEventListener('click', (event) => {
      const chip = event.target.closest('.todo-assignment-chip');
      if (!chip) return;
      const taskItem = chip.closest('li.todo-item');
      if (!taskItem) return;
      const taskId = taskItem.dataset.taskId;
      if (!taskId) return;
      const target = chip.dataset.assignmentTarget;
      const refId = chip.dataset.assignmentRef || null;
      event.preventDefault();
      event.stopPropagation();
      toggleAssignmentStatusById(taskId, target, refId);
    });
  }

  const followupState = {
    schedules: [],
    loading: false
  };

  const viewerUserId = currentUserId ? String(currentUserId) : null;

  let contextContactId = contactId ?? null;
  let contextLinkedId = linkedId ?? null;
  let contextLinkedModel = linkedModel || 'Contact';
  let contextDefaultTitleBuilder =
    typeof defaultTitleBuilder === 'function' ? defaultTitleBuilder : null;
  let contextAssignmentTarget =
    typeof defaultAssignmentTarget === 'string' && defaultAssignmentTarget
      ? defaultAssignmentTarget.toLowerCase()
      : 'contact';
  let contextLenderOptions = normalizeExternalLenderOptions(lenderOptions);

  const resolveLinkedId = () => contextLinkedId ?? contextContactId ?? null;
  const resolveTargetModel = () => contextLinkedModel || 'Contact';
  const getDefaultTitle = () =>
    (typeof contextDefaultTitleBuilder === 'function'
      ? contextDefaultTitleBuilder()
      : buildDefaultTitle());
  const updatePanelAvailability = (enabled) => {
    panel.classList.toggle('is-disabled', !enabled);
    if (addBtn) {
      addBtn.disabled = !enabled;
      addBtn.setAttribute('aria-disabled', String(!enabled));
    }
  };

  const modalRoot = document.getElementById('task-modal');
  const modal = {
    root: modalRoot,
    form: modalRoot?.querySelector('#task-modal-form') || null,
    heading: modalRoot?.querySelector('#task-modal-title') || null,
    title: modalRoot?.querySelector('#task-modal-title-input') || null,
    due: modalRoot?.querySelector('#task-modal-due') || null,
    reminderDate: modalRoot?.querySelector('#task-modal-reminder-date') || null,
    reminderTime: modalRoot?.querySelector('#task-modal-reminder-time') || null,
    priority: modalRoot?.querySelector('#task-modal-priority') || null,
    status: modalRoot?.querySelector('#task-modal-status') || null,
    notes: modalRoot?.querySelector('#task-modal-notes') || null,
    complete: modalRoot?.querySelector('#task-modal-complete') || null,
    save: modalRoot?.querySelector('#task-modal-save') || null,
    cancel: modalRoot?.querySelector('#task-modal-cancel') || null,
    close: modalRoot?.querySelector('#task-modal-close') || null,
    backdrop: modalRoot?.querySelector('[data-task-modal-close]') || null,
    error: modalRoot?.querySelector('#task-modal-error') || null,
    assignContact: modalRoot?.querySelector('#task-assign-contact') || null,
    assignRealtor: modalRoot?.querySelector('#task-assign-realtor') || null,
    assignLender: modalRoot?.querySelector('#task-assign-lender') || null,
    lenderSelect: modalRoot?.querySelector('#task-lender-select') || null,
    assigneeGroup: modalRoot?.querySelector('#task-assignee-options') || null,
    assigneeContactWrap:
      modalRoot?.querySelector('#task-assign-contact')?.closest('.task-modal__assignee') || null,
    assigneeRealtorWrap: modalRoot?.querySelector('#task-assignee-realtor') || null,
    assigneeLenderWrap: modalRoot?.querySelector('#task-assignee-lender') || null
  };

  let activeTaskId = null;
  let modalMode = 'edit';
  let modalSubmitting = false;
  let previousOverflow = '';
  let escapeHandlerBound = false;
  let lastFocusedElement = null;
  let latestContact = getContact();

  populateSelectOptions(modal.priority, TASK_PRIORITIES);
  populateSelectOptions(modal.status, TASK_STATUSES);

  const BASE_TYPES = ['Follow-Up', 'Document', 'Approval', 'Review', 'Custom'];
  const FOLLOWUP_TYPES = new Set(['Follow-Up', 'Call', 'Email', 'Meeting']);
  const ALLOWED_TYPES = new Set([...BASE_TYPES, ...FOLLOWUP_TYPES]);

  const defaultType = ALLOWED_TYPES.has('Follow-Up') ? 'Follow-Up' : BASE_TYPES[0];
  const defaultPriority = TASK_PRIORITIES.includes('Medium') ? 'Medium' : TASK_PRIORITIES[0];
  const defaultStatus = TASK_STATUSES.includes('Pending') ? 'Pending' : TASK_STATUSES[0];

  const typeGroup = modalRoot?.querySelector('#task-type-buttons') || null;
  const typeButtons = typeGroup ? Array.from(typeGroup.querySelectorAll('button[data-type]')) : [];
  const followupGroup = modalRoot?.querySelector('#task-followup-sub') || null;
  const followupButtons = followupGroup ? Array.from(followupGroup.querySelectorAll('button[data-followup]')) : [];

  let baseType = FOLLOWUP_TYPES.has(defaultType) ? 'Follow-Up' : defaultType;
  let selectedFollowupType = FOLLOWUP_TYPES.has(defaultType) ? defaultType : 'Follow-Up';
  let selectedType = defaultType;

  const updateTypeButtons = () => {
    typeButtons.forEach((btn) => {
      const btnType = btn.dataset.type;
      const isSelected =
        btnType === 'Follow-Up' ? baseType === 'Follow-Up' : btnType === selectedType;
      btn.classList.toggle('is-selected', Boolean(isSelected));
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    if (followupGroup) {
      const show = baseType === 'Follow-Up';
      followupGroup.hidden = !show;
      followupGroup.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    followupButtons.forEach((btn) => {
      const followType = btn.dataset.followup;
      const isSelected = followType === selectedFollowupType;
      btn.classList.toggle('is-selected', Boolean(isSelected));
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  };

  const selectFollowupType = (next) => {
    const normalized = FOLLOWUP_TYPES.has(next) ? next : 'Follow-Up';
    selectedFollowupType = normalized;
    selectedType = normalized;
    baseType = 'Follow-Up';
    updateTypeButtons();
  };

  const selectBaseType = (next) => {
    const normalized = BASE_TYPES.includes(next) ? next : 'Custom';
    baseType = normalized;
    if (baseType === 'Follow-Up') {
      if (!FOLLOWUP_TYPES.has(selectedFollowupType)) selectedFollowupType = 'Follow-Up';
      selectedType = selectedFollowupType;
    } else {
      selectedType = normalized;
    }
    updateTypeButtons();
  };

  updateTypeButtons();

  const setAutomationStatus = (message, variant = 'muted') => {
    const statusNode = followupAutomation.status;
    if (!statusNode) return;
    if (!message) {
      statusNode.textContent = '';
      statusNode.hidden = true;
      statusNode.removeAttribute('data-variant');
      return;
    }
    statusNode.textContent = message;
    statusNode.hidden = false;
    if (variant && variant !== 'muted') {
      statusNode.dataset.variant = variant;
    } else {
      statusNode.removeAttribute('data-variant');
    }
  };

  const formatAssignedMeta = (assignment) => {
    if (!assignment?.appliedAt) return '';
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    try {
      const when = new Date(assignment.appliedAt);
      if (Number.isNaN(when.getTime())) return '';
      return `Assigned ${formatter.format(when)}`;
    } catch (_) {
      return '';
    }
  };

  const updateFollowupAssignmentUI = () => {
    const { active, activeName, activeMeta, unassign } = followupAutomation;
    if (!active) return;
    const assignment = getContact()?.followUpSchedule || null;
    if (!assignment) {
      active.hidden = true;
      if (activeName) activeName.textContent = '';
      if (activeMeta) activeMeta.textContent = '';
      if (unassign) unassign.disabled = true;
      return;
    }
    active.hidden = false;
    if (activeName) {
      activeName.textContent = assignment.scheduleName || 'Saved schedule';
    }
    if (activeMeta) {
      activeMeta.textContent = formatAssignedMeta(assignment);
    }
    if (unassign) unassign.disabled = false;
  };

  const handleContactUpdate = (contact) => {
    latestContact = contact || getContact();
    updateFollowupAssignmentUI();
    if (modalMode === 'create') {
      const modalOpen = Boolean(modal.root && modal.root.classList.contains('is-open'));
      prepareAssigneeControls(latestContact, true, { resetSelections: !modalOpen });
      if (modalOpen) {
        applyAssignmentSelection(contextAssignmentTarget);
      }
    }
  };

  updateFollowupAssignmentUI();
  on('state:contact', handleContactUpdate);
  prepareAssigneeControls(latestContact, true, { resetSelections: true });
  refreshLenderSelectState();

  const renderScheduleOptions = () => {
    const select = followupAutomation.select;
    if (!select) return;
    select.innerHTML = '';

    if (followupState.loading) {
      const loadingOption = document.createElement('option');
      loadingOption.value = '';
      loadingOption.textContent = 'Loading schedules...';
      select.append(loadingOption);
      select.disabled = true;
      if (followupAutomation.apply) followupAutomation.apply.disabled = true;
      return;
    }

    if (!followupState.schedules.length) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'No follow-up schedules';
      select.append(emptyOption);
      select.disabled = true;
      if (followupAutomation.apply) followupAutomation.apply.disabled = true;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a schedule';
    select.append(placeholder);

    followupState.schedules.forEach((schedule) => {
      const option = document.createElement('option');
      const scheduleId = schedule._id || schedule.id;
      option.value = scheduleId;
      const touches = Array.isArray(schedule.steps) ? schedule.steps.length : 0;
      const statusNote =
        schedule.status && schedule.status !== 'ACTIVE'
          ? ` • ${schedule.status.charAt(0)}${schedule.status.slice(1).toLowerCase()}`
          : '';
      option.textContent = touches
        ? `${schedule.name} (${touches})${statusNote}`
        : `${schedule.name}${statusNote}`;
      select.append(option);
    });

    select.disabled = false;
    if (followupAutomation.apply) followupAutomation.apply.disabled = true;
  };

  const loadFollowupSchedules = async () => {
    if (!followupAutomation.section) return;
    followupState.loading = true;
    renderScheduleOptions();
    setAutomationStatus('Loading follow-up schedules...', 'muted');
    try {
      const response = await fetchFollowUpSchedules();
      const items = Array.isArray(response?.schedules) ? response.schedules : [];
      const sanitized = items
        .filter((item) => item && Array.isArray(item.steps) && item.steps.length)
        .map((item) => ({
          ...item,
          _id: item._id || item.id,
          status: (item.status || '').toUpperCase(),
          createdBy: item.createdBy ? String(item.createdBy) : null
        }));

      const matchesViewer = (schedule) => {
        if (!viewerUserId) return true;
        const createdById = schedule.createdBy ? String(schedule.createdBy) : null;
        return !createdById || createdById === viewerUserId;
      };

      const statusOrder = { ACTIVE: 0, PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 };
      const accessible = sanitized.filter(matchesViewer);

      followupState.schedules = accessible.sort((a, b) => {
        const wA = statusOrder[a.status] ?? 10;
        const wB = statusOrder[b.status] ?? 10;
        if (wA !== wB) return wA - wB;
        return (a.name || '').localeCompare(b.name || '');
      });

      if (!followupState.schedules.length) {
        const hasAnySchedules = sanitized.length > 0;
        if (viewerUserId && hasAnySchedules) {
          setAutomationStatus('You will see your saved schedules here once you create one from the Task page.', 'muted');
        } else {
          setAutomationStatus('No follow-up schedules found. Build one from the Task page.', 'muted');
        }
      } else {
        setAutomationStatus('Pick a cadence to auto-create the next tasks.', 'muted');
      }
    } catch (err) {
      console.error('[tasks] failed to load follow-up schedules', err);
      followupState.schedules = [];
      setAutomationStatus('Unable to load follow-up schedules right now.', 'error');
    } finally {
      followupState.loading = false;
      renderScheduleOptions();
    }
  };

  const applySelectedSchedule = async () => {
    if (!followupAutomation.select || !followupAutomation.apply) return;
    const scheduleId = followupAutomation.select.value;
    if (!scheduleId) {
      setAutomationStatus('Choose a schedule to assign.', 'error');
      followupAutomation.select.focus();
      return;
    }

    const schedule = followupState.schedules.find(
      (item) => String(item._id || item.id) === String(scheduleId)
    );
    if (!schedule) {
      setAutomationStatus('The selected schedule is no longer available. Refresh and try again.', 'error');
      return;
    }

    const steps = Array.isArray(schedule.steps) ? schedule.steps.slice() : [];
    if (!steps.length) {
      setAutomationStatus('Selected schedule has no steps to apply.', 'error');
      return;
    }

    const linkedId = resolveLinkedId();
    if (!linkedId) {
      setAutomationStatus('Save the contact before applying a schedule.', 'error');
      return;
    }

    const sortedSteps = steps.sort((a, b) => {
      const orderA = Number.isFinite(a?.order) ? a.order : Number(a?.dayOffset ?? 0);
      const orderB = Number.isFinite(b?.order) ? b.order : Number(b?.dayOffset ?? 0);
      return orderA - orderB;
    });

    const button = followupAutomation.apply;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Assigning...';

    const contact = getContact();
    const ownerId = resolveOwnerId(contact);
    const scheduleKey = schedule._id || schedule.id;
    const runId = Date.now().toString(36);
    const reasonPrefix = buildFollowupReasonPrefix(linkedId, scheduleKey, runId);
    setAutomationStatus(`Applying "${schedule.name}" to this contact...`, 'muted');

    try {
      for (let index = 0; index < sortedSteps.length; index += 1) {
        const step = sortedSteps[index];
        const instructions =
          typeof step?.instructions === 'string' ? step.instructions.trim() : '';
        const payload = {
          title:
            typeof step?.title === 'string' && step.title.trim()
              ? step.title.trim()
              : `${schedule.name} - Touchpoint ${index + 1}`,
          linkedModel: resolveTargetModel(),
          linkedId,
          type: mapChannelToTaskType(step?.channel),
          priority: defaultPriority,
          status: defaultStatus,
          dueDate: computeDueDateIso(step?.dayOffset ?? index),
          autoCreated: true,
          reason: buildFollowupReason(
            linkedId,
            scheduleKey,
            step?.stepId || step?._id || step?.id || index,
            runId
          )
        };
        if (instructions) {
          payload.description = instructions;
        }
        if (ownerId) {
          payload.assignedTo = ownerId;
        }
        const response = await createTask(payload);
        const normalized = normalizeTask(response.task, resolveTargetModel());
        replaceTask(normalized);
      }

      refresh();
      followupAutomation.select.value = '';
      setAutomationStatus(`Applied "${schedule.name}". Tasks were added below.`, 'success');
      if (contextContactId) {
        try {
          const response = await assignFollowUpSchedule(contextContactId, scheduleKey, {
            reasonPrefix
          });
          const assignment = response?.followUpSchedule || {
            scheduleId: schedule._id || schedule.id,
            scheduleName: schedule.name,
            appliedAt: new Date().toISOString(),
            appliedBy: viewerUserId
          };
          setContact({ followUpSchedule: assignment });
          updateFollowupAssignmentUI();
        } catch (assignErr) {
          console.error('[tasks] failed to record schedule assignment', assignErr);
          setAutomationStatus(
            'Tasks were created, but we could not mark the schedule as assigned.',
            'error'
          );
        }
      }
    } catch (err) {
      console.error('[tasks] failed to apply follow-up schedule', err);
      setAutomationStatus(err?.message || 'Unable to apply that schedule. Try again.', 'error');
    } finally {
      button.textContent = originalLabel;
      const hasSelection = Boolean(followupAutomation.select?.value);
      button.disabled = !hasSelection;
    }
  };

  const refresh = () => {
    updateCounts(panel, countEl, filterButtons);
    renderTasks(listEl, emptyState, currentUserId, {
      onOpenTask: (task) => openTaskModal(task._id),
      onToggleComplete: handleQuickComplete
    });
  };

  on('tasks:external-upsert', (task) => {
    const normalized = normalizeTask(task, resolveTargetModel());
    if (!normalized) return;
    const currentId = resolveLinkedId();
    if (currentId) {
      const normalizedId = normalized.linkedId ? String(normalized.linkedId) : null;
      if (!normalizedId || normalizedId !== String(currentId)) return;
    }
    replaceTask(normalized);
    refresh();
  });

  const setFilterActive = (targetFilter) => {
    filterButtons.forEach((button) => {
      const filter = button.dataset.filter || 'all';
      button.classList.toggle('is-active', filter === targetFilter);
    });
  };

  setFilterActive(taskState.filter);

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const nextType = btn.dataset.type;
      if (!nextType) return;
      selectBaseType(nextType);
    });
  });

  followupButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const nextFollowup = btn.dataset.followup;
      if (!nextFollowup) return;
      selectFollowupType(nextFollowup);
    });
  });

  modal.assignLender?.addEventListener('change', () => refreshLenderSelectState());

  followupAutomation.select?.addEventListener('change', () => {
    if (followupAutomation.apply) {
      followupAutomation.apply.disabled = !followupAutomation.select.value;
    }
    if (!followupAutomation.select.value) {
      setAutomationStatus('Pick a cadence to auto-create the next tasks.', 'muted');
    }
  });

  followupAutomation.apply?.addEventListener('click', (event) => {
    event.preventDefault();
    applySelectedSchedule();
  });

  followupAutomation.unassign?.addEventListener('click', (event) => {
    event.preventDefault();
    handleUnassignSchedule();
  });

  const applyModalMode = (mode) => {
    modalMode = mode === 'create' ? 'create' : 'edit';
    const isCreate = modalMode === 'create';
    if (modal.heading) modal.heading.textContent = isCreate ? 'Add Task' : 'Edit Task';
    if (modal.save) modal.save.textContent = isCreate ? 'Create Task' : 'Save Changes';
    if (modal.complete) {
      modal.complete.classList.toggle('is-hidden', isCreate);
      modal.complete.setAttribute('aria-hidden', isCreate ? 'true' : 'false');
      if (isCreate) {
        modal.complete.setAttribute('aria-pressed', 'false');
      }
      modal.complete.disabled = Boolean(isCreate);
    }
  };

  const clearModalError = () => {
    if (!modal.error) return;
    modal.error.hidden = true;
    modal.error.textContent = '';
  };

  const showModalError = (message) => {
    if (!modal.error) return;
    modal.error.hidden = false;
    modal.error.textContent = message || 'Something went wrong. Please try again.';
  };

  const setModalLoading = (isLoading) => {
    modalSubmitting = isLoading;
    const targets = [modal.save, modal.complete];
    targets
      .filter((btn) => !!btn)
      .forEach((btn) => {
        if (btn === modal.complete && modalMode === 'create' && !isLoading) {
          btn.disabled = true;
        } else {
          btn.disabled = Boolean(isLoading);
        }
      });
  };

  const updateCompleteButton = (status) => {
    if (!modal.complete) return;
    const isCompleted = (status || '').toLowerCase() === 'completed';
    modal.complete.textContent = isCompleted ? 'Mark as Pending' : 'Mark as Completed';
    modal.complete.dataset.targetStatus = isCompleted ? 'Pending' : 'Completed';
    modal.complete.setAttribute('aria-pressed', isCompleted ? 'true' : 'false');
  };

  function populateLenderSelect(contact) {
    if (!modal.lenderSelect) return [];
    let options = contextContactId ? buildLenderOptions(contact) : [];
    if (!options.length && contextLenderOptions.length) {
      options = contextLenderOptions.map((opt) => ({ ...opt }));
    }
    modal.lenderSelect.innerHTML = '';
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.name;
      modal.lenderSelect.append(option);
    });
    if (options.length) {
      const primary = options.find((opt) => opt.isPrimary) || options[0];
      modal.lenderSelect.value = primary.id;
    }
    modal.lenderSelect.disabled = !options.length || !(modal.assignLender?.checked);
    return options;
  }

  function toggleAssigneeWrap(wrap, enabled) {
    if (!wrap) return;
    wrap.classList.toggle('is-disabled', !enabled);
  }

  function prepareAssigneeControls(contact, isCreateMode, { resetSelections = true } = {}) {
    if (!modal.assigneeGroup) return;
    const realtorFromContact = contextContactId ? normalizeObjectId(contact?.realtorId) : null;
    const realtorFromContext =
      !contextContactId && contextLinkedModel === 'Realtor'
        ? normalizeObjectId(contextLinkedId)
        : null;
    const realtorId = realtorFromContact || realtorFromContext;

    if (!isCreateMode) {
      modal.assigneeGroup.classList.add('is-disabled');
      if (modal.assignContact) {
        modal.assignContact.checked = true;
        modal.assignContact.disabled = true;
      }
      if (modal.assignRealtor) {
        modal.assignRealtor.checked = false;
        modal.assignRealtor.disabled = true;
      }
      if (modal.assignLender) {
        modal.assignLender.checked = false;
        modal.assignLender.disabled = true;
      }
      if (modal.lenderSelect) {
        modal.lenderSelect.innerHTML = '';
        modal.lenderSelect.disabled = true;
      }
      toggleAssigneeWrap(modal.assigneeRealtorWrap, false);
      toggleAssigneeWrap(modal.assigneeLenderWrap, false);
      return;
    }

    modal.assigneeGroup.classList.remove('is-disabled');
    const contactAssignable = Boolean(contextContactId);
    if (modal.assignContact) {
      modal.assignContact.disabled = !contactAssignable;
      if (resetSelections) {
        modal.assignContact.checked = contactAssignable;
      } else if (!contactAssignable) {
        modal.assignContact.checked = false;
      }
    }
    toggleAssigneeWrap(modal.assigneeContactWrap, contactAssignable);

    const hasRealtor = Boolean(realtorId);
    if (modal.assignRealtor) {
      modal.assignRealtor.disabled = !hasRealtor;
      if (!hasRealtor && resetSelections) {
        modal.assignRealtor.checked = false;
      } else if (!contactAssignable && hasRealtor && resetSelections) {
        modal.assignRealtor.checked = true;
      }
      toggleAssigneeWrap(modal.assigneeRealtorWrap, hasRealtor);
    }

    const lenderOptions = populateLenderSelect(contact);
    const hasLender = lenderOptions.length > 0;
    if (modal.assignLender) {
      modal.assignLender.disabled = !hasLender;
      if (!hasLender && resetSelections) {
        modal.assignLender.checked = false;
      } else if (!contactAssignable && hasLender && resetSelections) {
        modal.assignLender.checked = true;
      }
      toggleAssigneeWrap(modal.assigneeLenderWrap, hasLender);
    }
    refreshLenderSelectState();
  }

  function applyAssignmentSelection(target) {
    const normalized = typeof target === 'string' ? target.toLowerCase() : 'contact';
    const contactEnabled = modal.assignContact && !modal.assignContact.disabled;
    const realtorEnabled = modal.assignRealtor && !modal.assignRealtor.disabled;
    const lenderEnabled = modal.assignLender && !modal.assignLender.disabled;
    let selection = 'contact';
    if (normalized === 'realtor' && realtorEnabled) {
      selection = 'realtor';
    } else if (normalized === 'lender' && lenderEnabled) {
      selection = 'lender';
    } else if (!contactEnabled && realtorEnabled) {
      selection = 'realtor';
    } else if (!contactEnabled && lenderEnabled) {
      selection = 'lender';
    }
    if (modal.assignContact) modal.assignContact.checked = selection === 'contact' && contactEnabled;
    if (modal.assignRealtor) modal.assignRealtor.checked = selection === 'realtor' && realtorEnabled;
    if (modal.assignLender) modal.assignLender.checked = selection === 'lender' && lenderEnabled;
    refreshLenderSelectState();
  }

  function refreshLenderSelectState() {
    if (!modal.lenderSelect) return;
    const enabled =
      modal.assignLender &&
      modal.assignLender.checked &&
      !modal.assignLender.disabled &&
      modal.lenderSelect.options.length > 0;
    modal.lenderSelect.disabled = !enabled;
  }

  function applyTargetSelectionFromTask(task) {
    if (modal.assignContact) modal.assignContact.checked = false;
    if (modal.assignRealtor) modal.assignRealtor.checked = false;
    if (modal.assignLender) modal.assignLender.checked = false;
    const assignmentTargets = Array.isArray(task?.assignments)
      ? new Set(task.assignments.map((assignment) => assignment.target))
      : new Set();
    if (assignmentTargets.has('contact') && modal.assignContact) {
      modal.assignContact.checked = true;
    }
    if (assignmentTargets.has('realtor') && modal.assignRealtor) {
      modal.assignRealtor.checked = true;
    }
    if (assignmentTargets.has('lender') && modal.assignLender) {
      modal.assignLender.checked = true;
      const lenderAssignment = task.assignments.find((assignment) => assignment.target === 'lender');
      if (modal.lenderSelect && lenderAssignment?.refId) {
        const exists = Array.from(modal.lenderSelect.options).some(
          (opt) => opt.value === String(lenderAssignment.refId)
        );
        if (!exists) {
          const option = document.createElement('option');
          option.value = String(lenderAssignment.refId);
          option.textContent = 'Lender';
          modal.lenderSelect.append(option);
        }
        modal.lenderSelect.value = String(lenderAssignment.refId);
      }
    }
    const model = typeof task?.linkedModel === 'string' ? task.linkedModel : 'Contact';
    const normalized = model.toLowerCase();
    const reason = typeof task?.reason === 'string' ? task.reason : '';
    const reasonMatch = reason.match(/^target:(realtor|lender)(?::(.+))?$/i);
    if (reasonMatch) {
      const [, targetType, targetId] = reasonMatch;
      const normalizedReason = targetType.toLowerCase();
      if (normalizedReason === 'realtor' && modal.assignRealtor) {
        modal.assignRealtor.checked = true;
      } else if (normalizedReason === 'lender' && modal.assignLender) {
        modal.assignLender.checked = true;
        if (modal.lenderSelect) {
          const existing = Array.from(modal.lenderSelect.options).some(
            (opt) => opt.value === String(targetId || '')
          );
          if (!existing && targetId) {
            const option = document.createElement('option');
            option.value = String(targetId);
            option.textContent = 'Lender';
            modal.lenderSelect.append(option);
          }
          if (targetId) modal.lenderSelect.value = String(targetId);
        }
      }
    } else if (normalized === 'realtor' && modal.assignRealtor) {
      modal.assignRealtor.checked = true;
    } else if (normalized === 'lender' && modal.assignLender) {
      modal.assignLender.checked = true;
    } else if (modal.assignContact) {
      modal.assignContact.checked = true;
    }
    refreshLenderSelectState();
  }

  const toggleAssignmentStatus = async (task, target, refId) => {
    if (!task) return;
    const assignments = Array.isArray(task.assignments)
      ? task.assignments.map((assignment) => ({
          target: assignment.target,
          refId: assignment.refId ? String(assignment.refId) : null,
          status: assignment.status || 'Pending'
        }))
      : [];
    if (!assignments.length) return;
    const match = assignments.find(
      (assignment) =>
        assignment.target === target &&
        String(assignment.refId || '') === String(refId || '')
    );
    if (!match) return;
    match.status = match.status === 'Completed' ? 'Pending' : 'Completed';
    const completedCount = assignments.filter((assignment) => assignment.status === 'Completed').length;
    let nextStatus = 'Pending';
    if (completedCount === assignments.length) {
      nextStatus = 'Completed';
    } else if (completedCount > 0) {
      nextStatus = 'In Progress';
    }
    try {
      const response = await updateTask(task._id, {
        assignments: assignments.map((assignment) => ({
          target: assignment.target,
          status: assignment.status,
          refId: assignment.refId || null
        })),
        status: nextStatus
      });
      const normalized = normalizeTask(response.task, resolveTargetModel());
      replaceTask(normalized);
      refresh();
    } catch (err) {
      console.error('[tasks] assignment toggle failed', err);
      window.alert('Unable to update assignment. Please try again.');
    }
  };

  const toggleAssignmentStatusById = (taskId, target, refId) => {
    const task = findTaskById(taskId);
    if (!task) return;
    toggleAssignmentStatus(task, target, refId);
  };

  const handleEscape = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTaskModal();
    }
  };

  const openTaskModal = (taskId = null) => {
    if (!modal.root || !modal.form || !modal.title) return;

    const isCreate = !taskId;
    const task = isCreate ? null : findTaskById(taskId);
    if (!isCreate && !task) return;

    activeTaskId = isCreate ? null : taskId;
    applyModalMode(isCreate ? 'create' : 'edit');

    lastFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    clearModalError();
    modal.form.reset();

    const titleValue = isCreate ? getDefaultTitle() : task?.title || '';
    if (modal.title) modal.title.value = titleValue;

    const contactData = latestContact || getContact();
    if (isCreate) {
      prepareAssigneeControls(contactData, true, { resetSelections: true });
      applyAssignmentSelection(contextAssignmentTarget);
    } else {
      prepareAssigneeControls(contactData, false, { resetSelections: false });
      applyTargetSelectionFromTask(task);
    }

    const dueValue = isCreate ? '' : toDateInputValue(task?.dueDate);
    if (modal.due) modal.due.value = dueValue;

    const reminderValue = isCreate ? '' : toDateInputValue(task?.reminderAt);
    if (modal.reminderDate) modal.reminderDate.value = reminderValue;
    const reminderTimeValue = isCreate ? '' : toTimeInputValue(task?.reminderAt);
    if (modal.reminderTime) modal.reminderTime.value = reminderTimeValue;

    const priorityValue =
      isCreate || !task?.priority || !TASK_PRIORITIES.includes(task.priority)
        ? defaultPriority
        : task.priority;
    if (modal.priority) modal.priority.value = priorityValue;

    const statusValue =
      isCreate || !task?.status || !TASK_STATUSES.includes(task.status)
        ? defaultStatus
        : task.status;
    if (modal.status) modal.status.value = statusValue;

    if (isCreate) {
      selectedFollowupType = 'Follow-Up';
      baseType = 'Follow-Up';
      selectedType = 'Follow-Up';
    } else {
      let initialType = task?.type || defaultType;
      if (!ALLOWED_TYPES.has(initialType)) initialType = 'Custom';
      if (FOLLOWUP_TYPES.has(initialType)) {
        selectedFollowupType = initialType;
        baseType = 'Follow-Up';
        selectedType = initialType;
      } else {
        baseType = initialType;
        selectedType = initialType;
      }
    }

    updateTypeButtons();

    const notesValue = isCreate ? '' : task?.description || '';
    if (modal.notes) modal.notes.value = notesValue;

    updateCompleteButton(statusValue);

    if (modal.root.hasAttribute('hidden')) modal.root.removeAttribute('hidden');
    modal.root.classList.add('is-open');
    modal.root.setAttribute('aria-hidden', 'false');

    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('task-modal-open');

    if (!escapeHandlerBound) {
      document.addEventListener('keydown', handleEscape, true);
      escapeHandlerBound = true;
    }

    setTimeout(() => {
      modal.title?.focus();
      modal.title?.select();
    }, 0);
  };

  const closeTaskModal = () => {
    if (!modal.root) return;
    clearModalError();
    activeTaskId = null;
    setModalLoading(false);

    modal.root.classList.remove('is-open');
    modal.root.setAttribute('aria-hidden', 'true');
    modal.root.setAttribute('hidden', 'true');

    document.body.style.overflow = previousOverflow || '';
    document.body.classList.remove('task-modal-open');

    if (escapeHandlerBound) {
      document.removeEventListener('keydown', handleEscape, true);
      escapeHandlerBound = false;
    }

    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  };

  const submitModalForm = async (overrideStatus) => {
    if (!modal.form || !modal.title) return;
    if (modalSubmitting) return;

    const title = modal.title.value.trim();
    if (!title) {
      showModalError('Title is required.');
      modal.title.focus();
      return;
    }

    const existingTask = activeTaskId ? findTaskById(activeTaskId) : null;

    const typeValue = ALLOWED_TYPES.has(selectedType) ? selectedType : defaultType;
    const priorityValue =
      modal.priority && TASK_PRIORITIES.includes(modal.priority.value)
        ? modal.priority.value
        : defaultPriority;
    const statusValue = (() => {
      if (overrideStatus && TASK_STATUSES.includes(overrideStatus)) return overrideStatus;
      if (modal.status && TASK_STATUSES.includes(modal.status.value)) return modal.status.value;
      return defaultStatus;
    })();
    const notesValue = modal.notes?.value?.trim() || '';
    const dueValue = modal.due?.value || '';
    const reminderDateValue = modal.reminderDate?.value || '';
    const reminderTimeValue = modal.reminderTime?.value || '';

    if (!reminderDateValue && reminderTimeValue) {
      showModalError('Select a reminder date before choosing a time.');
      modal.reminderDate?.focus();
      return;
    }

    const reminderIso = reminderDateValue
      ? buildReminderIso(reminderDateValue, reminderTimeValue)
      : null;
    if (reminderDateValue && !reminderIso) {
      showModalError('Invalid reminder date or time. Please try again.');
      modal.reminderDate?.focus();
      return;
    }
    const shouldClearReminder = Boolean(existingTask?.reminderAt) && !reminderDateValue;

    const payloadBase = {
      title,
      description: notesValue,
      dueDate: dueValue,
      type: typeValue,
      priority: priorityValue,
      status: statusValue
    };

    if (reminderDateValue && reminderIso) {
      payloadBase.reminderAt = reminderIso;
    } else if (shouldClearReminder) {
      payloadBase.reminderAt = '';
    }

    const effectiveLinkedId = resolveLinkedId();
    const targetModel = resolveTargetModel();
    const contactData = latestContact || getContact();

    clearModalError();
    if (!effectiveLinkedId) {
      showModalError('Select a record before saving tasks.');
      return;
    }

    let assignmentsPayload = null;

    if (modalMode === 'create' || !activeTaskId) {
      const selectedAssignments = [];
      if (modal.assignContact?.checked) {
        selectedAssignments.push({ target: 'contact', refId: effectiveLinkedId });
      }
      if (modal.assignRealtor?.checked) {
        let realtorId = normalizeObjectId(contactData?.realtorId);
        if (!realtorId && !contextContactId && contextLinkedModel === 'Realtor') {
          realtorId = normalizeObjectId(contextLinkedId);
        }
        if (!realtorId) {
          showModalError('This contact does not have a linked realtor.');
          return;
        }
        selectedAssignments.push({ target: 'realtor', refId: realtorId });
      }
      if (modal.assignLender?.checked) {
        const lenderId = modal.lenderSelect?.value;
        if (!lenderId) {
          showModalError('Select a lender to assign this task.');
          modal.lenderSelect?.focus();
          return;
        }
        selectedAssignments.push({ target: 'lender', refId: lenderId });
      }
      if (!selectedAssignments.length) {
        if (!contextContactId && contextLinkedModel === 'Realtor') {
          const fallbackRealtor = normalizeObjectId(contextLinkedId);
          if (fallbackRealtor) {
            selectedAssignments.push({ target: 'realtor', refId: fallbackRealtor });
          }
        } else if (!contextContactId && contextLinkedModel === 'Lender') {
          const fallbackLender = normalizeObjectId(contextLinkedId);
          if (fallbackLender) {
            selectedAssignments.push({ target: 'lender', refId: fallbackLender });
          }
        }
        if (!selectedAssignments.length) {
          showModalError('Choose at least one assignee for this task.');
          return;
        }
      }
      assignmentsPayload = selectedAssignments.map((assignment) => ({
        target: assignment.target,
        refId: assignment.refId || null,
        status: 'Pending'
      }));
    }

    if (assignmentsPayload) {
      payloadBase.assignments = assignmentsPayload;
    }

    setModalLoading(true);

    try {
      if (modalMode === 'create' || !activeTaskId) {
        const response = await createTask({
          ...payloadBase,
          linkedModel: targetModel,
          linkedId: effectiveLinkedId
        });
        const normalized = normalizeTask(response.task, targetModel);
        if (normalized) {
          taskState.items.unshift(normalized);
        }
        taskState.filter = 'all';
        setFilterActive('all');
        refresh();
        closeTaskModal();
      } else {
        const response = await updateTask(activeTaskId, payloadBase);
        const normalized = normalizeTask(response.task, targetModel);
        replaceTask(normalized);
        updateCompleteButton(normalized?.status);
        refresh();
        closeTaskModal();
      }
    } catch (err) {
      console.error('[tasks] update failed', err);
      showModalError(err?.message || 'Unable to save task. Please try again.');
      setModalLoading(false);
    }
  };

  const handleQuickComplete = async (task, button) => {
    if (!task || !button) return;
    if (button.disabled) return;

    const current = findTaskById(task._id) || task;
    if (Array.isArray(current.assignments) && current.assignments.length) {
      const preferredTarget = contextAssignmentTarget || 'contact';
      const targetAssignment =
        current.assignments.find((assignment) => assignment.target === preferredTarget) ||
        current.assignments.find((assignment) => assignment.target === 'contact') ||
        current.assignments[0];
      button.disabled = true;
      button.classList.add('is-loading');
      await toggleAssignmentStatus(
        current,
        targetAssignment.target,
        targetAssignment.refId ? String(targetAssignment.refId) : ''
      );
      button.disabled = false;
      button.classList.remove('is-loading');
      return;
    }

    const isCompleted = (current.status || '').toLowerCase() === 'completed';
    const nextStatus = isCompleted ? 'Pending' : 'Completed';

    button.disabled = true;
    button.classList.add('is-loading');

    try {
      const response = await updateTask(task._id, { status: nextStatus });
      const normalized = normalizeTask(response.task, resolveTargetModel());
      button.setAttribute('aria-pressed', nextStatus === 'Completed' ? 'true' : 'false');
      replaceTask(normalized);
      refresh();
    } catch (err) {
      console.error('[tasks] quick complete failed', err);
      window.alert('Unable to update the task. Please try again.');
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  };

  if (modal.form) {
    modal.form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitModalForm();
    });
  }

  modal.complete?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!modal.complete?.dataset?.targetStatus) return;
    submitModalForm(modal.complete.dataset.targetStatus);
  });

  modal.cancel?.addEventListener('click', (event) => {
    event.preventDefault();
    closeTaskModal();
  });

  modal.close?.addEventListener('click', (event) => {
    event.preventDefault();
    closeTaskModal();
  });

  modal.backdrop?.addEventListener('click', (event) => {
    event.preventDefault();
    closeTaskModal();
  });

  modal.status?.addEventListener('change', () => {
    updateCompleteButton(modal.status.value);
  });

  refresh();

  async function loadTasksForContext() {
    const effectiveLinkedId = resolveLinkedId();
    if (!effectiveLinkedId) {
      taskState.items = [];
      refresh();
      return;
    }
    const targetModel = resolveTargetModel();
    try {
      const response = await fetchTasks({
        linkedModel: targetModel,
        linkedId: effectiveLinkedId
      });
      const normalized = Array.isArray(response?.tasks)
        ? response.tasks.map((task) => normalizeTask(task, targetModel)).filter(Boolean)
        : [];
      taskState.items = normalized;
    } catch (err) {
      console.error('[tasks] failed to load initial tasks', err);
      taskState.items = [];
    } finally {
      refresh();
    }
  }

  const setContext = async (contextUpdates = {}) => {
    if (Object.prototype.hasOwnProperty.call(contextUpdates, 'contactId')) {
      contextContactId = contextUpdates.contactId ?? null;
    }
    if (
      Object.prototype.hasOwnProperty.call(contextUpdates, 'linkedModel') &&
      contextUpdates.linkedModel
    ) {
      contextLinkedModel = contextUpdates.linkedModel;
    }
    if (Object.prototype.hasOwnProperty.call(contextUpdates, 'linkedId')) {
      contextLinkedId = contextUpdates.linkedId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(contextUpdates, 'defaultTitleBuilder')) {
      const builder = contextUpdates.defaultTitleBuilder;
      contextDefaultTitleBuilder =
        typeof builder === 'function' ? builder : builder === null ? null : contextDefaultTitleBuilder;
    }
    if (Object.prototype.hasOwnProperty.call(contextUpdates, 'assignmentTarget')) {
      const desiredTarget = contextUpdates.assignmentTarget;
      if (typeof desiredTarget === 'string' && desiredTarget.trim()) {
        contextAssignmentTarget = desiredTarget.trim().toLowerCase();
        if (modalMode === 'create' && modal.root?.classList.contains('is-open')) {
          applyAssignmentSelection(contextAssignmentTarget);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(contextUpdates, 'lenderOptions')) {
      contextLenderOptions = normalizeExternalLenderOptions(contextUpdates.lenderOptions);
      const contactData = latestContact || getContact();
      populateLenderSelect(contactData);
      refreshLenderSelectState();
    }

    const hasContext = Boolean(resolveLinkedId());
    updatePanelAvailability(hasContext);
    if (!hasContext) {
      taskState.items = [];
      refresh();
      return;
    }
    await loadTasksForContext();
  };

  const handleUnassignSchedule = async () => {
    if (!contextContactId) {
      setAutomationStatus('Save this contact before unassigning a schedule.', 'error');
      return;
    }
    const current = getContact()?.followUpSchedule;
    if (!current) {
      setAutomationStatus('There is no schedule assigned to this contact.', 'error');
      return;
    }
    const button = followupAutomation.unassign;
    if (button) {
      button.disabled = true;
      button.textContent = 'Removing...';
    }
    try {
      const response = await unassignFollowUpSchedule(contextContactId, { cleanup: true });
      setContact({ followUpSchedule: null });
      updateFollowupAssignmentUI();
      const removed = response?.removedTasks || 0;
      if (removed > 0) {
        setAutomationStatus(`Schedule removed. Deleted ${removed} follow-up tasks.`, 'success');
      } else {
        setAutomationStatus('Schedule removed.', 'success');
      }
      await loadTasksForContext();
    } catch (err) {
      console.error('[tasks] failed to unassign schedule', err);
      setAutomationStatus(err?.message || 'Unable to unassign that schedule.', 'error');
    } finally {
      if (button) {
        button.textContent = 'Unassign';
        button.disabled = false;
      }
    }
  };

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetFilter = btn.dataset.filter || 'all';
      taskState.filter = targetFilter === 'all' ? 'all' : targetFilter;
      setFilterActive(taskState.filter);
      refresh();
    });
  });

  addBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    if (addBtn.disabled) return;
    if (panel.classList.contains('collapsed')) {
      panel.classList.remove('collapsed');
      toggle?.setAttribute('aria-expanded', 'true');
    }
    openTaskModal(null);
  });


  if (followupAutomation.section) {
    loadFollowupSchedules();
  }

  updatePanelAvailability(Boolean(resolveLinkedId()));
  loadTasksForContext();

  return { setContext };
}

function mapChannelToTaskType(channel) {
  const normalized = typeof channel === 'string' ? channel.trim().toUpperCase() : '';
  return CHANNEL_TASK_TYPE_MAP.get(normalized) || 'Follow-Up';
}

function computeDueDateIso(dayOffset = 0) {
  const due = new Date();
  due.setHours(0, 0, 0, 0);
  const offset = Number(dayOffset);
  if (Number.isFinite(offset)) {
    due.setDate(due.getDate() + Math.max(0, Math.floor(offset)));
  }
  return due.toISOString();
}

function buildFollowupReasonPrefix(contactId, scheduleId, runId = null) {
  const safeContact = contactId ? String(contactId) : 'contact';
  const safeSchedule = scheduleId ? String(scheduleId) : 'schedule';
  const safeRun = runId ? String(runId) : null;
  return safeRun
    ? `followup:${safeContact}:${safeSchedule}:${safeRun}:`
    : `followup:${safeContact}:${safeSchedule}:`;
}

function buildFollowupReason(contactId, scheduleId, stepId, runId = null) {
  const prefix = buildFollowupReasonPrefix(contactId, scheduleId, runId);
  const safeStep = stepId ? String(stepId) : 'step';
  return `${prefix}${safeStep}`;
}

function resolveOwnerId(contact) {
  if (!contact || !contact.ownerId) return null;
  const owner = contact.ownerId;
  let value = null;
  if (typeof owner === 'string') {
    value = owner;
  } else if (typeof owner === 'object') {
    value = owner._id || owner.id || owner.$id || null;
  }
  return value ? String(value) : null;
}

export function initTaskPanel(options = {}) {
  if (taskPanelInstance) {
    taskPanelInstance.setContext?.(options);
    return taskPanelInstance;
  }
  taskPanelInstance = createTaskPanel(options);
  return taskPanelInstance;
}
