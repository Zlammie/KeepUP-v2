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
const CONTACT_STATUS_KEYS = ['new', 'target', 'possible', 'negotiation', 'beback'];
const CONTACT_STATUS_SET = new Set(CONTACT_STATUS_KEYS);
const AGGREGATE_FILTER_TYPES = new Set([
  'purchasers',
  'purchaser',
  'communities',
  'community',
  'competitions',
  'competition'
]);
const PRIORITY_KEYS = ['none', 'low', 'medium', 'high'];
let state = null;

function parseInitialData() {
  const node = document.getElementById(DATA_NODE_ID);
  if (!node) {
    return {
      groups: [],
      meta: {},
      currentUserId: '',
      endpoints: {},
      purchasers: []
    };
  }

  try {
    const parsed = JSON.parse(node.textContent || '{}');
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      meta: typeof parsed.meta === 'object' && parsed.meta ? parsed.meta : {},
      currentUserId: typeof parsed.currentUserId === 'string' ? parsed.currentUserId : '',
      endpoints: typeof parsed.endpoints === 'object' && parsed.endpoints ? parsed.endpoints : {},
      purchasers: Array.isArray(parsed.purchasers) ? parsed.purchasers : []
    };
  } catch (err) {
    console.error('[task-page] failed to parse initial data', err);
    return {
      groups: [],
      meta: {},
      currentUserId: '',
      endpoints: {},
      purchasers: []
    };
  }
}

function normalizeLinkedGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      key: typeof group.key === 'string' && group.key ? group.key : `linked-${Math.random().toString(36).slice(2)}`,
      label: typeof group.label === 'string' && group.label ? group.label : 'Linked record',
      context: typeof group.context === 'string' ? group.context : '',
      tasks: Array.isArray(group.tasks) ? group.tasks.slice() : []
    }))
    .filter((group) => Array.isArray(group.tasks) && group.tasks.length > 0);
}

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      name: typeof group.category === 'string' && group.category
        ? group.category
        : (typeof group.name === 'string' && group.name ? group.name : 'Custom'),
      tasks: Array.isArray(group.tasks) ? group.tasks.slice() : [],
      linkedGroups: normalizeLinkedGroups(group.linkedGroups)
    }))
    .filter((group) => typeof group.name === 'string');
}

const TASK_TABLE_COLUMNS = [
  { key: 'title', label: 'Task' },
  { key: 'due', label: 'Due' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'linked', label: 'Linked' }
];

function createTableHeadRow() {
  const headRow = document.createElement('div');
  headRow.className = 'task-table__row task-table__head';
  headRow.setAttribute('role', 'row');
  TASK_TABLE_COLUMNS.forEach(({ key, label }) => {
    const cell = document.createElement('div');
    cell.className = `task-table__cell task-table__cell--${key}`;
    cell.setAttribute('role', 'columnheader');
    cell.textContent = label;
    headRow.appendChild(cell);
  });
  return headRow;
}

