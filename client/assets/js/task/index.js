/* assets/js/task/index.js
 * Task overview page interactions (rendering, modal, API calls).
 */

const DATA_NODE_ID = '__TASK_PAGE_DATA__';
const DEFAULT_TYPES = [
  'Follow-Up',
  'Reminder',
  'Document',
  'Approval',
  'Review',
  'Note',
  'Custom'
];
const DEFAULT_PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Overdue'];
const DEFAULT_CATEGORIES = ['Custom'];
const FOLLOWUP_TYPES = new Set(['Follow-Up', 'Call', 'Email', 'Meeting']);

function parseInitialData() {
  const node = document.getElementById(DATA_NODE_ID);
  if (!node) {
    return {
      groups: [],
      meta: {},
      currentUserId: '',
      endpoints: {}
    };
  }

  try {
    const parsed = JSON.parse(node.textContent || '{}');
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      meta: typeof parsed.meta === 'object' && parsed.meta ? parsed.meta : {},
      currentUserId: typeof parsed.currentUserId === 'string' ? parsed.currentUserId : '',
      endpoints: typeof parsed.endpoints === 'object' && parsed.endpoints ? parsed.endpoints : {}
    };
  } catch (err) {
    console.error('[task-page] failed to parse initial data', err);
    return {
      groups: [],
      meta: {},
      currentUserId: '',
      endpoints: {}
    };
  }
}

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      name: typeof group.category === 'string' && group.category
        ? group.category
        : (typeof group.name === 'string' && group.name ? group.name : 'Custom'),
      tasks: Array.isArray(group.tasks) ? group.tasks.slice() : []
    }))
    .filter((group) => typeof group.name === 'string');
}

function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function computeSummary(categories) {
  const startOfToday = getStartOfToday();
  let due = 0;
  let overdue = 0;

  categories.forEach((group) => {
    group.tasks.forEach((task) => {
      due += 1;
      if (!task || !task.dueDate) return;
      const dueDate = new Date(task.dueDate);
      if (Number.isNaN(dueDate.getTime())) return;
      const status = typeof task.status === 'string' ? task.status.toLowerCase() : '';
      if (status === 'completed') return;
      if (dueDate < startOfToday) overdue += 1;
    });
  });

  return { due, overdue };
}

function deriveMeta(meta) {
  const categories = Array.isArray(meta.categories) && meta.categories.length
    ? meta.categories.slice()
    : DEFAULT_CATEGORIES.slice();
  if (!categories.includes('Custom')) categories.push('Custom');

  return {
    categories,
    statuses: Array.isArray(meta.statuses) && meta.statuses.length
      ? meta.statuses.slice()
      : DEFAULT_STATUSES.slice(),
    priorities: Array.isArray(meta.priorities) && meta.priorities.length
      ? meta.priorities.slice()
      : DEFAULT_PRIORITIES.slice(),
    types: Array.isArray(meta.types) && meta.types.length
      ? meta.types.slice()
      : DEFAULT_TYPES.slice(),
    totals: typeof meta.totals === 'object' && meta.totals ? meta.totals : {}
  };
}

function deriveDefaults(meta) {
  const { categories, statuses, priorities, types } = meta;
  const defaultType = types.includes('Follow-Up') ? 'Follow-Up' : (types[0] || 'Custom');
  const defaultCategory = categories.includes('Sales') ? 'Sales' : (categories[0] || 'Custom');
  const defaultPriority = priorities.includes('Medium') ? 'Medium' : (priorities[0] || 'Medium');
  const defaultStatus = statuses.includes('Pending') ? 'Pending' : (statuses[0] || 'Pending');

  return {
    type: defaultType,
    category: defaultCategory,
    priority: defaultPriority,
    status: defaultStatus
  };
}

function createBadge(className, textContent) {
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = textContent;
  return badge;
}

function formatDue(task) {
  if (!task || !task.dueDate) {
    return { hasDue: false, overdue: false, label: 'No due date' };
  }
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) {
    return { hasDue: false, overdue: false, label: 'No due date' };
  }
  const startOfToday = getStartOfToday();
  const overdue = due < startOfToday;
  const label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { hasDue: true, overdue, label };
}

function renderSummary(summary) {
  const dueEl = document.querySelector('[data-summary="due"]');
  const overdueEl = document.querySelector('[data-summary="overdue"]');
  if (dueEl) dueEl.textContent = String(summary.due);
  if (overdueEl) overdueEl.textContent = String(summary.overdue);
}

function renderEmptyState(container) {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card shadow-sm border-0 text-center';

  const body = document.createElement('div');
  body.className = 'card-body py-5';

  const heading = document.createElement('h2');
  heading.className = 'h5 mb-2';
  heading.textContent = 'No due tasks';

  const paragraph = document.createElement('p');
  paragraph.className = 'text-muted mb-3';
  paragraph.textContent = "You're all caught up. Add the next follow-up to get started.";

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary task-add-trigger';
  button.textContent = 'Add Task';

  body.append(heading, paragraph, button);
  card.append(body);
  container.append(card);
}

