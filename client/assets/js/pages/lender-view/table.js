import { dom } from './domCache.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { patchContactLender } from './api.js';
import { splitDateTimeForInputs } from '../../core/datetime.js';
import { formatPhoneDisplay } from '../../shared/phone.js';

const TZ = 'America/Chicago';

function parseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw) ? null : raw;
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }
  const d = new Date(String(raw));
  return isNaN(d) ? null : d;
}

function formatDateValue(raw, { includeTime = false } = {}) {
  const d = parseDate(raw);
  if (!d) return 'N/A';

  const opts = includeTime
    ? { timeZone: TZ, month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { timeZone: TZ, month: '2-digit', day: '2-digit', year: 'numeric' };

  return d.toLocaleString('en-US', opts);
}

const STATUS_LABELS = {
  invite: 'Invite',
  'sub-application': 'Submitted Application',
  'sub-docs': 'Submitted Docs',
  'missing-docs': 'Missing Docs',
  approved: 'Approved',
  'cannot-qualify': 'Cannot Qualify'
};

const CLOSING_STATUS_OPTIONS = [
  { value: 'notLocked', label: 'Not Locked', className: 'not-locked' },
  { value: 'locked', label: 'Locked', className: 'locked' },
  { value: 'underwriting', label: 'Underwriting', className: 'underwriting' },
  { value: 'clearToClose', label: 'Clear To Close', className: 'clear-to-close' },
];

const CLOSING_STATUS_LOOKUP = CLOSING_STATUS_OPTIONS.reduce((map, option) => {
  map[option.value.toLowerCase()] = option;
  return map;
}, {});

const CLOSING_STATUS_ALIASES = {
  'not-locked': 'notLocked',
  'not locked': 'notLocked',
  notlocked: 'notLocked',
  'clear-to-close': 'clearToClose',
  'clear to close': 'clearToClose',
  cleartoclose: 'clearToClose',
};

const normalizeClosingStatusValue = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (CLOSING_STATUS_LOOKUP[lower]) return CLOSING_STATUS_LOOKUP[lower].value;
  if (CLOSING_STATUS_ALIASES[lower]) return CLOSING_STATUS_ALIASES[lower];
  return value;
};

const getClosingStatusMeta = (raw) => {
  const key = normalizeClosingStatusValue(raw);
  if (!key) return { value: '', label: 'N/A', className: 'not-locked' };
  const meta = CLOSING_STATUS_LOOKUP[key.toLowerCase()];
  if (meta) return meta;
  return {
    value: key,
    label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
    className: 'not-locked',
  };
};

const CLOSING_STATUS_CLASSNAMES = CLOSING_STATUS_OPTIONS.map((opt) => opt.className);

const normalizeStatus = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('sub') && s.includes('application')) return 'sub-application';
  if (s.includes('sub') && s.includes('doc')) return 'sub-docs';
  if (s.includes('missing') && s.includes('doc')) return 'missing-docs';
  if (s.includes('cannot') && s.includes('qual')) return 'cannot-qualify';
  return s;
};

const displayLabel = (raw) => {
  const key = normalizeStatus(raw);
  return STATUS_LABELS[key] || (key ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : '-');
};

const matchesActiveLender = (entry = {}) => {
  if (!entry || !state.lenderId) return false;
  const target = String(state.lenderId);
  const entryId = entry?.lender?._id || entry?.lender;
  return entryId && String(entryId) === target;
};

const setBadgeContent = (badgeEl, statusValue) => {
  const meta = getClosingStatusMeta(statusValue || 'notLocked');
  if (!badgeEl) return meta;
  badgeEl.classList.remove(...CLOSING_STATUS_CLASSNAMES);
  if (meta.className) badgeEl.classList.add(meta.className);
  badgeEl.textContent = meta.label;
  badgeEl.dataset.status = meta.value || '';
  badgeEl.title = meta.label;
  if (badgeEl.getAttribute('role') === 'button') {
    badgeEl.setAttribute('aria-label', `Closing status: ${meta.label}. Click to edit.`);
  }
  return meta;
};

const splitClosingValue = (raw) => splitDateTimeForInputs(raw);