function createTaskCell(className, label) {
  const cell = document.createElement('div');
  cell.className = `task-table__cell task-table__cell--${className}`;
  if (label) cell.dataset.label = label;
  cell.setAttribute('role', 'cell');
  return cell;
}

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-table__row';
  row.setAttribute('role', 'row');
  if (task && task._id) {
    row.dataset.taskId = String(task._id);
    row.tabIndex = 0;
  }

  const { hasDue, overdue, label: dueLabel } = formatDue(task);
  if (hasDue && overdue) row.classList.add('is-overdue');

  const titleCell = createTaskCell('title', 'Task');
  const titleWrap = document.createElement('div');
  titleWrap.className = 'task-table__task';
  const safeTitle = task && task.title ? String(task.title) : 'Untitled Task';
  const titleEl = document.createElement('div');
  titleEl.className = 'task-table__task-title';
  titleEl.textContent = safeTitle;
  titleEl.title = safeTitle;
  titleWrap.appendChild(titleEl);
  const description = task && task.description ? String(task.description).trim() : '';
  if (description) {
    const descEl = document.createElement('div');
    descEl.className = 'task-table__task-desc';
    descEl.textContent = description;
    titleWrap.appendChild(descEl);
  }
  titleCell.appendChild(titleWrap);

  const dueCell = createTaskCell('due', 'Due');
  if (hasDue) {
    const dueText = document.createElement('span');
    dueText.className = 'task-table__due';
    if (overdue) dueText.classList.add('is-overdue');
    dueText.textContent = dueLabel;
    dueCell.appendChild(dueText);

    const caption = document.createElement('small');
    caption.className = 'task-table__due-caption';
    caption.classList.add(overdue ? 'text-danger' : 'text-muted');
    caption.textContent = overdue ? 'Overdue' : 'On track';
    dueCell.appendChild(caption);
  } else {
    const noDue = document.createElement('span');
    noDue.className = 'text-muted';
    noDue.textContent = dueLabel;
    dueCell.appendChild(noDue);
  }

  const priorityCell = createTaskCell('priority', 'Priority');
  const priority = task && task.priority ? String(task.priority) : '';
  if (priority) {
    priorityCell.appendChild(
      createBadge(`badge rounded-pill priority-pill priority-${priority.toLowerCase()}`, priority)
    );
  } else {
    const dash = document.createElement('span');
    dash.className = 'text-muted';
    dash.textContent = 'None';
    priorityCell.appendChild(dash);
  }

  const statusCell = createTaskCell('status', 'Status');
  const statusLabel = task && task.status ? String(task.status) : 'Pending';
  statusCell.appendChild(createBadge('badge rounded-pill text-bg-light text-uppercase', statusLabel));

  const linkedCell = createTaskCell('linked', 'Linked');
  const linkedName = task && task.linkedName ? String(task.linkedName) : '';
  const linkedModel = task && task.linkedModel ? String(task.linkedModel) : '';
  const linkedHref = getLinkedHref(task);
  const linkedContext =
    linkedModel === 'Lot'
      ? (task && task.linkedCommunityName ? task.linkedCommunityName : 'Lot')
      : linkedModel;

  if (linkedName || linkedModel) {
    if (linkedName) {
      if (linkedHref) {
        const nameLink = document.createElement('a');
        nameLink.href = linkedHref;
        nameLink.className = 'task-linked-link';
        nameLink.textContent = linkedName;
        nameLink.addEventListener('click', (event) => event.stopPropagation());
        linkedCell.appendChild(nameLink);
      } else {
        const nameEl = document.createElement('div');
        nameEl.className = 'task-linked-name';
        nameEl.textContent = linkedName;
        linkedCell.appendChild(nameEl);
      }
    }
    if (linkedContext) {
      const contextEl = document.createElement('small');
      contextEl.className = 'task-linked-context text-muted';
      contextEl.textContent = linkedContext;
      linkedCell.appendChild(contextEl);
    }
  } else {
    const dash = document.createElement('span');
    dash.className = 'text-muted';
    dash.textContent = 'None';
    linkedCell.appendChild(dash);
  }

  row.append(titleCell, dueCell, priorityCell, statusCell, linkedCell);
  return row;
}

