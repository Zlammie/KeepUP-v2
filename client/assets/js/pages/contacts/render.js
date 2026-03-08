// /assets/js/contacts/render.js
import { formatDate } from './date.js';
import { formatPhoneDisplay } from '../../shared/phone.js';
import { updateContact } from './api.js';

let actionHandlers = {
  onTask: null,
  onComment: null,
  onDelete: null
};

export function setActionHandlers(handlers = {}) {
  actionHandlers = {
    ...actionHandlers,
    ...handlers
  };
}

const STATUS_OPTIONS = [
  { value: '', label: 'No Status' },
  { value: 'New', label: 'New' },
  { value: 'Target', label: 'Target' },
  { value: 'Possible', label: 'Possible' },
  { value: 'Negotiating', label: 'Negotiating' },
  { value: 'Be-Back', label: 'Be-Back' },
  { value: 'Purchased', label: 'Purchased' },
  { value: 'Cold', label: 'Cold' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Not-Interested', label: 'Not Interested' },
  { value: 'Deal-Lost', label: 'Deal Lost' },
  { value: 'Bust', label: 'Bust' }
];

const STATUS_CLASS_MAP = {
  '': 'no-status',
  New: 'new',
  Target: 'target',
  Possible: 'possible',
  Negotiating: 'negotiating',
  'Be-Back': 'be-back',
  Purchased: 'purchased',
  Cold: 'cold',
  Closed: 'closed',
  'Not-Interested': 'not-interested',
  'Deal-Lost': 'deal-lost',
  Bust: 'bust'
};

const DEFAULT_STATUS = 'New';

const matchStatusOption = (raw) => {
  if (raw === '') return STATUS_OPTIONS.find((opt) => opt.value === '') || null;
  if (raw == null) return null;
  const normalized = raw.toString().trim().toLowerCase().replace(/\s+/g, '-');
  if (!normalized) return STATUS_OPTIONS.find((opt) => opt.value === '') || null;
  return STATUS_OPTIONS.find(
    (opt) => opt.value.toLowerCase().replace(/\s+/g, '-') === normalized
  ) || null;
};

const statusClassName = (statusValue) => {
  const option = matchStatusOption(statusValue);
  if (option && Object.prototype.hasOwnProperty.call(STATUS_CLASS_MAP, option.value)) {
    return STATUS_CLASS_MAP[option.value];
  }
  const normalized = (statusValue ?? DEFAULT_STATUS)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!normalized) return STATUS_CLASS_MAP[''] || 'no-status';
  return normalized;
};