const sanitizeTimeValue = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : trimmed.slice(0, 5);
};

const buildClosingPayload = (dateVal, timeVal) => {
  const date = (dateVal || '').trim();
  if (!date) return null;
  const time = sanitizeTimeValue(timeVal);
  return time ? `${date}T${time}` : date;
};

const idsEqual = (a, b) => a != null && b != null && String(a) === String(b);

const applyLenderUpdate = (contactId, entryId, patch = {}) => {
  if (!contactId || !entryId || !patch || typeof patch !== 'object') return;
  const mutate = (contact) => {
    if (!contact || !Array.isArray(contact.lenders)) return;
    const entry = contact.lenders.find((link) => idsEqual(link?._id, entryId));
    if (entry) Object.assign(entry, patch);
  };
  const primary = state.allContacts.find((c) => idsEqual(c?._id, contactId));
  if (primary) mutate(primary);
  const mirror = state.purchasedContacts.find((c) => idsEqual(c?._id, contactId));
  if (mirror && mirror !== primary) mutate(mirror);
};

const buildClosingStatusEditor = (contact, lenderInfo) => {
  const contactId = contact?._id;
  const entryId = lenderInfo?._id;

  const container = document.createElement('div');
  container.className = 'closing-status-cell';

  const badge = document.createElement('span');
  badge.className = 'status-badge closing-status-pill';
  container.appendChild(badge);

  if (!contactId || !entryId) {
    setBadgeContent(badge, lenderInfo?.closingStatus);
    container.classList.add('is-readonly');
    return container;
  }

  badge.tabIndex = 0;
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-haspopup', 'listbox');
  badge.setAttribute('aria-expanded', 'false');
  const initialMeta = setBadgeContent(badge, lenderInfo?.closingStatus);

  const select = document.createElement('select');
  select.className = 'form-select form-select-sm closing-status-select';
  select.dataset.contactId = contactId;
  select.dataset.entryId = entryId;

  CLOSING_STATUS_OPTIONS.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });

  const ensureOption = (value) => {
    if (!value) return;
    const exists = Array.from(select.options).some((opt) => opt.value === value);
    if (exists) return;
    const meta = getClosingStatusMeta(value);
    const opt = document.createElement('option');
    opt.value = meta.value;
    opt.textContent = meta.label;
    select.appendChild(opt);
  };

  ensureOption(initialMeta.value || 'notLocked');
  select.value = initialMeta.value || 'notLocked';
  select.dataset.current = select.value;

  container.appendChild(select);

  let saving = false;

  const hideSelect = (force = false) => {
    if (saving && !force) return;
    container.classList.remove('is-editing');
    badge.setAttribute('aria-expanded', 'false');
  };

  const showSelect = () => {
    ensureOption(select.dataset.current || 'notLocked');
    select.value = select.dataset.current || 'notLocked';
    container.classList.add('is-editing');
    badge.setAttribute('aria-expanded', 'true');
    select.focus();
  };

  const revertTo = (value) => {
    ensureOption(value);
    select.value = value;
    select.dataset.current = value;
    setBadgeContent(badge, value);
  };

  badge.addEventListener('click', showSelect);
  badge.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      showSelect();
    }
  });

  select.addEventListener('change', async (event) => {
    const prevValue = normalizeClosingStatusValue(select.dataset.current || 'notLocked') || 'notLocked';
    const nextValue = normalizeClosingStatusValue(event.target.value) || 'notLocked';
    if (nextValue === prevValue) {
      hideSelect();
      badge.focus();
      return;
    }

    saving = true;
    container.classList.add('is-saving');
    select.disabled = true;
    try {
      const updated = await patchContactLender(contactId, entryId, { closingStatus: nextValue });
      const effectiveMeta = getClosingStatusMeta(updated?.closingStatus || nextValue);
      ensureOption(effectiveMeta.value);
      select.value = effectiveMeta.value;
      select.dataset.current = effectiveMeta.value;
      setBadgeContent(badge, effectiveMeta.value);
      applyLenderUpdate(contactId, entryId, { closingStatus: updated?.closingStatus ?? effectiveMeta.value });
      hideSelect(true);
      badge.focus();
    } catch (err) {
      console.error('Failed to update closing status', err);
      revertTo(prevValue);
    } finally {
      saving = false;
      container.classList.remove('is-saving');
      select.disabled = false;
    }
  });

  select.addEventListener('blur', () => hideSelect());
  select.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      revertTo(select.dataset.current || 'notLocked');
      hideSelect(true);
      badge.focus();
    }
  });

  return container;
};