function buildTaskTable(tasks, label) {
  const table = document.createElement('div');
  table.className = 'task-table';
  table.setAttribute('role', 'table');
  if (label) table.setAttribute('aria-label', label);

  const headRow = createTableHeadRow();
  const body = document.createElement('div');
  body.className = 'task-table__body';

  if (Array.isArray(tasks) && tasks.length) {
    tasks.forEach((task) => {
      body.appendChild(buildTaskRow(task));
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'task-table__empty text-center';
    const message = document.createElement('p');
    message.className = 'mb-0';
    message.textContent = 'No tasks available.';
    empty.appendChild(message);
    body.appendChild(empty);
  }

  table.append(headRow, body);
  return table;
}

function buildLinkedGroupSection(linkedGroup, categoryName) {
  const section = document.createElement('section');
  section.className = 'task-linked-group';

  const header = document.createElement('header');
  header.className = 'task-linked-group__header';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'task-linked-group__title';
  title.textContent = linkedGroup.label;

  titleWrap.appendChild(title);

  if (linkedGroup.context) {
    const context = document.createElement('small');
    context.className = 'task-linked-group__context text-muted';
    context.textContent = linkedGroup.context;
    titleWrap.appendChild(context);
  }

  const countBadge = createBadge('badge text-bg-light', linkedGroup.tasks.length);

  header.append(titleWrap, countBadge);

  const table = buildTaskTable(
    linkedGroup.tasks,
    `${linkedGroup.label} tasks${categoryName ? ` in ${categoryName}` : ''}`
  );

  section.append(header, table);
  return section;
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

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return normalizeText(value).replace(/[^a-z]/g, '');
}

function buildFilterId(group, value) {
  const val = value && value.length ? value : 'all';
  return `${group}:${val}`;
}

function isTaskMarkedPurchased(task) {
  if (!task || task.linkedModel !== 'Contact') return false;
  return normalizeStatusKey(task.linkedStatus) === 'purchased';
}

function isPurchaserTask(task) {
  if (!task || task.linkedModel !== 'Contact') return false;
  if (isTaskMarkedPurchased(task)) return true;
  if (task.linkedId && state && state.purchaserIdSet) {
    return state.purchaserIdSet.has(String(task.linkedId));
  }
  return false;
}

function derivePurchaserIdSetFromGroups(groups) {
  const set = new Set();
  collectAllTasks(groups).forEach((task) => {
    if (isTaskMarkedPurchased(task) && task.linkedId) {
      set.add(String(task.linkedId));
    }
  });
  return set;
}

function buildTaskMap(groups) {
  const map = new Map();
  if (!Array.isArray(groups)) return map;
  const addTask = (task) => {
    if (task && task._id) {
      map.set(String(task._id), task);
    }
  };
  groups.forEach((group) => {
    if (!group) return;
    if (Array.isArray(group.tasks)) {
      group.tasks.forEach(addTask);
    }
    if (Array.isArray(group.linkedGroups)) {
      group.linkedGroups.forEach((linked) => {
        if (Array.isArray(linked.tasks)) linked.tasks.forEach(addTask);
      });
    }
  });
  return map;
}

function collectAllTasks(groups) {
  const results = [];
  const seen = new Set();
  if (!Array.isArray(groups)) return results;
  const addTask = (task) => {
    if (!task || !task._id) return;
    const id = String(task._id);
    if (seen.has(id)) return;
    seen.add(id);
    results.push(task);
  };
  groups.forEach((group) => {
    if (!group) return;
    if (Array.isArray(group.tasks)) {
      group.tasks.forEach(addTask);
    }
    if (Array.isArray(group.linkedGroups)) {
      group.linkedGroups.forEach((linked) => {
        if (Array.isArray(linked.tasks)) linked.tasks.forEach(addTask);
      });
    }
  });
  return results;
}

function groupTasksByEntity(tasks, entity) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task) return;
    let linkedModel = typeof task.linkedModel === 'string' ? task.linkedModel : '';
    let linkedId = task.linkedId ? String(task.linkedId) : '';
    let label = task.linkedName || linkedModel || 'Task';
    let labelNormalized = normalizeText(label);
    let matches = false;
    switch (entity) {
      case 'purchaser':
        matches = isPurchaserTask(task);
        break;
      case 'community':
        if (linkedModel === 'Community') {
          matches = true;
        } else if (task.linkedCommunityId) {
          matches = true;
          linkedModel = 'Community';
          linkedId = task.linkedCommunityId;
          label = task.linkedCommunityName || label;
          labelNormalized = normalizeText(label);
        }
        break;
      case 'competition':
        matches = linkedModel === 'Competition';
        break;
      default:
        matches = false;
    }
    if (!matches) return;
    const key = linkedId || `${linkedModel}:${labelNormalized}` || labelNormalized;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        labelNormalized,
        tasks: []
      });
    }
    map.get(key).tasks.push(task);
  });
  return Array.from(map.values()).filter((entry) => Array.isArray(entry.tasks) && entry.tasks.length);
}

function matchesEntityGroup(group, filter) {
  if (!group || !filter) return false;
  const normalizedValue = normalizeText(filter.value);
  const normalizedLabel = normalizeText(filter.label || filter.value);
  if (filter.value && group.key && String(group.key) === filter.value) return true;
  if (normalizedValue && normalizeText(group.key) === normalizedValue) return true;
  if (normalizedLabel && group.labelNormalized === normalizedLabel) return true;
  return false;
}

