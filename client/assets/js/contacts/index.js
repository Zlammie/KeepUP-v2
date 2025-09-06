// /assets/js/contacts/index.js
import { fetchContacts } from './api.js';
import { initModal } from './modal.js';
import { renderTable } from './render.js';
import { initTopBar } from './topbar.js';

const contactsTable = document.getElementById('contactsTable');
const toggleDeleteBtn = document.getElementById('toggleDeleteMode');

let deleteMode = false;
if (toggleDeleteBtn) {
  toggleDeleteBtn.addEventListener('click', () => {
    deleteMode = !deleteMode;
    contactsTable.classList.toggle('show-delete', deleteMode);
    toggleDeleteBtn.classList.toggle('btn-outline-danger', !deleteMode);
    toggleDeleteBtn.classList.toggle('btn-danger', deleteMode);
    toggleDeleteBtn.textContent = deleteMode ? 'Done' : 'Delete';
  });
}

// --- Row-level Delete (event delegation) ---
contactsTable.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-x');
  if (!btn) return;

  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name') || 'this contact';
  if (!id) return;

  const ok = confirm(`Delete ${name}? This cannot be undone.`);
  if (!ok) return;

  const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    alert(`Failed to delete: ${msg || res.statusText}`);
    return;
  }

  // Optimistic UI: remove row + update counters
  const row = btn.closest('tr');
  if (row && row.parentNode) row.parentNode.removeChild(row);

  // If you maintain counts in the top bar, decrement here
  // (pseudo) updateCountsAfterDelete(row.dataset.status);
});

document.addEventListener('DOMContentLoaded', async () => {
  initModal();

     try {
    const contacts = await fetchContacts();
    initTopBar(contacts); // handles first render + subsequent filtering
  } catch (err) {
    console.error(err);
  }

  try {
    const contacts = await fetchContacts();

    renderTable(contacts);
  } catch (err) {
    console.error(err);
    // Optionally show a toast or message to the user
  }
});
