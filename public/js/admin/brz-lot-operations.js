(function () {
  const STORAGE_KEY = 'brzLotOpsBulkStatus';
  const dataEl = document.getElementById('brzLotOpsData');
  if (!dataEl) return;

  let payload = {};
  try {
    payload = JSON.parse(dataEl.textContent || '{}');
  } catch {
    payload = {};
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const initialFilters = payload.initialFilters && typeof payload.initialFilters === 'object'
    ? payload.initialFilters
    : {};

  const selectAllEl = document.getElementById('brzLotOpsSelectAll');
  const tableBodyEl = document.getElementById('brzLotOpsBody');
  const tableWrapEl = document.querySelector('.brz-lot-ops-table-wrap');
  const tableEl = tableBodyEl ? tableBodyEl.closest('table') : null;
  const communityFilterEl = document.getElementById('brzLotOpsCommunity');
  const visibleCountEl = document.getElementById('brzLotOpsVisibleCount');
  const summaryReadyEl = document.getElementById('brzLotOpsSummaryReady');
  const summaryWarningEl = document.getElementById('brzLotOpsSummaryWarning');
  const summaryIncompleteEl = document.getElementById('brzLotOpsSummaryIncomplete');
  const summaryPublishedEl = document.getElementById('brzLotOpsSummaryPublished');
  const summaryNeedsSyncEl = document.getElementById('brzLotOpsSummaryNeedsSync');
  const statusButtons = Array.from(document.querySelectorAll('.brz-lot-ops-status-btn'));
  const publishedButtons = Array.from(document.querySelectorAll('.brz-lot-ops-published-btn'));
  const readinessButtons = Array.from(document.querySelectorAll('.brz-lot-ops-readiness-btn'));
  const selectionCountEl = document.getElementById('brzLotOpsSelectionCount');
  const actionStatusEl = document.getElementById('brzLotOpsActionStatus');
  const bulkPublishButton = document.getElementById('brzLotOpsBulkPublishBtn');
  const bulkUnpublishButton = document.getElementById('brzLotOpsBulkUnpublishBtn');
  const bulkPublishAndSyncButton = document.getElementById('brzLotOpsBulkPublishAndSyncBtn');
  const bulkUnpublishAndSyncButton = document.getElementById('brzLotOpsBulkUnpublishAndSyncBtn');

  if (
    !selectAllEl
    || !tableBodyEl
    || !communityFilterEl
    || !visibleCountEl
    || !summaryReadyEl
    || !summaryWarningEl
    || !summaryIncompleteEl
    || !summaryPublishedEl
    || !summaryNeedsSyncEl
    || !selectionCountEl
    || !actionStatusEl
    || !bulkPublishButton
    || !bulkUnpublishButton
    || !bulkPublishAndSyncButton
    || !bulkUnpublishAndSyncButton
  ) {
    return;
  }

  const STATUS_ORDER = Object.freeze({
    incomplete: 0,
    warning: 1,
    ready: 2
  });

  const normalizeText = (value) => String(value || '').trim().toLowerCase();
  const normalizeStatus = (value) => normalizeText(value);

  const toDateMs = (value) => {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const readinessLabel = (status) => {
    if (status === 'ready') return 'Ready';
    if (status === 'warning') return 'Needs Info';
    if (status === 'incomplete') return 'Incomplete';
    return 'Unknown';
  };

  const statusClass = (status) => {
    const normalized = normalizeText(status);
    if (normalized.includes('coming')) return 'status-pill--coming-soon';
    if (normalized.includes('spec')) return 'status-pill--spec';
    if (normalized.includes('available')) return 'status-pill--available';
    if (normalized.includes('hold')) return 'status-pill--hold';
    if (normalized.includes('model')) return 'status-pill--model';
    if (normalized.includes('sold')) return 'status-pill--sold';
    if (normalized.includes('close')) return 'status-pill--closed';
    return 'status-pill--default';
  };

  const ensureRowKey = (row) => {
    const key = String(row?.key || `${row?.communityId || ''}:${row?.lotId || ''}`).trim();
    row.key = key;
    return key;
  };

  const allRows = rows
    .map((row) => (row && typeof row === 'object' ? row : null))
    .filter(Boolean);
  allRows.forEach((row) => ensureRowKey(row));

  const rowsByKey = new Map(allRows.map((row) => [row.key, row]));

  const state = {
    filters: {
      communityId: '',
      status: 'all',
      published: 'all',
      readiness: 'all'
    },
    selectedKeys: new Set(),
    filteredRows: [],
    isSubmitting: false
  };

  const syncStickyGroupOffset = () => {
    if (!tableWrapEl || !tableEl) return;
    const thead = tableEl.querySelector('thead');
    if (!thead) return;
    const headHeight = Math.max(0, Math.ceil(thead.getBoundingClientRect().height || 0));
    tableWrapEl.style.setProperty('--brz-table-head-h', `${headHeight}px`);
  };

  const setStatusMessage = (message, tone) => {
    actionStatusEl.textContent = message || '';
    actionStatusEl.classList.remove('text-muted', 'text-success', 'text-danger');
    if (tone === 'success') {
      actionStatusEl.classList.add('text-success');
      return;
    }
    if (tone === 'error') {
      actionStatusEl.classList.add('text-danger');
      return;
    }
    actionStatusEl.classList.add('text-muted');
  };

  const readFlashStatus = () => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(STORAGE_KEY);
      const parsed = JSON.parse(raw);
      setStatusMessage(parsed.message || '', parsed.tone || 'muted');
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  const writeFlashStatus = (message, tone) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ message, tone }));
    } catch {
      // no-op
    }
  };

  const summarizeRows = (items) => items.reduce((acc, row) => {
    acc.total += 1;
    if (row?.readiness?.status === 'ready') acc.ready += 1;
    else if (row?.readiness?.status === 'warning') acc.warning += 1;
    else acc.incomplete += 1;

    if (row?.published) acc.published += 1;
    if (row?.needsSync) acc.needsSync += 1;
    return acc;
  }, {
    total: 0,
    ready: 0,
    warning: 0,
    incomplete: 0,
    published: 0,
    needsSync: 0
  });

  const sortRows = (items) => (
    items.slice().sort((left, right) => {
      const communityCompare = String(left.communityName || '').localeCompare(String(right.communityName || ''));
      if (communityCompare !== 0) return communityCompare;

      const leftSeverity = STATUS_ORDER[left?.readiness?.status] ?? 99;
      const rightSeverity = STATUS_ORDER[right?.readiness?.status] ?? 99;
      if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;

      const leftScore = Number.isFinite(left?.readiness?.score) ? left.readiness.score : 100;
      const rightScore = Number.isFinite(right?.readiness?.score) ? right.readiness.score : 100;
      if (leftScore !== rightScore) return leftScore - rightScore;

      const leftUpdated = toDateMs(left.updatedAt);
      const rightUpdated = toDateMs(right.updatedAt);
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;

      return String(left.addressLabel || '').localeCompare(String(right.addressLabel || ''));
    })
  );

  const filterMatches = (row) => {
    if (state.filters.communityId && String(row.communityId || '') !== state.filters.communityId) return false;

    if (state.filters.status !== 'all') {
      const rowStatus = normalizeStatus(row.status);
      if (rowStatus !== state.filters.status) return false;
    }

    if (state.filters.published === 'published' && !row.published) return false;
    if (state.filters.published === 'unpublished' && row.published) return false;

    if (state.filters.readiness !== 'all' && String(row?.readiness?.status || '') !== state.filters.readiness) {
      return false;
    }

    return true;
  };

  const groupRows = (items) => {
    const groups = [];
    const byCommunityId = new Map();

    items.forEach((row) => {
      const communityId = String(row.communityId || '').trim();
      if (!communityId) return;

      let group = byCommunityId.get(communityId);
      if (!group) {
        group = {
          communityId,
          communityName: row.communityName || 'Community',
          communityLocation: row.communityLocation || '',
          rows: [],
          counts: {
            total: 0,
            ready: 0,
            warning: 0,
            incomplete: 0,
            published: 0,
            needsSync: 0
          },
          selectableCounts: {
            ready: 0,
            readyAndWarning: 0,
            published: 0
          }
        };
        byCommunityId.set(communityId, group);
        groups.push(group);
      }

      group.rows.push(row);
      group.counts.total += 1;
      if (row.published) {
        group.counts.published += 1;
        group.selectableCounts.published += 1;
      }
      if (row.needsSync) group.counts.needsSync += 1;

      if (row?.readiness?.status === 'ready') {
        group.counts.ready += 1;
        group.selectableCounts.ready += 1;
        group.selectableCounts.readyAndWarning += 1;
      } else if (row?.readiness?.status === 'warning') {
        group.counts.warning += 1;
        group.selectableCounts.readyAndWarning += 1;
      } else {
        group.counts.incomplete += 1;
      }
    });

    return groups;
  };

  const createElement = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const createActionsCell = (row) => {
    const td = createElement('td', 'listings-actions-col');
    const wrap = createElement('div', 'table-action-buttons listings-actions-icons');

    const icons = [
      { action: 'task', icon: '/assets/icons/add_task.svg', label: 'Manage tasks' },
      { action: 'flag', icon: '/assets/icons/exclamation.svg', label: 'Flag lot' },
      { action: 'comment', icon: '/assets/icons/comment.svg', label: 'Comment on lot' }
    ];

    icons.forEach((item) => {
      const link = createElement('a', 'table-icon-btn');
      link.href = row.listingDetailsUrl || '#';
      link.dataset.action = item.action;
      link.setAttribute('aria-label', `${item.label} for ${row.addressLabel || 'lot'}`);
      const img = createElement('img');
      img.src = item.icon;
      img.alt = '';
      link.appendChild(img);
      wrap.appendChild(link);
    });

    td.appendChild(wrap);
    return td;
  };

  const createViewCell = (row) => {
    const td = createElement('td', 'listings-view-col brz-col-view');
    const link = createElement('a', 'btn btn-outline-primary btn-sm listings-view-btn', 'View');
    link.href = row.listingDetailsUrl || '#';
    td.appendChild(link);
    return td;
  };

  const createGroupRow = (group) => {
    const tr = createElement('tr', 'brz-lot-ops-group-row');
    const td = createElement('td');
    td.colSpan = 11;

    const shell = createElement('div', 'd-flex justify-content-between align-items-center flex-wrap gap-2');
    const left = createElement('div');
    const name = createElement('div', 'brz-lot-ops-group-name', group.communityName || 'Community');
    left.appendChild(name);
    const metaParts = [];
    if (group.communityLocation) metaParts.push(group.communityLocation);
    metaParts.push(`Ready ${group.counts.ready}`);
    metaParts.push(`Published ${group.counts.published}`);
    metaParts.push(`Needs Info ${group.counts.warning}`);
    metaParts.push(`Incomplete ${group.counts.incomplete}`);
    metaParts.push(`Needs Sync ${group.counts.needsSync}`);
    left.appendChild(createElement('div', 'brz-lot-ops-group-meta', metaParts.join(' | ')));

    const right = createElement('div', 'brz-lot-ops-group-actions');
    const buttons = [
      {
        label: `Select all Ready (${group.selectableCounts.ready})`,
        className: 'btn btn-outline-success btn-sm',
        action: 'select-ready',
        disabled: group.selectableCounts.ready < 1
      },
      {
        label: `Select Ready + Needs Info (${group.selectableCounts.readyAndWarning})`,
        className: 'btn btn-outline-primary btn-sm',
        action: 'select-ready-warning',
        disabled: group.selectableCounts.readyAndWarning < 1
      },
      {
        label: 'Clear selection',
        className: 'btn btn-outline-secondary btn-sm',
        action: 'clear-selection',
        disabled: false
      },
      {
        label: 'Publish Ready to BRZ',
        className: 'btn btn-success btn-sm',
        action: 'publish-ready-sync',
        disabled: group.selectableCounts.ready < 1
      },
      {
        label: 'Publish Ready + Needs Info to BRZ',
        className: 'btn btn-outline-success btn-sm',
        action: 'publish-ready-warning-sync',
        disabled: group.selectableCounts.readyAndWarning < 1
      },
      {
        label: 'Unpublish Published + Publish to BRZ',
        className: 'btn btn-outline-danger btn-sm',
        action: 'unpublish-published-sync',
        disabled: group.selectableCounts.published < 1
      }
    ];

    buttons.forEach((config) => {
      const button = createElement('button', config.className, config.label);
      button.type = 'button';
      button.dataset.communityAction = config.action;
      button.dataset.communityId = group.communityId;
      if (config.disabled) button.disabled = true;
      right.appendChild(button);
    });

    shell.appendChild(left);
    shell.appendChild(right);
    td.appendChild(shell);
    tr.appendChild(td);
    return tr;
  };

  const createRow = (row) => {
    const tr = createElement('tr');

    const selectTd = createElement('td', 'brz-lot-ops-col-select');
    const checkbox = createElement('input', 'form-check-input brz-lot-ops-row-select');
    checkbox.type = 'checkbox';
    checkbox.dataset.key = row.key;
    checkbox.checked = state.selectedKeys.has(row.key);
    checkbox.setAttribute('aria-label', `Select ${row.addressLabel || 'listing'}`);
    selectTd.appendChild(checkbox);

    const communityTd = createElement('td');
    communityTd.appendChild(createElement('div', 'brz-lot-ops-community', row.communityName || 'Community'));
    if (row.communityLocation) {
      communityTd.appendChild(createElement('div', 'brz-lot-ops-community-meta', row.communityLocation));
    }

    const listingInfoTd = createElement('td');
    listingInfoTd.appendChild(createElement('div', 'brz-lot-ops-listing-primary', row.addressLabel || 'Unnamed lot'));
    if (row.listingInfoSecondary) {
      listingInfoTd.appendChild(createElement('div', 'brz-lot-ops-listing-secondary', row.listingInfoSecondary));
    }
    if (row.cityStateZip) {
      listingInfoTd.appendChild(createElement('div', 'brz-lot-ops-listing-tertiary', row.cityStateZip));
    }

    const statusTd = createElement('td', 'brz-col-status');
    statusTd.appendChild(createElement('span', `status-pill ${statusClass(row.status)}`, row.status || 'Available'));

    const publishedTd = createElement('td', 'brz-col-published');
    publishedTd.appendChild(createElement(
      'span',
      `brz-published-badge ${row.published ? 'brz-published-badge--yes' : 'brz-published-badge--no'}`,
      row.published ? 'Published' : 'Not Published'
    ));

    const readinessTd = createElement('td', 'brz-col-readiness');
    readinessTd.appendChild(createElement(
      'span',
      `brz-readiness-pill brz-readiness-pill--${row?.readiness?.status || 'incomplete'}`,
      readinessLabel(row?.readiness?.status)
    ));

    const scoreTd = createElement('td');
    scoreTd.appendChild(createElement('span', 'fw-semibold', String(row?.readiness?.score ?? 0)));

    const missingTd = createElement('td', 'brz-lot-ops-missing-cell');
    if (Array.isArray(row.missingPreview) && row.missingPreview.length) {
      const grid = createElement('div', 'brz-missing-grid');
      const previewItems = row.missingPreview.slice(0, 4);
      const baseHiddenCount = Number(row.hiddenMissingCount || 0);
      const overflowFromPreview = Math.max(0, row.missingPreview.length - 4);
      const totalHiddenCount = baseHiddenCount + overflowFromPreview;

      const slots = totalHiddenCount > 0
        ? [...previewItems.slice(0, 3), `+${totalHiddenCount} more`]
        : previewItems;

      slots.slice(0, 4).forEach((item) => {
        const text = String(item || '');
        const isMore = totalHiddenCount > 0 && text.startsWith('+') && text.endsWith(' more');
        grid.appendChild(createElement(
          'span',
          `brz-missing-chip${isMore ? ' brz-missing-chip--more' : ''}`,
          text
        ));
      });

      missingTd.appendChild(grid);
      if (Number(row.warningCount || 0) > 0) {
        missingTd.appendChild(createElement(
          'div',
          'small text-muted mt-1',
          `${row.warningCount} warning${row.warningCount === 1 ? '' : 's'}`
        ));
      }
      if (row.missingTitle) {
        missingTd.title = row.missingTitle;
      }
    } else {
      missingTd.appendChild(createElement('span', 'text-muted', 'None'));
    }

    const syncTd = createElement('td');
    const syncWrap = createElement('div', 'brz-lot-ops-sync-cell');
    syncWrap.appendChild(createElement(
      'div',
      'brz-lot-ops-sync-text',
      `Sync: ${formatDate(row.syncDate) || 'Never'}`
    ));
    syncWrap.appendChild(createElement(
      'div',
      'brz-lot-ops-sync-text',
      `Upd: ${formatDate(row.updatedAt) || '-'}`
    ));
    if (row.publishedAt) {
      syncWrap.appendChild(createElement(
        'div',
        'brz-lot-ops-sync-text',
        `Pub: ${formatDate(row.publishedAt)}`
      ));
    }
    if (row.needsSync) {
      syncWrap.appendChild(createElement('span', 'brz-needs-sync-badge', 'Needs Sync'));
    }
    syncTd.appendChild(syncWrap);

    tr.appendChild(selectTd);
    tr.appendChild(createActionsCell(row));
    tr.appendChild(createViewCell(row));
    tr.appendChild(communityTd);
    tr.appendChild(listingInfoTd);
    tr.appendChild(statusTd);
    tr.appendChild(publishedTd);
    tr.appendChild(readinessTd);
    tr.appendChild(scoreTd);
    tr.appendChild(missingTd);
    tr.appendChild(syncTd);

    return tr;
  };

  const getVisibleCheckboxes = () => Array.from(tableBodyEl.querySelectorAll('.brz-lot-ops-row-select'));

  const syncSelectAllState = () => {
    const visibleCheckboxes = getVisibleCheckboxes();
    const visibleCount = visibleCheckboxes.length;
    const selectedVisibleCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;
    selectAllEl.disabled = visibleCount < 1 || state.isSubmitting;
    selectAllEl.checked = visibleCount > 0 && selectedVisibleCount === visibleCount;
    selectAllEl.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
  };

  const syncBulkButtonState = () => {
    const selectedCount = state.selectedKeys.size;
    const disableBulk = state.isSubmitting || selectedCount < 1;
    selectionCountEl.textContent = `${selectedCount} selected`;
    bulkPublishButton.disabled = disableBulk;
    bulkUnpublishButton.disabled = disableBulk;
    bulkPublishAndSyncButton.disabled = disableBulk;
    bulkUnpublishAndSyncButton.disabled = disableBulk;
    syncSelectAllState();
  };

  const render = () => {
    const filteredRows = sortRows(allRows.filter(filterMatches));
    state.filteredRows = filteredRows;
    const summary = summarizeRows(filteredRows);

    summaryReadyEl.textContent = summary.ready.toLocaleString();
    summaryWarningEl.textContent = summary.warning.toLocaleString();
    summaryIncompleteEl.textContent = summary.incomplete.toLocaleString();
    summaryPublishedEl.textContent = summary.published.toLocaleString();
    summaryNeedsSyncEl.textContent = summary.needsSync.toLocaleString();
    visibleCountEl.textContent = summary.total.toLocaleString();

    tableBodyEl.innerHTML = '';
    const groups = groupRows(filteredRows);
    if (!groups.length) {
      const tr = createElement('tr');
      const td = createElement('td', 'text-muted py-4 text-center', 'No lots match the current filters.');
      td.colSpan = 11;
      tr.appendChild(td);
      tableBodyEl.appendChild(tr);
      syncBulkButtonState();
      return;
    }

    groups.forEach((group) => {
      tableBodyEl.appendChild(createGroupRow(group));
      group.rows.forEach((row) => {
        tableBodyEl.appendChild(createRow(row));
      });
    });

    syncBulkButtonState();
    syncStickyGroupOffset();
  };

  const selectRows = (candidateRows, { replaceCommunity = '' } = {}) => {
    const targetRows = Array.isArray(candidateRows) ? candidateRows : [];
    if (replaceCommunity) {
      const replacementCommunityId = String(replaceCommunity);
      state.filteredRows.forEach((row) => {
        if (String(row.communityId || '') === replacementCommunityId) {
          state.selectedKeys.delete(row.key);
        }
      });
    }

    targetRows.forEach((row) => state.selectedKeys.add(row.key));
    render();
  };

  const clearCommunitySelection = (communityId) => {
    const targetCommunityId = String(communityId || '');
    state.filteredRows.forEach((row) => {
      if (String(row.communityId || '') === targetCommunityId) {
        state.selectedKeys.delete(row.key);
      }
    });
    render();
  };

  const getCommunityModeRows = (communityId, mode) => {
    const targetCommunityId = String(communityId || '');
    return state.filteredRows.filter((row) => {
      if (String(row.communityId || '') !== targetCommunityId) return false;
      if (mode === 'ready') return row?.readiness?.status === 'ready';
      if (mode === 'ready-warning') return ['ready', 'warning'].includes(row?.readiness?.status);
      if (mode === 'published') return Boolean(row.published);
      return false;
    });
  };

  const parseResponsePayload = async (response) => {
    const text = await response.text();
    if (!text) return { ok: response.ok };
    try {
      return JSON.parse(text);
    } catch {
      return { ok: response.ok, message: text || 'Request failed' };
    }
  };

  const getSelectedRows = () => (
    Array.from(state.selectedKeys)
      .map((key) => rowsByKey.get(key))
      .filter(Boolean)
  );

  const getIncompleteWarningMessage = (selectedRows) => {
    const incompleteRows = selectedRows.filter((row) => row?.readiness?.status === 'incomplete');
    if (!incompleteRows.length) return '';

    const missingItems = [];
    incompleteRows.forEach((row) => {
      const title = String(row.missingTitle || '');
      title
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          if (!missingItems.includes(item)) missingItems.push(item);
        });
    });

    const sample = missingItems.slice(0, 5).join(', ');
    const suffix = missingItems.length > 5 ? ', ...' : '';
    return `${incompleteRows.length} selected listing${incompleteRows.length === 1 ? ' is' : 's are'} INCOMPLETE${sample ? ` (missing: ${sample}${suffix})` : ''}. Mark published anyway?`;
  };

  const buildFlashMessage = (payloadData, defaultMessage) => {
    const parts = [payloadData?.message || defaultMessage || 'Update complete'];
    const publishInfo = payloadData?.inventoryPublish;

    if (publishInfo?.counts) {
      const counts = publishInfo.counts;
      const countParts = [];
      if (typeof counts.publishedCount === 'number') countParts.push(`${counts.publishedCount} published`);
      if (typeof counts.deactivatedCount === 'number') countParts.push(`${counts.deactivatedCount} deactivated`);
      if (typeof counts.skippedCount === 'number') countParts.push(`${counts.skippedCount} skipped`);
      if (countParts.length) {
        parts.push(`Inventory: ${countParts.join(', ')}.`);
      }
    }

    const warnings = Array.isArray(publishInfo?.warnings) ? publishInfo.warnings : [];
    if (warnings.length) {
      parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
      parts.push(`Warnings: ${warnings.slice(0, 3).join('; ')}`);
    }

    return parts.join(' ').trim();
  };

  const getSelectedCommunityCount = (selectedRows) => {
    const ids = new Set(
      selectedRows
        .map((row) => String(row.communityId || '').trim())
        .filter(Boolean)
    );
    return ids.size;
  };

  const submitBulkAction = async ({ action, alsoPublishInventory = false, selectedRows = null, customConfirmMessage = '' }) => {
    const rowsToSubmit = Array.isArray(selectedRows) && selectedRows.length ? selectedRows : getSelectedRows();
    if (!rowsToSubmit.length || state.isSubmitting) return;

    if (customConfirmMessage) {
      if (!window.confirm(customConfirmMessage)) return;
    } else {
      if (action === 'publish') {
        const warningMessage = getIncompleteWarningMessage(rowsToSubmit);
        if (warningMessage && !window.confirm(warningMessage)) return;
      }

      if (action === 'unpublish') {
        const unpublishConfirmed = window.confirm(
          `Unpublish ${rowsToSubmit.length} listing${rowsToSubmit.length === 1 ? '' : 's'}? This updates KeepUp flags first.`
        );
        if (!unpublishConfirmed) return;
      }

      if (alsoPublishInventory) {
        const communityCount = getSelectedCommunityCount(rowsToSubmit);
        const syncConfirmed = window.confirm(
          `This will publish inventory updates for ${communityCount} ${communityCount === 1 ? 'community' : 'communities'}. Continue?`
        );
        if (!syncConfirmed) return;
      }
    }

    state.isSubmitting = true;
    setStatusMessage(
      alsoPublishInventory ? 'Updating flags and publishing inventory...' : 'Updating publish flags...',
      'muted'
    );
    syncBulkButtonState();

    try {
      const response = await window.fetch('/admin/brz/readiness/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          alsoPublishInventory,
          items: rowsToSubmit.map((row) => ({
            communityId: row.communityId,
            lotId: row.lotId
          }))
        })
      });

      const responsePayload = await parseResponsePayload(response);
      if (!response.ok || !responsePayload?.ok) {
        if (responsePayload?.flagsUpdated) {
          writeFlashStatus(buildFlashMessage(responsePayload, 'Flags updated, but inventory publish failed.'), 'error');
          window.location.reload();
          return;
        }
        throw new Error(responsePayload?.message || 'Failed to update publish flags');
      }

      const skippedCount = Array.isArray(responsePayload.skipped) ? responsePayload.skipped.length : 0;
      const message = buildFlashMessage(responsePayload, 'Publish flags updated.');
      writeFlashStatus(skippedCount ? `${message} ${skippedCount} skipped.` : message, 'success');
      window.location.reload();
    } catch (err) {
      setStatusMessage(err?.message || 'Failed to update publish flags', 'error');
    } finally {
      state.isSubmitting = false;
      syncBulkButtonState();
    }
  };

  const setFilterButtonState = (buttons, selectedValue, attrName) => {
    buttons.forEach((button) => {
      button.classList.toggle('active', button.dataset[attrName] === selectedValue);
    });
  };

  const applyInitialFilters = () => {
    const normalizePublishedFilter = (value) => (['all', 'published', 'unpublished'].includes(value) ? value : 'all');
    const normalizeReadinessFilter = (value) => (['all', 'ready', 'warning', 'incomplete'].includes(value) ? value : 'all');
    const normalizeStatusFilter = (value) => (['all', 'available', 'spec', 'hold'].includes(value) ? value : 'all');

    const requestedCommunityId = String(initialFilters.communityId || '');
    const hasCommunity = Array.from(communityFilterEl.options).some((opt) => opt.value === requestedCommunityId);

    state.filters.communityId = hasCommunity ? requestedCommunityId : '';
    state.filters.status = normalizeStatusFilter(normalizeText(initialFilters.status));
    state.filters.published = normalizePublishedFilter(normalizeText(initialFilters.published));
    state.filters.readiness = normalizeReadinessFilter(normalizeText(initialFilters.readiness));

    communityFilterEl.value = state.filters.communityId;
    setFilterButtonState(statusButtons, state.filters.status, 'status');
    setFilterButtonState(publishedButtons, state.filters.published, 'published');
    setFilterButtonState(readinessButtons, state.filters.readiness, 'readiness');
  };

  selectAllEl.addEventListener('change', () => {
    const visibleCheckboxes = getVisibleCheckboxes();
    visibleCheckboxes.forEach((checkbox) => {
      const key = String(checkbox.dataset.key || '');
      if (!key) return;
      checkbox.checked = selectAllEl.checked;
      if (selectAllEl.checked) state.selectedKeys.add(key);
      else state.selectedKeys.delete(key);
    });
    syncBulkButtonState();
  });

  tableBodyEl.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.brz-lot-ops-row-select');
    if (!checkbox) return;
    const key = String(checkbox.dataset.key || '');
    if (!key) return;
    if (checkbox.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
    syncBulkButtonState();
  });

  tableBodyEl.addEventListener('click', (event) => {
    const actionButton = event.target.closest('button[data-community-action]');
    if (!actionButton || state.isSubmitting) return;

    const action = actionButton.dataset.communityAction;
    const communityId = actionButton.dataset.communityId;
    if (!communityId) return;

    if (action === 'select-ready') {
      const communityRows = getCommunityModeRows(communityId, 'ready');
      if (!communityRows.length) {
        setStatusMessage('No Ready listings available in this community.', 'muted');
        return;
      }
      selectRows(communityRows);
      setStatusMessage(`Selected ${communityRows.length} Ready listing${communityRows.length === 1 ? '' : 's'}.`, 'muted');
      return;
    }

    if (action === 'select-ready-warning') {
      const communityRows = getCommunityModeRows(communityId, 'ready-warning');
      if (!communityRows.length) {
        setStatusMessage('No Ready or Needs Info listings available in this community.', 'muted');
        return;
      }
      selectRows(communityRows);
      setStatusMessage(`Selected ${communityRows.length} Ready/Needs Info listing${communityRows.length === 1 ? '' : 's'}.`, 'muted');
      return;
    }

    if (action === 'clear-selection') {
      clearCommunitySelection(communityId);
      setStatusMessage('Cleared selection for this community.', 'muted');
      return;
    }

    if (action === 'publish-ready-sync') {
      const communityRows = getCommunityModeRows(communityId, 'ready');
      if (!communityRows.length) {
        setStatusMessage('No Ready listings available in this community.', 'muted');
        return;
      }
      selectRows(communityRows);
      submitBulkAction({ action: 'publish', alsoPublishInventory: true, selectedRows: communityRows });
      return;
    }

    if (action === 'publish-ready-warning-sync') {
      const communityRows = getCommunityModeRows(communityId, 'ready-warning');
      if (!communityRows.length) {
        setStatusMessage('No Ready or Needs Info listings available in this community.', 'muted');
        return;
      }
      selectRows(communityRows);
      submitBulkAction({ action: 'publish', alsoPublishInventory: true, selectedRows: communityRows });
      return;
    }

    if (action === 'unpublish-published-sync') {
      const communityRows = getCommunityModeRows(communityId, 'published');
      if (!communityRows.length) {
        setStatusMessage('No published listings available in this community.', 'muted');
        return;
      }
      selectRows(communityRows, { replaceCommunity: communityId });
      submitBulkAction({
        action: 'unpublish',
        alsoPublishInventory: true,
        selectedRows: communityRows,
        customConfirmMessage: `Unpublish ${communityRows.length} listing${communityRows.length === 1 ? '' : 's'} and publish inventory updates for 1 community. Continue?`
      });
    }
  });

  communityFilterEl.addEventListener('change', () => {
    state.filters.communityId = String(communityFilterEl.value || '');
    render();
  });

  statusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.status = button.dataset.status || 'all';
      setFilterButtonState(statusButtons, state.filters.status, 'status');
      render();
    });
  });

  publishedButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.published = button.dataset.published || 'all';
      setFilterButtonState(publishedButtons, state.filters.published, 'published');
      render();
    });
  });

  readinessButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.readiness = button.dataset.readiness || 'all';
      setFilterButtonState(readinessButtons, state.filters.readiness, 'readiness');
      render();
    });
  });

  bulkPublishButton.addEventListener('click', () => {
    submitBulkAction({ action: 'publish', alsoPublishInventory: false });
  });
  bulkUnpublishButton.addEventListener('click', () => {
    submitBulkAction({ action: 'unpublish', alsoPublishInventory: false });
  });
  bulkPublishAndSyncButton.addEventListener('click', () => {
    submitBulkAction({ action: 'publish', alsoPublishInventory: true });
  });
  bulkUnpublishAndSyncButton.addEventListener('click', () => {
    submitBulkAction({ action: 'unpublish', alsoPublishInventory: true });
  });

  applyInitialFilters();
  readFlashStatus();
  render();
  window.addEventListener('resize', syncStickyGroupOffset);
})();