function buildEntityCategoriesForFilter(filter) {
  if (!filter || !AGGREGATE_FILTER_TYPES.has(filter.type)) return null;
  const tasks = collectAllTasks(state.allCategories);
  if (!tasks.length) return [];

  let groups = [];
  switch (filter.type) {
    case 'purchasers':
      groups = groupTasksByEntity(tasks, 'purchaser');
      break;
    case 'purchaser':
      groups = groupTasksByEntity(tasks, 'purchaser').filter((group) => matchesEntityGroup(group, filter));
      break;
    case 'communities':
      groups = groupTasksByEntity(tasks, 'community');
      break;
    case 'community':
      groups = groupTasksByEntity(tasks, 'community').filter((group) => matchesEntityGroup(group, filter));
      break;
    case 'competitions':
      groups = groupTasksByEntity(tasks, 'competition');
      break;
    case 'competition':
      groups = groupTasksByEntity(tasks, 'competition').filter((group) => matchesEntityGroup(group, filter));
      break;
    default:
      groups = [];
  }

  return groups.map((group) => ({
    name: group.label,
    tasks: group.tasks.slice(),
    linkedGroups: []
  }));
}

function findTaskById(taskId) {
  if (!taskId || !state || !state.taskMap) return null;
  return state.taskMap.get(String(taskId)) || null;
}

function setSelectValue(select, value) {
  if (!select || value == null) return;
  const stringValue = String(value);
  const options = Array.from(select.options || []);
  let option = options.find((opt) => opt.value === stringValue);
  if (!option) {
    option = document.createElement('option');
    option.value = stringValue;
    option.textContent = stringValue;
    select.add(option);
  }
  select.value = stringValue;
}

function formatDateInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getLinkedHref(task) {
  if (!task || !task.linkedModel) return '';
  const id = task.linkedId ? String(task.linkedId) : '';
  if (!id) return '';
  switch (task.linkedModel) {
    case 'Contact':
      return `/contact-details?id=${encodeURIComponent(id)}`;
    case 'Competition':
      return `/update-competition/${encodeURIComponent(id)}`;
    case 'Lot': {
      const communityId = task.linkedCommunityId ? String(task.linkedCommunityId) : '';
      const params = new URLSearchParams();
      if (communityId) params.set('communityId', communityId);
      params.set('lotId', id);
      return `/address-details?${params.toString()}`;
    }
    default:
      return '';
  }
}

function getTodayBounds() {
  const start = getStartOfToday();
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function matchesDueFilter(task, dueType) {
  const dueDate = task && task.dueDate ? new Date(task.dueDate) : null;
  const bounds = getTodayBounds();
  const status = typeof task.status === 'string' ? task.status.toLowerCase() : '';
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    if (dueType === 'overdue') return status === 'overdue';
    if (dueType === 'no-due') return status !== 'overdue';
    return false;
  }

  switch (dueType) {
    case 'today':
      return dueDate >= bounds.start && dueDate <= bounds.end;
    case 'overdue':
      if (status === 'completed') return false;
      if (status === 'overdue') return true;
      return dueDate < bounds.start;
    case 'upcoming':
      return dueDate > bounds.end;
    default:
      return true;
  }
}

function matchesFilter(task, filter) {
  if (!filter || !task) return true;

  switch (filter.type) {
    case 'due':
      return matchesDueFilter(task, filter.value);
    case 'contacts':
      return task.linkedModel === 'Contact';
    case 'contact-status': {
      if (task.linkedModel !== 'Contact') return false;
      const statusKey = normalizeStatusKey(task.linkedStatus);
      if (filter.value === 'misc') {
        return !CONTACT_STATUS_SET.has(statusKey) && statusKey !== 'purchased';
      }
      return statusKey === filter.value;
    }
    case 'purchasers':
      return isPurchaserTask(task);
    case 'purchaser': {
      if (!isPurchaserTask(task)) return false;
      const linkedId = task.linkedId ? String(task.linkedId) : '';
      if (linkedId) return linkedId === filter.value;
      return normalizeText(task.linkedName) === filter.labelNormalized;
    }
    case 'communities':
      return task.linkedModel === 'Community' || Boolean(task.linkedCommunityId);
    case 'community': {
      if (task.linkedModel === 'Community') {
        const linkedId = task.linkedId ? String(task.linkedId) : '';
        if (filter.value && linkedId) return linkedId === filter.value;
        if (filter.valueNormalized && linkedId) return normalizeText(linkedId) === filter.valueNormalized;
        return normalizeText(task.linkedName) === filter.labelNormalized;
      }
      if (task.linkedCommunityId) {
        if (filter.value && task.linkedCommunityId === filter.value) return true;
        if (filter.valueNormalized && normalizeText(task.linkedCommunityId) === filter.valueNormalized) return true;
        if (filter.labelNormalized && normalizeText(task.linkedCommunityName) === filter.labelNormalized) return true;
      }
      return false;
    }
    case 'competitions':
      return task.linkedModel === 'Competition';
    case 'competition':
      if (task.linkedModel !== 'Competition') return false;
      return normalizeText(task.linkedName) === filter.labelNormalized;
    case 'priority': {
      const priority = typeof task.priority === 'string' ? task.priority.toLowerCase() : '';
      if (filter.value === 'none') {
        return !priority;
      }
      return priority === filter.value;
    }
    default:
      return true;
  }
}