const buildClosingDateEditor = (contact, lenderInfo) => {
  const container = document.createElement('div');
  container.className = 'closing-date-editor';

  const contactId = contact?._id;
  const entryId = lenderInfo?._id;

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'closing-date-input';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.step = 60;
  timeInput.className = 'closing-time-input';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-link btn-sm closing-date-clear';
  clearBtn.textContent = 'Clear';

  const controls = document.createElement('div');
  controls.className = 'closing-date-controls';
  controls.appendChild(dateInput);
  controls.appendChild(timeInput);
  controls.appendChild(clearBtn);

  container.appendChild(controls);

  const initialParts = splitClosingValue(lenderInfo?.closingDateTime || '');
  const stateRef = {
    date: initialParts.date || '',
    time: initialParts.time || '',
  };

  const syncInputs = (next = stateRef) => {
    dateInput.value = next.date || '';
    timeInput.value = next.time || '';
    timeInput.classList.toggle('is-blank', !next.time);
    clearBtn.disabled = !next.date;
  };

  syncInputs();

  if (!contactId || !entryId) {
    container.classList.add('is-readonly');
    dateInput.disabled = true;
    timeInput.disabled = true;
    clearBtn.disabled = true;
    return container;
  }

  let saving = false;

  const revertInputs = () => syncInputs();

  const persist = async () => {
    const nextDate = (dateInput.value || '').trim();
    const nextTime = sanitizeTimeValue(timeInput.value);

    if (nextDate === stateRef.date && nextTime === stateRef.time) {
      timeInput.classList.toggle('is-blank', !nextTime);
      clearBtn.disabled = !nextDate;
      return;
    }

    const payloadValue = buildClosingPayload(nextDate, nextTime);

    saving = true;
    dateInput.disabled = true;
    timeInput.disabled = true;
    clearBtn.disabled = true;

    try {
      const updated = await patchContactLender(contactId, entryId, { closingDateTime: payloadValue });
      const effectiveRaw = updated?.closingDateTime ?? payloadValue ?? null;
      const parts = effectiveRaw ? splitClosingValue(effectiveRaw) : { date: '', time: '' };
      stateRef.date = parts.date || '';
      stateRef.time = parts.time || '';
      syncInputs();
      applyLenderUpdate(contactId, entryId, { closingDateTime: effectiveRaw });
    } catch (err) {
      console.error('Failed to update closing date', err);
      revertInputs();
    } finally {
      saving = false;
      dateInput.disabled = false;
      timeInput.disabled = false;
      clearBtn.disabled = !stateRef.date;
    }
  };

  const schedulePersist = () => {
    if (!saving) void persist();
  };

  dateInput.addEventListener('change', schedulePersist);
  dateInput.addEventListener('blur', schedulePersist);
  dateInput.addEventListener('input', () => {
    if (!saving) clearBtn.disabled = !dateInput.value;
  });

  timeInput.addEventListener('change', schedulePersist);
  timeInput.addEventListener('blur', schedulePersist);
  timeInput.addEventListener('input', () => {
    const sanitized = sanitizeTimeValue(timeInput.value);
    if (sanitized !== timeInput.value) timeInput.value = sanitized;
    timeInput.classList.toggle('is-blank', !timeInput.value);
    if (!saving) clearBtn.disabled = !dateInput.value;
  });

  clearBtn.addEventListener('click', () => {
    if (!stateRef.date && !stateRef.time) return;
    dateInput.value = '';
    timeInput.value = '';
    timeInput.classList.add('is-blank');
    schedulePersist();
  });

  return container;
};