const statusDisplayLabel = (statusValue) => {
  const option = matchStatusOption(statusValue);
  if (option) return option.label;
  if (statusValue === undefined || statusValue === null) return DEFAULT_STATUS;
  const str = statusValue.toString().trim();
  if (!str) return 'No Status';
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const applyBadgeView = (badgeEl, statusValue) => {
  badgeEl.className = `status-badge ${statusClassName(statusValue)}`;
  badgeEl.textContent = statusDisplayLabel(statusValue);
  badgeEl.dataset.status = statusValue;
};

function applyAttentionIndicator(buttonEl, imgEl, requiresAttention) {
  if (!buttonEl || !imgEl) return;
  if (requiresAttention) {
    buttonEl.classList.add('attention-on');
  } else {
    buttonEl.classList.remove('attention-on');
  }
}

function makeCell(text = '') {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

export function renderTable(contacts) {
  const tableBody = document.querySelector('#contactsTable tbody');
  tableBody.innerHTML = '';

  contacts.forEach((contact) => {
    const row = document.createElement('tr');
    row.dataset.id = contact._id;

        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Contact';

    {
      const cell = document.createElement('td');
      cell.classList.add('contact-table-icons');
      const wrapper = document.createElement('div');
      wrapper.className = 'table-action-buttons';

      const createIconButton = ({ src, label, extraClasses = [] }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.classList.add('table-icon-btn', ...extraClasses);
        btn.setAttribute('aria-label', label);
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        btn.appendChild(img);
        return { btn, img };
      };

      const { btn: taskBtn } = createIconButton({
        src: '/assets/icons/add_task.svg',
        label: `Manage tasks for ${fullName}`
      });
      taskBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        actionHandlers.onTask?.({
          id: contact._id,
          name: fullName,
          status: contact.status ?? 'New'
        });
      });
      wrapper.appendChild(taskBtn);

      const requiresAttention = Boolean(contact.requiresAttention);
      const { btn: attentionBtn, img: attentionImg } = createIconButton({
        src: '/assets/icons/exclamation.svg',
        label: requiresAttention
          ? `${fullName} has urgent tasks`
          : `${fullName} has no urgent tasks`,
        extraClasses: ['attention-indicator']
      });
      attentionBtn.setAttribute('aria-disabled', 'true');
      attentionBtn.tabIndex = -1;
      attentionBtn.setAttribute('title', requiresAttention ? 'Urgent tasks pending' : 'No urgent tasks');
      applyAttentionIndicator(attentionBtn, attentionImg, requiresAttention);
      wrapper.appendChild(attentionBtn);

      const { btn: commentBtn } = createIconButton({
        src: '/assets/icons/comment.svg',
        label: `Add comment for ${fullName}`
      });
      commentBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        actionHandlers.onComment?.({
          id: contact._id,
          name: fullName,
          status: contact.status ?? 'New'
        });
      });
      wrapper.appendChild(commentBtn);

      cell.appendChild(wrapper);
      row.appendChild(cell);
    }

// View button
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.textContent = 'View';
      btn.classList.add('btn', 'btn-primary', 'btn-sm');
      btn.addEventListener('click', () => {
        window.location.href = `/contact-details?id=${contact._id}`;
      });
      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // Visit date (formatted dd/mm/yy)
    {
      const cell = document.createElement('td');
      cell.textContent = formatDate(contact.visitDate);
      row.appendChild(cell);
    }

    // Editable fields
    ['firstName', 'lastName', 'email', 'phone'].forEach((field) => {
      const cell = document.createElement('td');
      const isPhone = field === 'phone';
      const currentValue = contact[field] || '';
      const displayValue = isPhone ? formatPhoneDisplay(currentValue) : currentValue;

      cell.textContent = displayValue;
      cell.contentEditable = true;
      cell.dataset.field = field;
      cell.dataset.displayValue = displayValue;
      cell.dataset.comparable = isPhone ? currentValue.replace(/\D+/g, '') : currentValue;

      if (isPhone) {
        cell.addEventListener('focus', () => {
          cell.textContent = contact[field] || '';
        });
      }

      cell.addEventListener('blur', async (e) => {
        const newValue = e.target.textContent.trim();
        const comparableValue = isPhone ? newValue.replace(/\D+/g, '') : newValue;
        if (comparableValue === cell.dataset.comparable) {
          e.target.textContent = cell.dataset.displayValue || '';
          return;
        }
        try {
          await updateContact(contact._id, { [field]: newValue });
          contact[field] = newValue; // keep row model in sync
          const updatedDisplay = isPhone ? formatPhoneDisplay(newValue) : newValue;
          cell.dataset.displayValue = updatedDisplay;
          cell.dataset.comparable = comparableValue;
          e.target.textContent = updatedDisplay;
        } catch (err) {
          console.error(err);
          // revert UI if save fails
          const fallback = cell.dataset.displayValue || contact[field] || '';
          e.target.textContent = fallback;
        }
      });

      row.appendChild(cell);
    });

    // Status badge with inline picker
    {
      const statusCell = document.createElement('td');
      statusCell.classList.add('contact-status-cell');

      const badge = document.createElement('span');
      badge.setAttribute('role', 'button');
      badge.tabIndex = 0;
      badge.style.cursor = 'pointer';
      badge.title = 'Click to change status';
      applyBadgeView(badge, contact.status ?? DEFAULT_STATUS);

      const select = document.createElement('select');
      select.className = 'form-select form-select-sm contact-status-select';

      const ensureOption = (value) => {
        const existing = Array.from(select.options).some((opt) => opt.value === value);
        if (!existing) {
          const optEl = document.createElement('option');
          optEl.value = value;
          optEl.textContent = statusDisplayLabel(value);
          select.appendChild(optEl);
        }
      };

      STATUS_OPTIONS.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });

      const getSelectionValue = () => {
        const option = matchStatusOption(contact.status);
        return option ? option.value : (contact.status ? String(contact.status) : DEFAULT_STATUS);
      };

      ensureOption(getSelectionValue());
      select.value = getSelectionValue();

      const hideSelect = () => {
        statusCell.classList.remove('is-editing');
      };

      const showSelect = () => {
        ensureOption(getSelectionValue());
        select.value = getSelectionValue();
        statusCell.classList.add('is-editing');
        select.focus();
      };

      select.addEventListener('change', async (event) => {
        const previousValue =
          matchStatusOption(contact.status)?.value ?? String(contact.status ?? DEFAULT_STATUS);
        const nextValue = event.target.value;
        if (nextValue === previousValue) {
          hideSelect();
          badge.focus();
          return;
        }

        select.disabled = true;
        try {
          await updateContact(contact._id, { status: nextValue });
          contact.status = nextValue;
          applyBadgeView(badge, nextValue);
          document.dispatchEvent(new CustomEvent('contacts:status-updated', {
            detail: { contactId: contact._id, status: nextValue }
          }));
          hideSelect();
          badge.focus();
        } catch (err) {
          console.error(err);
          alert('Could not update status. Please try again.');
          ensureOption(previousValue);
          event.target.value = previousValue;
          applyBadgeView(badge, previousValue);
          hideSelect();
          badge.focus();
        } finally {
          select.disabled = false;
        }
      });

      select.addEventListener('blur', () => {
        hideSelect();
      });

      select.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') {
          evt.preventDefault();
          hideSelect();
          badge.focus();
        }
      });

      const badgeKeydown = (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          showSelect();
        }
      };

      badge.addEventListener('click', showSelect);
      badge.addEventListener('keydown', badgeKeydown);

      statusCell.appendChild(badge);
      statusCell.appendChild(select);
      row.appendChild(statusCell);
    }

        // 🗑️ Delete cell (hidden by default; shown when table has .show-delete)
    {
      const cell = document.createElement('td');
      cell.classList.add('cell-delete', 'text-center'); // CSS will keep this hidden unless table has .show-delete

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('delete-x', 'btn', 'btn-link', 'p-0');
      btn.title = 'Delete';
      btn.textContent = '×';
      btn.setAttribute('data-id', contact._id);
      btn.setAttribute(
        'data-name',
        `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      );

      btn.addEventListener('click', () => {
        actionHandlers.onDelete?.({
          id: contact._id,
          name: btn.getAttribute('data-name') || 'this contact',
          status: contact.status ?? 'New'
        });
      });

      cell.appendChild(btn);
      row.appendChild(cell);
    }


    tableBody.appendChild(row);
  });
}