function filterCategories(groups, filter) {
  if (!filter) return groups.slice();
  const filtered = [];

  groups.forEach((group) => {
    if (!group) return;
    const baseTasks = Array.isArray(group.tasks) ? group.tasks : [];
    const filteredTasks = baseTasks.filter((task) => matchesFilter(task, filter));

    let filteredLinkedGroups = [];
    if (Array.isArray(group.linkedGroups)) {
      filteredLinkedGroups = group.linkedGroups
        .map((linked) => {
          if (!linked || !Array.isArray(linked.tasks)) return null;
          const tasks = linked.tasks.filter((task) => matchesFilter(task, filter));
          if (!tasks.length) return null;
          return { ...linked, tasks };
        })
        .filter(Boolean);
    }

    if (filteredTasks.length || filteredLinkedGroups.length) {
      filtered.push({
        ...group,
        tasks: filteredTasks,
        linkedGroups: filteredLinkedGroups
      });
    }
  });

  return filtered;
}

function getElementFilterId(element) {
  if (!element) return '';
  const group = element.dataset.taskFilterGroup || '';
  if (!group) return '';
  const value = element.dataset.taskFilterValue || 'all';
  return buildFilterId(group, value);
}

function updateFilterUI() {
  const nodes = document.querySelectorAll('[data-task-filter-group]');
  nodes.forEach((node) => node.classList.remove('is-active'));
  if (!state || !state.activeFilter) return;

  const active = state.activeFilter;
  const activeId = buildFilterId(active.type, active.idValue || active.value || 'all');
  const parentId = active.parentId || '';
  nodes.forEach((node) => {
    const nodeId = getElementFilterId(node);
    if (nodeId === activeId || (parentId && nodeId === parentId)) {
      node.classList.add('is-active');
    }
  });
}

function buildFilterFromDataset(group, value, label, parentId) {
  const normalizedValue = normalizeText(value);
  const normalizedLabel = normalizeText(label);
  switch (group) {
    case 'due':
      if (!value) return null;
      return { type: 'due', value, idValue: value };
    case 'contacts':
      return { type: 'contacts', value: 'all', idValue: 'all' };
    case 'contact-status': {
      if (!value) return null;
      const key = normalizeStatusKey(value);
      return {
        type: 'contact-status',
        value: key,
        idValue: key,
        parentId: parentId || 'contacts:all'
      };
    }
    case 'purchasers':
      return { type: 'purchasers', value: 'all', idValue: 'all' };
    case 'purchaser':
      if (!value) return null;
      return {
        type: 'purchaser',
        value,
        label,
        labelNormalized: normalizedLabel,
        idValue: value,
        parentId: parentId || 'purchasers:all'
      };
    case 'communities':
      return { type: 'communities', value: 'all', idValue: 'all' };
    case 'community':
      if (!value && !label) return null;
      return {
        type: 'community',
        value,
        valueNormalized: normalizedValue,
        label,
        labelNormalized: normalizedLabel,
        idValue: value || label || 'all',
        parentId: parentId || 'communities:all'
      };
    case 'competitions':
      return { type: 'competitions', value: 'all', idValue: 'all' };
    case 'competition':
      if (!label && !value) return null;
      return {
        type: 'competition',
        value: label || value,
        label: label || value,
        labelNormalized: normalizedLabel || normalizedValue,
        idValue: label || value,
        parentId: parentId || 'competitions:all'
      };
    case 'priority': {
      const key = (value || '').toLowerCase();
      if (!PRIORITY_KEYS.includes(key)) return null;
      return {
        type: 'priority',
        value: key,
        idValue: key
      };
    }
    default:
      return null;
  }
}

