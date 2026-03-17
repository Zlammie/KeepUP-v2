import { fmt } from './utils.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentMonthKey(offset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function deriveRemainingLots(c) {
  if (typeof c.remainingLots === 'number') return c.remainingLots;
  if (typeof c.totalLots === 'number' && typeof c.soldLots === 'number') {
    return Math.max(c.totalLots - c.soldLots, 0);
  }
  if (typeof c.totalLots === 'number') return c.totalLots;
  return 0;
}

function deriveQMI(c) {
  if (typeof c.qmi === 'number') return c.qmi;
  if (typeof c.quickMoveIns === 'number') return c.quickMoveIns;
  if (typeof c.quickMoveInLots === 'number') return c.quickMoveInLots;
  if (Array.isArray(c.monthlyMetrics) && c.monthlyMetrics.length) {
    const last = c.monthlyMetrics.at(-1);
    if (typeof last?.qmi === 'number') return last.qmi;
    if (typeof last?.inventory === 'number') return last.inventory;
    if (typeof last?.quickMoveInLots === 'number') return last.quickMoveInLots;
  }
  return 0;
}

function deriveLotSize(c) {
  return c.lotSize ?? c.avgLotSize ?? '';
}

function latestMonthlyMonth(c) {
  const values = Array.isArray(c?.monthlyMetrics) ? c.monthlyMetrics : [];
  return values.reduce((latest, entry) => {
    const month = typeof entry?.month === 'string' ? entry.month.trim() : '';
    if (!month) return latest;
    return !latest || month > latest ? month : latest;
  }, '');
}

function getLastUpdatedLabel(c) {
  const latestMonth = latestMonthlyMonth(c);
  if (!latestMonth) {
    return '<span class="text-muted">Not updated</span>';
  }

  const updatedLabel = formatDate(c?.updatedAt);
  if (updatedLabel) return escapeHtml(updatedLabel);

  const [year, month] = latestMonth.split('-').map(Number);
  const fallbackDate = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(fallbackDate.getTime())) return escapeHtml(latestMonth);
  return escapeHtml(fallbackDate.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  }));
}

function getStatusMeta(c) {
  const latestMonth = latestMonthlyMonth(c);
  if (!latestMonth) {
    return {
      label: 'No monthly info',
      className: 'manage-status manage-status--none'
    };
  }

  const current = currentMonthKey(0);
  const previous = currentMonthKey(-1);

  // Simple review-state heuristic for the manage table:
  // current month = up to date, previous month = due this month, older = overdue.
  if (latestMonth >= current) {
    return {
      label: 'Up to date',
      className: 'manage-status manage-status--up-to-date'
    };
  }

  if (latestMonth === previous) {
    return {
      label: 'Due this month',
      className: 'manage-status manage-status--due'
    };
  }

  return {
    label: 'Overdue',
    className: 'manage-status manage-status--overdue'
  };
}

function renderLinkedCommunities(linkedCommunities) {
  if (!Array.isArray(linkedCommunities) || !linkedCommunities.length) return '';
  const names = linkedCommunities.map((community) => escapeHtml(community?.name || '')).filter(Boolean);
  if (!names.length) return '';
  return `<div class="manage-competition__linked">Linked to: ${names.join(', ')}</div>`;
}

export function getCommunityFilterOptions(comps) {
  const optionMap = new Map();
  (Array.isArray(comps) ? comps : []).forEach((competition) => {
    (competition?.linkedCommunities || []).forEach((community) => {
      const id = String(community?.id || '').trim();
      const name = String(community?.name || '').trim();
      if (!id || !name) return;
      optionMap.set(id, { id, name });
    });
  });
  return [...optionMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCompetitionsByCommunity(comps, communityId) {
  const targetId = String(communityId || '').trim();
  if (!targetId) return Array.isArray(comps) ? comps : [];
  return (Array.isArray(comps) ? comps : []).filter((competition) =>
    (competition?.linkedCommunities || []).some((community) => {
      const id = String(community?.id || community?._id || '').trim();
      return id === targetId;
    })
  );
}

export function renderFilterBar(options, selectedCommunityId) {
  const items = Array.isArray(options) ? options : [];
  return `
    <div class="manage-competition__filters card">
      <div class="manage-competition__filter-group">
        <label for="communityFilter" class="form-label mb-1">Linked Community</label>
        <select id="communityFilter" class="form-select form-select-sm">
          <option value="">All Communities</option>
          ${items.map((option) => `
            <option value="${escapeHtml(option.id)}"${option.id === selectedCommunityId ? ' selected' : ''}>
              ${escapeHtml(option.name)}
            </option>
          `).join('')}
        </select>
      </div>
    </div>
  `;
}

export function renderTable(comps) {
  if (!Array.isArray(comps) || !comps.length) {
    return '<p class="text-muted mb-0">No competitions match this filter.</p>';
  }

  let html = `
  <div class="table-responsive">
    <table id="compsTable" class="table table-striped align-middle manage-competition-table">
      <thead>
        <tr>
          <th class="actions-col">Actions</th>
          <th>Community</th>
          <th>Builder</th>
          <th>City</th>
          <th class="num">Remaining Lots</th>
          <th class="num">QMI</th>
          <th class="num">Lot Size</th>
          <th>Last Updated</th>
          <th>Status</th>
          <th class="del-col text-end">Delete</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const c of comps) {
    const remaining = deriveRemainingLots(c);
    const qmi = deriveQMI(c);
    const lotSize = deriveLotSize(c);
    const status = getStatusMeta(c);

    html += `
      <tr data-id="${escapeHtml(c._id)}">
        <td class="actions-col">
          <a href="/competition-details/${escapeHtml(c._id)}" class="btn btn-sm btn-primary">View</a>
        </td>
        <td>
          <div class="manage-competition__name">${escapeHtml(c.communityName ?? '')}</div>
          ${renderLinkedCommunities(c.linkedCommunities)}
        </td>
        <td>${escapeHtml(c.builderName ?? '')}</td>
        <td>${escapeHtml(c.city ?? '')}</td>
        <td class="num">${escapeHtml(fmt(remaining))}</td>
        <td class="num">${escapeHtml(fmt(qmi))}</td>
        <td class="num">${escapeHtml(lotSize ?? '')}</td>
        <td>${getLastUpdatedLabel(c)}</td>
        <td><span class="${status.className}">${escapeHtml(status.label)}</span></td>
        <td class="del-col text-end">
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${escapeHtml(c._id)}" title="Delete competition">×</button>
        </td>
      </tr>
    `;
  }

  html += '</tbody></table></div>';
  return html;
}