const ACTION_BUTTONS = [
  { action: 'task', icon: '/assets/icons/add_task.svg', label: 'Manage tasks' },
  { action: 'flag', icon: '/assets/icons/exclamation.svg', label: 'Flag contact' },
  { action: 'comment', icon: '/assets/icons/comment.svg', label: 'Comment on contact' },
];

const renderActionCell = (contactId, contactName, contactStatus) => {
  const safeId = contactId ? escapeHtml(String(contactId)) : '';
  const safeName = escapeHtml(contactName || 'Contact');
  const safeStatus = escapeHtml(contactStatus ?? 'New');
  const buttons = ACTION_BUTTONS.map(({ action, icon, label }) => `
    <button class="table-icon-btn" type="button" data-action="${action}" aria-label="${label} for ${safeName}">
      <img src="${icon}" alt="">
    </button>
  `).join('');

  return `
    <td class="table-icon-col">
      <div class="table-action-buttons" data-contact="${safeId}" data-contact-name="${safeName}" data-contact-status="${safeStatus}">
        ${buttons}
      </div>
    </td>
  `;
};

export function renderTable(rows = []) {
  const tbody = dom.tableBody;
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10">No contacts linked to this lender.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  rows.forEach((contact) => {
    const name = (contact.firstName || contact.lastName)
      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      : '(Unnamed)';
    const phone = formatPhoneDisplay(contact.phone || '') || 'N/A';
    const email = contact.email || 'N/A';
    const communities = Array.isArray(contact.communities)
      ? contact.communities.join(', ')
      : (contact.communities || 'N/A');
    const owner = contact.owner || 'N/A';

    const lenderEntries = contact.lenders || [];
    const lenderInfo = lenderEntries.find(matchesActiveLender) || lenderEntries[0] || {};

    const status = displayLabel(lenderInfo?.status);
    const inviteDate = formatDateValue(lenderInfo?.inviteDate);
    const approvedDate = formatDateValue(lenderInfo?.approvedDate);
    const rawStatus = contact?.status;
    const contactStatusValue = rawStatus == null ? '' : String(rawStatus).trim();
    const generalStatus = contactStatusValue || 'No Status';

    contact._lenderStatus = normalizeStatus(lenderInfo?.status || '');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${renderActionCell(contact._id, name, contactStatusValue)}
      <td><a href="/contact-details.html?id=${escapeHtml(contact._id)}">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(communities)}</td>
      <td>${escapeHtml(owner)}</td>
      <td>${escapeHtml(generalStatus)}</td>
      <td><span class="status-badge ${escapeHtml(contact._lenderStatus || '')}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(inviteDate)}</td>
      <td>${escapeHtml(approvedDate)}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function renderPurchasedTable(rows = []) {
  const tbody = dom.purchasedTableBody;
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8">No purchasers linked to this lender.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  rows.forEach((contact) => {
    const name = (contact.firstName || contact.lastName)
      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      : '(Unnamed)';
    const phone = formatPhoneDisplay(contact.phone || '') || 'N/A';
    const email = contact.email || 'N/A';
    const communities = Array.isArray(contact.communities)
      ? contact.communities.join(', ')
      : (contact.communities || 'N/A');
    const lenderEntries = contact.lenders || [];
    const lenderInfo = lenderEntries.find(matchesActiveLender) || lenderEntries[0] || {};

    const lenderStatus = displayLabel(lenderInfo?.status);
    const rawStatus = contact?.status;
    const contactStatusValue = rawStatus == null ? 'New' : String(rawStatus).trim();

    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${renderActionCell(contact._id, name, contactStatusValue)}
      <td><a href="/contact-details.html?id=${escapeHtml(contact._id)}">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(communities)}</td>
      <td><span class="status-badge ${escapeHtml(contact._lenderStatus || '')}">${escapeHtml(lenderStatus)}</span></td>
    `;

    const closingStatusTd = document.createElement('td');
    closingStatusTd.appendChild(buildClosingStatusEditor(contact, lenderInfo));
    tr.appendChild(closingStatusTd);

    const closingDateTd = document.createElement('td');
    closingDateTd.appendChild(buildClosingDateEditor(contact, lenderInfo));
    tr.appendChild(closingDateTd);

    tbody.appendChild(tr);
  });
}