function handleFilterClick(target, event, setFilter) {
  if (!target) return;
  const group = target.dataset.taskFilterGroup;
  if (!group) return;
  const value = target.dataset.taskFilterValue || '';
  const label = target.dataset.taskFilterLabel || '';
  const parentId = target.dataset.taskFilterParent || '';
  const filter = buildFilterFromDataset(group, value, label, parentId);

  if (target.tagName === 'BUTTON') {
    event.preventDefault();
    event.stopPropagation();
  }

  const detailsHost = target.closest('details');
  if (detailsHost) detailsHost.open = true;

  if (!filter) return;
  setFilter(filter);
}


function renderCategories(container, categories) {
  if (!container) return;
  container.innerHTML = '';

  if (!categories.length) {
    renderEmptyState(container);
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'task-category-stack';

  categories.forEach((group) => {
    const tasks = Array.isArray(group.tasks) ? group.tasks : [];
    const linkedGroups = Array.isArray(group.linkedGroups) ? group.linkedGroups : [];
    const categoryName = typeof group.name === 'string' && group.name ? group.name : 'Uncategorized';

    const card = document.createElement('article');
    card.className = 'card shadow-sm border-0 task-category-card task-table-card';
    card.dataset.category = categoryName;

    const header = document.createElement('header');
    header.className = 'card-header bg-white border-0 pb-0 d-flex flex-wrap align-items-center justify-content-between gap-2';

    const headingWrap = document.createElement('div');
    const heading = document.createElement('h2');
    heading.className = 'h5 mb-1';
    heading.textContent = categoryName;

    const sub = document.createElement('p');
    sub.className = 'text-muted small mb-0';
    sub.textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;

    headingWrap.append(heading, sub);

    const badge = createBadge('badge text-bg-primary rounded-pill align-self-start', tasks.length);
    header.append(headingWrap, badge);

    const body = document.createElement('div');
    body.className = 'card-body pt-0';

    if (linkedGroups.length) {
      const groupedList = document.createElement('div');
      groupedList.className = 'task-linked-group-list';
      linkedGroups.forEach((linkedGroup) => {
        groupedList.appendChild(buildLinkedGroupSection(linkedGroup, categoryName));
      });
      body.appendChild(groupedList);
    } else {
      body.appendChild(buildTaskTable(tasks, `${categoryName} tasks`));
    }

    card.append(header, body);
    stack.appendChild(card);
  });

  container.appendChild(stack);
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

  const initialMeta = deriveMeta(initial.meta || {});
  const initialCategories = normalizeGroups(initial.groups);
  const initialPurchasers = Array.isArray(initial.purchasers) ? initial.purchasers : [];
  const initialPurchaserSet = new Set(
    initialPurchasers
      .map((entry) => (entry && entry.key ? String(entry.key) : null))
      .filter(Boolean)
  );
  const derivedPurchasers = derivePurchaserIdSetFromGroups(initialCategories);
  initialPurchaserSet.forEach((id) => derivedPurchasers.add(id));

  state = {
    allCategories: initialCategories,
    categories: initialCategories.slice(),
    meta: initialMeta,
    defaults: deriveDefaults(initialMeta),
    currentUserId: initial.currentUserId || '',
    isFetching: false,
    activeFilter: null,
    entityCategories: null,
    taskMap: buildTaskMap(initialCategories),
    purchaserIdSet: derivedPurchasers,
    modal: {
      baseType: null,
      followupType: 'Follow-Up',
      submitting: false,
      currentTaskId: null,
      currentTaskStatus: 'Pending',
      mode: 'create'
    }
  };

  initCollapsibleToggles(document);

  function sortCategories(groups) {
    const order = state.meta.categories || [];
    if (!Array.isArray(groups)) return [];
    const hasEntityView = Array.isArray(state.entityCategories) && state.entityCategories.length;
    return groups
      .slice()
      .sort((a, b) => {
        if (hasEntityView) {
          return a.name.localeCompare(b.name);
        }
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
    const sourceGroups = Array.isArray(state.entityCategories) && state.entityCategories.length
      ? state.entityCategories
      : state.categories;
    const ordered = sortCategories(sourceGroups);
    renderCategories(container, ordered);
    const summary = (!state.activeFilter && state.meta.totals && typeof state.meta.totals.due === 'number')
      ? {
          due: state.meta.totals.due,
          overdue: state.meta.totals.overdue || 0
        }
      : computeSummary(ordered);
    renderSummary(summary);
    updateFilterUI();
  }

  function setActiveFilter(filter) {
    if (filter) {
      state.activeFilter = { ...filter };
      const entityCategories = buildEntityCategoriesForFilter(filter);
      if (entityCategories) {
        state.entityCategories = entityCategories;
        state.categories = [];
      } else {
        state.entityCategories = null;
        state.categories = filterCategories(state.allCategories, filter);
      }
    } else {
      state.activeFilter = null;
      state.entityCategories = null;
      state.categories = state.allCategories.slice();
    }
    render();
  }

  function initCollapsibleToggles(root) {
    const toggles = (root || document).querySelectorAll('[data-task-collapse-toggle]');
    toggles.forEach((toggle) => {
      const host = toggle.closest('details');
      if (!host) return;
      toggle.setAttribute('aria-expanded', host.open ? 'true' : 'false');
      host.addEventListener('toggle', () => {
        toggle.setAttribute('aria-expanded', host.open ? 'true' : 'false');
      });
    });
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
      state.meta = deriveMeta(data.meta || {});
      state.defaults = deriveDefaults(state.meta);
      state.allCategories = categories;
      state.taskMap = buildTaskMap(categories);
      state.purchaserIdSet = derivePurchaserIdSetFromGroups(categories);
      const currentFilter = state.activeFilter ? { ...state.activeFilter } : null;
      if (currentFilter) {
        state.activeFilter = null;
        state.entityCategories = null;
        state.categories = categories.slice();
        setActiveFilter(currentFilter);
      } else {
        state.entityCategories = null;
        state.categories = categories.slice();
        render();
      }
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

  function populateModalSelects() {
    populateSelect(modalPriority, state.meta.priorities, state.defaults.priority);
    populateSelect(modalStatus, state.meta.statuses, state.defaults.status);
    populateSelect(modalCategory, state.meta.categories, state.defaults.category);
  }

  function resetModal() {
    if (!modalRoot || !modalForm) return;
    modalForm.reset();
    setModalError(modalRoot, '');
    resetTypeSelection();
    populateModalSelects();
    if (modalTitle) modalTitle.textContent = 'Add Task';
    if (modalSave) {
      modalSave.disabled = false;
      modalSave.textContent = 'Save Task';
    }
    if (modalComplete) {
      modalComplete.hidden = true;
    }
    if (modalDue) modalDue.value = '';
    if (modalNotes) modalNotes.value = '';
    if (modalTitleInput) modalTitleInput.value = '';
    state.modal.currentTaskId = null;
    state.modal.currentTaskStatus = 'Pending';
    state.modal.mode = 'create';
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

  function openModalForTask(task) {
    if (!modalRoot || !task) return;
    if (modalForm) modalForm.reset();
    setModalError(modalRoot, '');
    state.modal.mode = 'edit';
    state.modal.currentTaskId = task._id ? String(task._id) : null;
    state.modal.currentTaskStatus = typeof task.status === 'string' ? task.status : 'Pending';
    state.modal.baseType = FOLLOWUP_TYPES.has(task.type) ? 'Follow-Up' : (task.type || state.defaults.type);
    state.modal.followupType = FOLLOWUP_TYPES.has(task.type) ? task.type : 'Follow-Up';
    populateModalSelects();
    updateTypeButtons();
    if (modalTitle) modalTitle.textContent = 'Edit Task';
    if (modalTitleInput) modalTitleInput.value = task.title || '';
    if (modalNotes) modalNotes.value = task.description || '';
    if (modalDue) modalDue.value = formatDateInput(task.dueDate);
    setSelectValue(modalCategory, task.category || state.defaults.category);
    setSelectValue(modalPriority, task.priority || '');
    setSelectValue(modalStatus, task.status || state.defaults.status);
    if (modalSave) {
      modalSave.disabled = false;
      modalSave.textContent = 'Update Task';
    }
    if (modalComplete) {
      modalComplete.hidden = false;
      modalComplete.textContent =
        state.modal.currentTaskStatus === 'Completed' ? 'Mark as Pending' : 'Mark as Completed';
    }
    toggleModal(modalRoot, true);
    window.requestAnimationFrame(() => {
      if (modalTitleInput) modalTitleInput.focus();
    });
  }

  function openTaskEditorById(taskId) {
    const task = findTaskById(taskId);
    if (!task) {
      console.warn('[task-page] could not find task', taskId);
      return;
    }
    openModalForTask(task);
  }

  function closeModal() {
    if (!modalRoot) return;
    toggleModal(modalRoot, false);
    state.modal.submitting = false;
    state.modal.currentTaskId = null;
    state.modal.currentTaskStatus = 'Pending';
    state.modal.mode = 'create';
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

  async function updateTaskRequest(taskId, payload) {
    const base = endpoints.update || '/api/tasks';
    const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(taskId)}`;
    return fetchJson(url, {
      method: 'PATCH',
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

    const isEdit = Boolean(state.modal.currentTaskId);
    const request = isEdit
      ? updateTaskRequest(state.modal.currentTaskId, payload)
      : createTask(payload);

    request
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

  function handleModalComplete(event) {
    event.preventDefault();
    if (!state.modal.currentTaskId) return;
    const nextStatus =
      state.modal.currentTaskStatus === 'Completed' ? 'Pending' : 'Completed';
    setModalSubmitting(true);
    updateTaskRequest(state.modal.currentTaskId, { status: nextStatus })
      .then(() => {
        closeModal();
        refreshOverview();
      })
      .catch((err) => {
        console.error('[task-page] failed to update task status', err);
        setModalError(modalRoot, err.message || 'Unable to update the task status. Please try again.');
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

  if (modalStatus) {
    modalStatus.addEventListener('change', () => {
      if (state.modal.mode === 'edit' && modalStatus.value) {
        state.modal.currentTaskStatus = modalStatus.value;
        if (modalComplete) {
          modalComplete.textContent =
            modalStatus.value === 'Completed' ? 'Mark as Pending' : 'Mark as Completed';
        }
      }
    });
  }

  document.addEventListener('click', (event) => {
    const collapseToggle = event.target.closest('[data-task-collapse-toggle]');
    if (collapseToggle) {
      event.preventDefault();
      const host = collapseToggle.closest('details');
      if (host) {
        host.open = !host.open;
        collapseToggle.setAttribute('aria-expanded', host.open ? 'true' : 'false');
      }
      return;
    }

    const filterTarget = event.target.closest('[data-task-filter-group]');
    if (filterTarget) {
      const currentId = state.activeFilter
        ? buildFilterId(state.activeFilter.type, state.activeFilter.idValue || state.activeFilter.value || 'all')
        : '';
      handleFilterClick(filterTarget, event, (newFilter) => {
        if (!newFilter) {
          setActiveFilter(null);
          return;
        }
        const nextId = buildFilterId(newFilter.type, newFilter.idValue || newFilter.value || 'all');
        if (currentId && currentId === nextId) {
          setActiveFilter(null);
        } else {
          setActiveFilter(newFilter);
        }
      });
      return;
    }

    const linkTarget = event.target.closest('a.task-linked-link');
    if (linkTarget) {
      // Allow default navigation but prevent row modal from opening
      return;
    }

    const taskRow = event.target.closest('[data-task-id]');
    if (taskRow) {
      const taskId = taskRow.dataset.taskId;
      if (taskId) {
        event.preventDefault();
        openTaskEditorById(taskId);
      }
      return;
    }

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

  if (modalComplete) {
    modalComplete.addEventListener('click', handleModalComplete);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalRoot && !modalRoot.hidden) {
      closeModal();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-task-id]');
    if (!row) return;
    const isInteractive =
      event.target.tagName === 'BUTTON' ||
      event.target.tagName === 'A' ||
      event.target.tagName === 'INPUT' ||
      event.target.closest('button') ||
      event.target.closest('a') ||
      event.target.closest('input');
    if (isInteractive) return;
    event.preventDefault();
    const taskId = row.dataset.taskId;
    if (taskId) openTaskEditorById(taskId);
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
