import { getContact } from './state.js';
import { createTask, fetchTasks, updateTask } from './api.js';
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
  'Note',
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

const taskState = {
  items: [],
  filter: 'all'
};

function normalizeTask(raw) {
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
    completedAt: raw.completedAt || null,
    linkedModel: raw.linkedModel || 'Contact',
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

  const sorted = filtered
    .slice()
    .sort((a, b) => {
      const aDate = a.dueDate || a.createdAt;
      const bDate = b.dueDate || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

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

export function initTaskPanel({ contactId, currentUserId }) {
  const panel = document.getElementById('todo-panel');
  if (!panel) return;

  const toggle = panel.querySelector('#todo-toggle');
  const addBtn = panel.querySelector('#todo-add');
  const listEl = panel.querySelector('#todo-list');
  const emptyState = listEl?.querySelector('.todo-empty') || null;
  const countEl = panel.querySelector('#todo-count');
  const filterButtons = Array.from(panel.querySelectorAll('.todo-pill'));

  if (!contactId) return;

  const modalRoot = document.getElementById('task-modal');
  const modal = {
    root: modalRoot,
    form: modalRoot?.querySelector('#task-modal-form') || null,
    heading: modalRoot?.querySelector('#task-modal-title') || null,
    title: modalRoot?.querySelector('#task-modal-title-input') || null,
    due: modalRoot?.querySelector('#task-modal-due') || null,
    priority: modalRoot?.querySelector('#task-modal-priority') || null,
    status: modalRoot?.querySelector('#task-modal-status') || null,
    notes: modalRoot?.querySelector('#task-modal-notes') || null,
    complete: modalRoot?.querySelector('#task-modal-complete') || null,
    save: modalRoot?.querySelector('#task-modal-save') || null,
    cancel: modalRoot?.querySelector('#task-modal-cancel') || null,
    close: modalRoot?.querySelector('#task-modal-close') || null,
    backdrop: modalRoot?.querySelector('[data-task-modal-close]') || null,
    error: modalRoot?.querySelector('#task-modal-error') || null
  };

  let activeTaskId = null;
  let modalMode = 'edit';
  let modalSubmitting = false;
  let previousOverflow = '';
  let escapeHandlerBound = false;
  let lastFocusedElement = null;

  populateSelectOptions(modal.priority, TASK_PRIORITIES);
  populateSelectOptions(modal.status, TASK_STATUSES);

  const BASE_TYPES = ['Follow-Up', 'Reminder', 'Document', 'Approval', 'Review', 'Note', 'Custom'];
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

  const refresh = () => {
    updateCounts(panel, countEl, filterButtons);
    renderTasks(listEl, emptyState, currentUserId, {
      onOpenTask: (task) => openTaskModal(task._id),
      onToggleComplete: handleQuickComplete
    });
  };

  on('tasks:external-upsert', (task) => {
    const normalized = normalizeTask(task);
    if (!normalized) return;
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

    const titleValue = isCreate ? buildDefaultTitle() : task?.title || '';
    if (modal.title) modal.title.value = titleValue;

    const dueValue = isCreate ? '' : toDateInputValue(task?.dueDate);
    if (modal.due) modal.due.value = dueValue;

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

    const payload = {
      title,
      description: notesValue,
      dueDate: dueValue,
      type: typeValue,
      priority: priorityValue,
      status: statusValue
    };

    clearModalError();
    setModalLoading(true);

    try {
      if (modalMode === 'create' || !activeTaskId) {
        const createPayload = {
          ...payload,
          linkedModel: 'Contact',
          linkedId: contactId
        };
        const response = await createTask(createPayload);
        const normalized = normalizeTask(response.task);
        if (normalized) {
          taskState.items.unshift(normalized);
        }
        taskState.filter = 'all';
        setFilterActive('all');
        refresh();
        closeTaskModal();
      } else {
        const response = await updateTask(activeTaskId, payload);
        const normalized = normalizeTask(response.task);
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
    const isCompleted = (current.status || '').toLowerCase() === 'completed';
    const nextStatus = isCompleted ? 'Pending' : 'Completed';

    button.disabled = true;
    button.classList.add('is-loading');

    try {
      const response = await updateTask(task._id, { status: nextStatus });
      const normalized = normalizeTask(response.task);
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

  (async () => {
    try {
      const response = await fetchTasks({
        linkedModel: 'Contact',
        linkedId: contactId
      });
      const normalized = Array.isArray(response?.tasks)
        ? response.tasks.map(normalizeTask).filter(Boolean)
        : [];
      taskState.items = normalized;
    } catch (err) {
      console.error('[tasks] failed to load initial tasks', err);
      taskState.items = [];
    } finally {
      refresh();
    }
  })();

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
    if (panel.classList.contains('collapsed')) {
      panel.classList.remove('collapsed');
      toggle?.setAttribute('aria-expanded', 'true');
    }
    openTaskModal(null);
  });


}
