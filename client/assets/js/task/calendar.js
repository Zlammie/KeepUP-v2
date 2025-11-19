const dataEl = document.getElementById('__TASK_CALENDAR_DATA__');

if (!dataEl) {
  console.warn('[task-calendar] missing data payload');
} else {
  let parsed = {};
  try {
    parsed = JSON.parse(dataEl.textContent || '{}');
  } catch (err) {
    console.error('[task-calendar] failed to parse data payload', err);
    parsed = {};
  }

  const today = startOfDay(new Date());
  const allTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const normalizedTasks = allTasks
    .map((task) => normalizeTask(task))
    .filter((task) => task.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime()))
    .sort((a, b) => a.dueDate - b.dueDate);

  const state = {
    view: getDefaultView(),
    focusDate: today,
    filters: {
      status: '',
      category: '',
      priority: ''
    }
  };

  const elements = {
    grid: document.getElementById('task-calendar-grid'),
    rangeLabel: document.getElementById('calendar-range-label'),
    rangeSubtitle: document.getElementById('calendar-range-subtitle'),
    visibleCount: document.getElementById('calendar-visible-count'),
    taskList: document.getElementById('calendar-task-list'),
    taskEmpty: document.getElementById('calendar-task-empty'),
    focusDateInput: document.getElementById('calendar-focus-date'),
    prevBtn: document.getElementById('calendar-prev'),
    nextBtn: document.getElementById('calendar-next'),
    todayBtn: document.getElementById('calendar-today'),
    clearFiltersBtn: document.getElementById('calendar-clear-filters'),
    filterStatus: document.getElementById('calendar-filter-status'),
    filterCategory: document.getElementById('calendar-filter-category'),
    filterPriority: document.getElementById('calendar-filter-priority'),
    viewButtons: Array.from(document.querySelectorAll('.calendar-view-btn'))
  };

  if (elements.focusDateInput) {
    elements.focusDateInput.value = formatInputDate(state.focusDate);
    elements.focusDateInput.addEventListener('change', (event) => {
      const { value } = event.target;
      if (!value) return;
      const next = parseInputDate(value);
      if (next) {
        state.focusDate = startOfDay(next);
        render();
      }
    });
  }

  if (elements.prevBtn) {
    elements.prevBtn.addEventListener('click', () => {
      shiftFocus(-1);
    });
  }

  if (elements.nextBtn) {
    elements.nextBtn.addEventListener('click', () => {
      shiftFocus(1);
    });
  }

  if (elements.todayBtn) {
    elements.todayBtn.addEventListener('click', () => {
      state.focusDate = today;
      if (elements.focusDateInput) {
        elements.focusDateInput.value = formatInputDate(today);
      }
      render();
    });
  }

  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view;
      if (!nextView || nextView === state.view) return;
      state.view = nextView;
      elements.viewButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
      render();
    });
  });

  const filterMap = [
    ['status', elements.filterStatus],
    ['category', elements.filterCategory],
    ['priority', elements.filterPriority]
  ];
  filterMap.forEach(([key, element]) => {
    if (!element) return;
    element.addEventListener('change', () => {
      state.filters[key] = element.value || '';
      render();
    });
  });

  if (elements.clearFiltersBtn) {
    elements.clearFiltersBtn.addEventListener('click', () => {
      filterMap.forEach(([key, element]) => {
        state.filters[key] = '';
        if (element) element.value = '';
      });
      render();
    });
  }

  render();

  function render() {
    if (!elements.grid) return;

    const range = getRange(state.view, state.focusDate);
    const tasksInRange = filterTasksInRange(range, normalizedTasks);
    const filteredTasks = applyFilters(tasksInRange, state.filters);

    updateRangeHeader(range, filteredTasks);
    renderCalendarGrid(range, filteredTasks);
    renderPlanningList(filteredTasks);
  }

  function shiftFocus(direction) {
    const next = new Date(state.focusDate);
    if (state.view === 'month') {
      next.setMonth(next.getMonth() + direction);
    } else if (state.view === 'week') {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setDate(next.getDate() + direction);
    }
    state.focusDate = startOfDay(next);
    if (elements.focusDateInput) {
      elements.focusDateInput.value = formatInputDate(state.focusDate);
    }
    render();
  }

  function renderCalendarGrid(range, tasks) {
    elements.grid.innerHTML = '';
    if (!tasks) return;

    if (state.view === 'day') {
      renderDayFocus(range, tasks);
      return;
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const headerFragment = document.createDocumentFragment();
    weekdays.forEach((day) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-weekday';
      cell.textContent = day;
      headerFragment.appendChild(cell);
    });

    const gridFragment = document.createDocumentFragment();
    let cursor = new Date(range.start);
    while (cursor < range.end) {
      gridFragment.appendChild(createDayCell(cursor, tasks, {
        outside: state.view === 'month' && cursor.getMonth() !== state.focusDate.getMonth(),
        showEmptyPlaceholder: state.view === 'week'
      }));
      cursor = addDays(cursor, 1);
    }

    const gridContainer = document.createElement('div');
    gridContainer.className =
      state.view === 'month' ? 'calendar-month-grid' : 'calendar-week-grid';
    gridContainer.appendChild(headerFragment);
    gridContainer.appendChild(gridFragment);
    elements.grid.appendChild(gridContainer);
  }

  function renderDayFocus(range, tasks) {
    const dayGrid = document.createElement('div');
    dayGrid.className = 'calendar-day-grid';

    const card = document.createElement('div');
    card.className = 'calendar-day-focus';

    const header = document.createElement('div');
    header.className = 'calendar-day-focus__header';

    const dateBlock = document.createElement('div');
    const dateTitle = document.createElement('div');
    dateTitle.className = 'fw-semibold';
    dateTitle.textContent = formatFullDate(range.start);
    const dateSubtitle = document.createElement('div');
    dateSubtitle.className = 'text-muted small';
    dateSubtitle.textContent = formatWeekday(range.start);
    dateBlock.appendChild(dateTitle);
    dateBlock.appendChild(dateSubtitle);

    const badge = document.createElement('span');
    badge.className = 'badge bg-primary-subtle text-primary-emphasis';
    badge.textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;

    header.appendChild(dateBlock);
    header.appendChild(badge);
    card.appendChild(header);

    const taskContainer = document.createElement('div');
    taskContainer.className = 'calendar-day-focus__tasks';

    if (!tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-day-focus__empty mb-0';
      empty.textContent = 'No tasks scheduled for this day.';
      taskContainer.appendChild(empty);
    } else {
      tasks.forEach((task) => {
        const row = document.createElement('div');
        const statusClass = getStatusClass(task);
        row.className = `calendar-day-focus__task calendar-day-focus__task--${statusClass}`;

        const title = document.createElement('span');
        title.className = 'task-list-heading';
        title.textContent = task.title;
        row.appendChild(title);

        const dueMeta = document.createElement('span');
        dueMeta.className = 'task-list-meta';
        dueMeta.textContent = `${formatTime(task.dueDate)} · ${task.status}`;
        row.appendChild(dueMeta);

        const categoryMeta = document.createElement('span');
        categoryMeta.className = 'task-list-meta';
        categoryMeta.textContent = task.linkedLabel
          ? `${task.category} · ${task.linkedLabel}`
          : task.category;
        row.appendChild(categoryMeta);

        taskContainer.appendChild(row);
      });
    }

    card.appendChild(taskContainer);
    dayGrid.appendChild(card);
    elements.grid.appendChild(dayGrid);
  }

  function renderPlanningList(tasks) {
    if (!elements.taskList || !elements.taskEmpty) return;
    elements.taskList.innerHTML = '';

    if (!tasks.length) {
      elements.taskEmpty.hidden = false;
      if (elements.visibleCount) {
        elements.visibleCount.textContent = '0 tasks';
      }
      return;
    }

    elements.taskEmpty.hidden = true;
    if (elements.visibleCount) {
      elements.visibleCount.textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
    }

    const fragment = document.createDocumentFragment();
    tasks
      .slice()
      .sort((a, b) => a.dueDate - b.dueDate)
      .forEach((task) => {
        const item = document.createElement('div');
        item.className = 'list-group-item';

        const titleRow = document.createElement('div');
        titleRow.className = 'd-flex justify-content-between align-items-center';

        const title = document.createElement('span');
        title.className = 'task-list-heading';
        title.textContent = task.title;

        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${getBadgeClass(task)}`;
        statusBadge.textContent = task.status;

        titleRow.appendChild(title);
        titleRow.appendChild(statusBadge);
        item.appendChild(titleRow);

        const meta = document.createElement('div');
        meta.className = 'task-list-meta';
        meta.textContent = formatDateTime(task.dueDate);
        item.appendChild(meta);

        const tags = document.createElement('div');
        tags.className = 'task-list-tags';
        const categoryTag = document.createElement('span');
        categoryTag.className = 'badge bg-light text-dark border';
        categoryTag.textContent = task.category;
        tags.appendChild(categoryTag);

        const priorityTag = document.createElement('span');
        priorityTag.className = 'badge bg-light text-dark border';
        priorityTag.textContent = task.priority;
        tags.appendChild(priorityTag);

        if (task.linkedLabel) {
          const linkTag = document.createElement('span');
          linkTag.className = 'badge bg-light text-dark border';
          linkTag.textContent = task.linkedLabel;
          tags.appendChild(linkTag);
        }

        item.appendChild(tags);
        fragment.appendChild(item);
      });

    elements.taskList.appendChild(fragment);
  }

  function createDayCell(date, tasks, options = {}) {
    const dayKey = formatDayKey(date);
    const tasksForDay = tasks.filter((task) => task.dayKey === dayKey);
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (options.outside) {
      cell.classList.add('calendar-day--outside');
    }

    const header = document.createElement('div');
    header.className = 'calendar-day__header';
    const dayNumber = document.createElement('span');
    dayNumber.textContent = date.getDate();
    header.appendChild(dayNumber);

    if (tasksForDay.length) {
      const count = document.createElement('span');
      count.className = 'calendar-day__count';
      count.textContent = `${tasksForDay.length}`;
      header.appendChild(count);
    }

    cell.appendChild(header);

    const taskContainer = document.createElement('div');
    taskContainer.className = 'calendar-day__tasks';

    if (!tasksForDay.length && options.showEmptyPlaceholder) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day__more';
      empty.textContent = 'No tasks';
      taskContainer.appendChild(empty);
    } else {
      tasksForDay.slice(0, 3).forEach((task) => {
        const pill = document.createElement('span');
        pill.className = `calendar-pill calendar-pill--${getStatusClass(task)}`;
        pill.textContent = task.title;
        taskContainer.appendChild(pill);
      });

      if (tasksForDay.length > 3) {
        const more = document.createElement('div');
        more.className = 'calendar-day__more';
        more.textContent = `+${tasksForDay.length - 3} more`;
        taskContainer.appendChild(more);
      }
    }

    cell.appendChild(taskContainer);
    return cell;
  }

  function updateRangeHeader(range, tasks) {
    if (elements.rangeLabel) elements.rangeLabel.textContent = range.label;

    if (elements.rangeSubtitle) {
      const overdue = tasks.filter((task) => isOverdue(task)).length;
      const dueSoon = tasks.filter((task) => isDueSoon(task)).length;
      const completed = tasks.filter((task) => task.status === 'Completed').length;
      const pieces = [`${tasks.length} scheduled`];
      if (overdue) pieces.push(`${overdue} overdue`);
      if (dueSoon) pieces.push(`${dueSoon} due soon`);
      if (completed) pieces.push(`${completed} completed`);
      elements.rangeSubtitle.textContent = pieces.join(' • ') || 'Use the controls to move across time.';
    }
  }
}

function normalizeTask(task) {
  const dueDate = task && task.dueDate ? new Date(task.dueDate) : null;
  const isValid = dueDate && !Number.isNaN(dueDate.getTime());
  const safeDue = isValid ? dueDate : null;
  const normalized = {
    id: task && task.id ? String(task.id) : '',
    title: task && task.title ? task.title : 'Task',
    category: task && task.category ? task.category : 'Custom',
    status: task && task.status ? task.status : 'Pending',
    priority: task && task.priority ? task.priority : 'Medium',
    linkedLabel: task && task.linkedLabel ? task.linkedLabel : '',
    description: task && task.description ? task.description : '',
    dueDate: safeDue
  };

  if (safeDue) {
    normalized.dayKey = formatDayKey(safeDue);
  } else {
    normalized.dayKey = '';
  }

  return normalized;
}

function getRange(view, focusDate) {
  const start = startOfDay(focusDate);
  if (view === 'day') {
    const end = addDays(start, 1);
    return {
      start,
      end,
      label: formatFullDate(start)
    };
  }

  if (view === 'week') {
    const weekStart = startOfWeek(start);
    const weekEnd = addDays(weekStart, 7);
    return {
      start: weekStart,
      end: weekEnd,
      label: formatWeekRange(weekStart, addDays(weekEnd, -1))
    };
  }

  const firstOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  const lastOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const gridEnd = addDays(endOfWeek(lastOfMonth), 1);
  return {
    start: gridStart,
    end: gridEnd,
    label: firstOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  };
}

function filterTasksInRange(range, tasks) {
  const { start, end } = range;
  return tasks.filter((task) => {
    if (!task.dueDate) return false;
    return task.dueDate >= start && task.dueDate < end;
  });
}

function applyFilters(tasks, filters) {
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.category && task.category !== filters.category) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    return true;
  });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, -day);
}

function endOfWeek(date) {
  const start = startOfWeek(date);
  return addDays(start, 6);
}

function formatDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatFullDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatWeekday(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

function formatWeekRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? 'short' : 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  });
  const yearLabel = sameYear ? start.getFullYear() : `${start.getFullYear()} / ${end.getFullYear()}`;
  return `${startLabel} – ${endLabel}, ${yearLabel}`;
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseInputDate(value) {
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getDefaultView() {
  const activeButton = document.querySelector('.calendar-view-btn.active');
  return activeButton?.dataset?.view || 'month';
}

function getBadgeClass(task) {
  if (task.status === 'Completed') return 'bg-success-subtle text-success-emphasis';
  if (isOverdue(task)) return 'bg-danger-subtle text-danger-emphasis';
  if (isDueSoon(task)) return 'bg-warning-subtle text-warning-emphasis';
  return 'bg-secondary-subtle text-secondary-emphasis';
}

function getStatusClass(task) {
  if (task.status === 'Completed') return 'completed';
  if (isOverdue(task)) return 'overdue';
  if (isDueSoon(task)) return 'due-soon';
  return 'default';
}

function isOverdue(task) {
  if (!task.dueDate) return false;
  return task.status !== 'Completed' && task.dueDate < new Date();
}

function isDueSoon(task) {
  if (!task.dueDate) return false;
  if (task.status === 'Completed') return false;
  const now = new Date();
  const diff = task.dueDate.getTime() - now.getTime();
  const threeDays = 1000 * 60 * 60 * 24 * 3;
  return diff >= 0 && diff <= threeDays;
}
