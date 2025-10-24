// /assets/js/contacts/render.js
import { formatDate } from './date.js';
import { updateContact, toggleFlag } from './api.js';
import { openCommentModal } from './modal.js';

const STATUS_OPTIONS = [
  { value: 'New', label: 'New' },
  { value: 'Target', label: 'Target' },
  { value: 'Possible', label: 'Possible' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Be-Back', label: 'Be-Back' },
  { value: 'Purchased', label: 'Purchased' },
  { value: 'Cold', label: 'Cold' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Not-Interested', label: 'Not Interested' },
  { value: 'Deal-Lost', label: 'Deal Lost' },
  { value: 'Bust', label: 'Bust' }
];

const STATUS_CLASS_MAP = {
  New: 'new',
  Target: 'target',
  Possible: 'possible',
  Negotiation: 'negotiating',
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
  if (!raw) return null;
  const normalized = raw.toString().trim().toLowerCase().replace(/\s+/g, '-');
  return STATUS_OPTIONS.find(
    (opt) => opt.value.toLowerCase().replace(/\s+/g, '-') === normalized
  ) || null;
};

const statusClassName = (statusValue) => {
  const option = matchStatusOption(statusValue);
  if (option && STATUS_CLASS_MAP[option.value]) {
    return STATUS_CLASS_MAP[option.value];
  }
  const normalized = (statusValue || DEFAULT_STATUS)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return normalized || STATUS_CLASS_MAP[DEFAULT_STATUS];
};

const statusDisplayLabel = (statusValue) => {
  const option = matchStatusOption(statusValue);
  if (option) return option.label;
  if (!statusValue) return DEFAULT_STATUS;
  const str = statusValue.toString().trim();
  if (!str) return DEFAULT_STATUS;
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const applyBadgeView = (badgeEl, statusValue) => {
  badgeEl.className = `status-badge ${statusClassName(statusValue)}`;
  badgeEl.textContent = statusDisplayLabel(statusValue);
  badgeEl.dataset.status = statusValue;
};

function setFlagIconColor(imgEl, flagged) {
  // red-ish tint when flagged
  imgEl.style.filter = flagged
    ? 'invert(23%) sepia(93%) saturate(6575%) hue-rotate(358deg) brightness(99%) contrast(119%)'
    : '';
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

    // 📋 Task icon
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/add_task.svg';
      img.alt = 'Task';
      btn.appendChild(img);
      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // 🚩 Flag toggle
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/exclamation.svg';
      img.alt = 'Flag';
      btn.appendChild(img);

      let flagged = Boolean(contact.flagged);
      setFlagIconColor(img, flagged);

      btn.addEventListener('click', async () => {
        flagged = !flagged;
        setFlagIconColor(img, flagged);
        try {
          await toggleFlag(contact._id, flagged);
        } catch (e) {
          // revert UI if API fails
          flagged = !flagged;
          setFlagIconColor(img, flagged);
          console.error(e);
        }
      });

      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // 💬 Comment button
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/comment.svg';
      img.alt = 'Comment';
      btn.appendChild(img);
      btn.addEventListener('click', () => openCommentModal(contact._id));
      cell.appendChild(btn);
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
      cell.textContent = contact[field] || '';
      cell.contentEditable = true;
      cell.dataset.field = field;

      cell.addEventListener('blur', async (e) => {
        const newValue = e.target.textContent.trim();
        if (newValue === (contact[field] || '')) return; // no-op if unchanged
        try {
          await updateContact(contact._id, { [field]: newValue });
          contact[field] = newValue; // keep row model in sync
        } catch (err) {
          console.error(err);
          // revert UI if save fails
          e.target.textContent = contact[field] || '';
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
      applyBadgeView(badge, contact.status || DEFAULT_STATUS);

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
          matchStatusOption(contact.status)?.value || String(contact.status || DEFAULT_STATUS);
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

      btn.addEventListener('click', async () => {
        const id = contact._id;
        const name = btn.getAttribute('data-name') || 'this contact';
        const ok = confirm(`Delete ${name}? This cannot be undone.`);
        if (!ok) return;

        try {
          const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const msg = await res.text().catch(() => '');
            alert(`Failed to delete: ${msg || res.statusText}`);
            return;
          }
          // Remove the row from the DOM
          row.remove();
          // TODO: if you show counts in the top bar, decrement them here.
        } catch (e) {
          console.error('Delete failed', e);
          alert('Delete failed. See console for details.');
        }
      });

      cell.appendChild(btn);
      row.appendChild(cell);
    }


    tableBody.appendChild(row);
  });
}