function renderCategories(container, categories) {
  if (!container) return;
  container.innerHTML = '';

  if (!categories.length) {
    renderEmptyState(container);
    return;
  }

  const row = document.createElement('div');
  row.className = 'row g-3';

  const startOfToday = getStartOfToday();

  categories.forEach((group) => {
    const col = document.createElement('div');
    col.className = 'col-12 col-lg-6';

    const card = document.createElement('article');
    card.className = 'card shadow-sm border-0 h-100 task-category-card';
    card.dataset.category = group.name;

    const header = document.createElement('header');
    header.className = 'card-header bg-white border-0 pb-0 d-flex align-items-start justify-content-between';

    const headingWrap = document.createElement('div');
    const heading = document.createElement('h2');
    heading.className = 'h5 mb-1';
    heading.textContent = group.name;

    const sub = document.createElement('p');
    sub.className = 'text-muted small mb-0';
    sub.textContent = `${group.tasks.length} due`;

    headingWrap.append(heading, sub);

    const badge = createBadge('badge text-bg-primary rounded-pill align-self-start', group.tasks.length);

    header.append(headingWrap, badge);

    const list = document.createElement('ul');
    list.className = 'list-group list-group-flush mt-3';

    group.tasks.forEach((task) => {
      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-start gap-3';

      const left = document.createElement('div');
      left.className = 'flex-grow-1';

      const title = document.createElement('div');
      title.className = 'fw-semibold text-truncate';
      const safeTitle = task && task.title ? String(task.title) : 'Untitled Task';
      title.textContent = safeTitle;
      title.title = safeTitle;

      left.appendChild(title);

      const description = task && task.description ? String(task.description).trim() : '';
      if (description) {
        const descEl = document.createElement('p');
        descEl.className = 'text-muted small mb-1';
        descEl.textContent = description;
        left.appendChild(descEl);
      }

      const metaRow = document.createElement('div');
      metaRow.className = 'd-flex flex-wrap align-items-center gap-2 small text-muted';

      const statusLabel = task && task.status ? String(task.status) : 'Pending';
      metaRow.appendChild(createBadge('badge rounded-pill text-bg-light text-uppercase', statusLabel));

      const priority = task && task.priority ? String(task.priority) : '';
      if (priority) {
        const priorityBadge = createBadge(
          `badge rounded-pill priority-pill priority-${priority.toLowerCase()}`,
          priority
        );
        metaRow.appendChild(priorityBadge);
      }

      if (task && task.linkedModel === 'Contact' && task.linkedId) {
        metaRow.appendChild(createBadge('badge rounded-pill text-bg-secondary', 'Linked Contact'));
      }

      left.appendChild(metaRow);

      const right = document.createElement('div');
      right.className = 'text-end flex-shrink-0';

      const dueInfo = document.createElement('div');
      const { hasDue, overdue, label } = formatDue(task);
      if (hasDue) {
        dueInfo.className = `small ${overdue ? 'text-danger fw-semibold' : 'text-muted'}`;
        dueInfo.textContent = overdue ? `Overdue ${label}` : `Due ${label}`;
      } else {
        dueInfo.className = 'small text-muted';
        dueInfo.textContent = label;
      }

      right.appendChild(dueInfo);

      item.append(left, right);
      list.appendChild(item);
    });

    card.append(header, list);
    col.appendChild(card);
    row.appendChild(col);
  });

  container.appendChild(row);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const message = data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

function populateSelect(select, options, defaultValue) {
  if (!select) return;
  const values = Array.isArray(options) && options.length ? options : [];
  select.innerHTML = '';
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (defaultValue && value === defaultValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  if (defaultValue && select.value !== defaultValue && values.length) {
    select.value = values[0];
  }
}

function setModalError(modal, message) {
  const errorEl = modal.querySelector('#task-modal-error');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function toggleModal(modal, isOpen) {
  if (!modal) return;
  modal.hidden = !isOpen;
  modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  document.body.classList.toggle('task-modal-open', isOpen);
}

function getActualType(baseType, followupType) {
  if (baseType === 'Follow-Up') {
    return FOLLOWUP_TYPES.has(followupType) ? followupType : 'Follow-Up';
  }
  return baseType;
}

document.addEventListener('DOMContentLoaded', () => {
  const initial = parseInitialData();
  const container = document.getElementById('task-category-container');
  const refreshBtn = document.getElementById('task-refresh');
  const modalRoot = document.getElementById('task-modal');
  const modalForm = modalRoot ? modalRoot.querySelector('#task-modal-form') : null;
  const modalTitle = modalRoot ? modalRoot.querySelector('#task-modal-title') : null;
  const modalTitleInput = modalRoot ? modalRoot.querySelector('#task-modal-title-input') : null;
  const modalNotes = modalRoot ? modalRoot.querySelector('#task-modal-notes') : null;
  const modalDue = modalRoot ? modalRoot.querySelector('#task-modal-due') : null;
  const modalPriority = modalRoot ? modalRoot.querySelector('#task-modal-priority') : null;
  const modalStatus = modalRoot ? modalRoot.querySelector('#task-modal-status') : null;
  const modalCategory = modalRoot ? modalRoot.querySelector('#task-modal-category') : null;
  const modalSave = modalRoot ? modalRoot.querySelector('#task-modal-save') : null;
  const modalCancel = modalRoot ? modalRoot.querySelector('#task-modal-cancel') : null;
  const modalClose = modalRoot ? modalRoot.querySelector('#task-modal-close') : null;
  const modalBackdrop = modalRoot ? modalRoot.querySelector('.task-modal__backdrop') : null;
  const modalComplete = modalRoot ? modalRoot.querySelector('#task-modal-complete') : null;
  const typeButtonsWrap = modalRoot ? modalRoot.querySelector('#task-type-buttons') : null;
  const followupWrap = modalRoot ? modalRoot.querySelector('#task-followup-sub') : null;

  const endpoints = {
    overview: typeof initial.endpoints.overview === 'string' && initial.endpoints.overview
      ? initial.endpoints.overview
      : '/api/tasks/overview',
    create: typeof initial.endpoints.create === 'string' && initial.endpoints.create
      ? initial.endpoints.create
      : '/api/tasks'
  };

  const state = {
    categories: normalizeGroups(initial.groups),
    meta: deriveMeta(initial.meta || {}),
    defaults: deriveDefaults(deriveMeta(initial.meta || {})),
    currentUserId: initial.currentUserId || '',
    isFetching: false,
    modal: {
      baseType: null,
      followupType: 'Follow-Up',
      submitting: false
    }
  };

  // Ensure defaults align with meta reference (two-step to avoid stale reference)
  state.meta = deriveMeta(initial.meta || {});
  state.defaults = deriveDefaults(state.meta);

  function sortCategories() {
    const order = state.meta.categories || [];
    return state.categories
      .slice()
      .sort((a, b) => {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
  }

  function setRefreshLoading(isLoading) {
    if (!refreshBtn) return;
    refreshBtn.disabled = isLoading;
    refreshBtn.textContent = isLoading ? 'Refreshing...' : 'Refresh';
  }

  function render() {
    const ordered = sortCategories();
    renderCategories(container, ordered);
    const summary = state.meta.totals && typeof state.meta.totals.due === 'number'
      ? {
          due: state.meta.totals.due,
          overdue: state.meta.totals.overdue || 0
        }
      : computeSummary(ordered);
    renderSummary(summary);
  }

  async function refreshOverview() {
    if (state.isFetching) return;
    state.isFetching = true;
    setRefreshLoading(true);
    try {
      const data = await fetchJson(endpoints.overview);
      const categories = Array.isArray(data.categories)
        ? normalizeGroups(data.categories)
        : [];
      state.categories = categories;
      state.meta = deriveMeta(data.meta || {});
      state.defaults = deriveDefaults(state.meta);
      render();
    } catch (err) {
      console.error('[task-page] failed to refresh overview', err);
      window.alert(err.message || 'Unable to refresh tasks right now.');
    } finally {
      state.isFetching = false;
      setRefreshLoading(false);
    }
  }

  function resetTypeSelection() {
    state.modal.baseType = state.defaults.type || 'Follow-Up';
    state.modal.followupType = 'Follow-Up';
  }

  function updateTypeButtons() {
    if (!typeButtonsWrap) return;
    const buttons = Array.from(typeButtonsWrap.querySelectorAll('button[data-type]'));
    const selectedBase = state.modal.baseType || state.defaults.type;
    buttons.forEach((btn) => {
      const typeValue = btn.dataset.type;
      const isSelected = typeValue === selectedBase ||
        (selectedBase === 'Follow-Up' && FOLLOWUP_TYPES.has(typeValue) && state.modal.followupType === typeValue);
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    if (!followupWrap) return;
    const shouldShowFollowups = selectedBase === 'Follow-Up';
    followupWrap.hidden = !shouldShowFollowups;
    followupWrap.setAttribute('aria-hidden', shouldShowFollowups ? 'false' : 'true');
    if (shouldShowFollowups) {
      const followupButtons = Array.from(followupWrap.querySelectorAll('button[data-followup]'));
      followupButtons.forEach((btn) => {
        const followValue = btn.dataset.followup;
        const isSelected = followValue === state.modal.followupType;
        btn.classList.toggle('is-selected', isSelected);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
    }
  }

  function resetModal() {
    if (!modalRoot || !modalForm) return;
    modalForm.reset();
    setModalError(modalRoot, '');
    resetTypeSelection();
    populateSelect(modalPriority, state.meta.priorities, state.defaults.priority);
    populateSelect(modalStatus, state.meta.statuses, state.defaults.status);
    populateSelect(modalCategory, state.meta.categories, state.defaults.category);
    if (modalTitle) modalTitle.textContent = 'Add Task';
    if (modalSave) {
      modalSave.disabled = false;
      modalSave.textContent = 'Save Task';
    }
    if (modalComplete) {
      modalComplete.hidden = true;
    }
    if (modalDue) modalDue.value = '';
    updateTypeButtons();
  }

  function openModal() {
    if (!modalRoot) return;
    resetModal();
    toggleModal(modalRoot, true);
    window.requestAnimationFrame(() => {
      if (modalTitleInput) modalTitleInput.focus();
    });
  }

  function closeModal() {
    if (!modalRoot) return;
    toggleModal(modalRoot, false);
    state.modal.submitting = false;
  }

  function setModalSubmitting(isSubmitting) {
    state.modal.submitting = isSubmitting;
    if (modalSave) {
      modalSave.disabled = isSubmitting;
      modalSave.textContent = isSubmitting ? 'Saving...' : 'Save Task';
    }
  }

  async function createTask(payload) {
    return fetchJson(endpoints.create, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function handleModalSubmit(event) {
    event.preventDefault();
    if (!modalRoot || !modalForm || state.modal.submitting) return;

    const titleValue = modalTitleInput ? modalTitleInput.value.trim() : '';
    if (!titleValue) {
      setModalError(modalRoot, 'Title is required.');
      if (modalTitleInput) modalTitleInput.focus();
      return;
    }

    const categoryValue = modalCategory && modalCategory.value ? modalCategory.value : state.defaults.category;
    const priorityValue = modalPriority && modalPriority.value ? modalPriority.value : state.defaults.priority;
    const statusValue = modalStatus && modalStatus.value ? modalStatus.value : state.defaults.status;
    const notesValue = modalNotes && modalNotes.value ? modalNotes.value.trim() : '';
    const dueValue = modalDue && modalDue.value ? modalDue.value : '';
    const actualType = getActualType(state.modal.baseType || state.defaults.type, state.modal.followupType);

    const payload = {
      title: titleValue,
      description: notesValue,
      dueDate: dueValue,
      type: actualType,
      priority: priorityValue,
      status: statusValue,
      category: categoryValue
    };

    if (state.currentUserId) {
      payload.assignedTo = state.currentUserId;
    }

    setModalError(modalRoot, '');
    setModalSubmitting(true);

    createTask(payload)
      .then((data) => {
        closeModal();
        // Re-fetch overview to respect server-side due filters.
        refreshOverview();
      })
      .catch((err) => {
        console.error('[task-page] failed to create task', err);
        setModalError(modalRoot, err.message || 'Unable to save the task. Please try again.');
      })
      .finally(() => {
        setModalSubmitting(false);
      });
  }

  if (typeButtonsWrap) {
    typeButtonsWrap.addEventListener('click', (event) => {
      const target = event.target.closest('button[data-type]');
      if (!target) return;
      event.preventDefault();
      const typeValue = target.dataset.type;
      if (!typeValue) return;
      if (FOLLOWUP_TYPES.has(typeValue)) {
        state.modal.baseType = 'Follow-Up';
        state.modal.followupType = typeValue;
      } else {
        state.modal.baseType = typeValue;
        state.modal.followupType = 'Follow-Up';
      }
      updateTypeButtons();
    });
  }

  if (followupWrap) {
    followupWrap.addEventListener('click', (event) => {
      const target = event.target.closest('button[data-followup]');
      if (!target) return;
      event.preventDefault();
      const followValue = target.dataset.followup;
      if (!FOLLOWUP_TYPES.has(followValue)) return;
      state.modal.baseType = 'Follow-Up';
      state.modal.followupType = followValue;
      updateTypeButtons();
    });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.task-add-trigger');
    if (trigger) {
      event.preventDefault();
      openModal();
    }
  });

  if (modalCancel) {
    modalCancel.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  if (modalClose) {
    modalClose.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalRoot && !modalRoot.hidden) {
      closeModal();
    }
  });

  if (modalForm) {
    modalForm.addEventListener('submit', handleModalSubmit);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', (event) => {
      event.preventDefault();
      refreshOverview();
    });
  }

  // Remove inline JSON node once parsed
  const dataNode = document.getElementById(DATA_NODE_ID);
  if (dataNode && dataNode.parentNode) {
    dataNode.parentNode.removeChild(dataNode);
  }

  // Initial render
  render();
});
