// /assets/js/contacts/render.js
import { formatDate } from './date.js';
import { updateContact, toggleFlag } from './api.js';
import { openCommentModal } from './modal.js';

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

    // Status badge
    {
      const statusCell = document.createElement('td');
      const status = (contact.status || 'new').toLowerCase();
      const badge = document.createElement('span');
      badge.className = `status-badge ${status}`;
      badge.textContent = status
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      statusCell.appendChild(badge);
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
