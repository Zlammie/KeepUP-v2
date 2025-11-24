// /assets/js/contacts/index.js
import { fetchContacts } from './api.js';
import { renderTable, setActionHandlers } from './render.js';
import { initTopBar } from './topbar.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { initState } from '../contact-details/state.js';

const contactsTable = document.getElementById('contactsTable');
const toggleDeleteBtn = document.getElementById('toggleDeleteMode');
const taskBackdropEl = document.getElementById('task-drawer-backdrop');
const todoPanelEl = document.getElementById('todo-panel');
const taskDrawerNameEl = document.getElementById('task-panel-contact-name');

let taskPanelInstance = null;
let currentTaskPromise = Promise.resolve();

function ensureTaskPanel() {
  if (!taskPanelInstance) {
    const currentUserId = document.body.dataset.currentUserId || '';
    taskPanelInstance = initTaskPanel({ currentUserId, defaultAssignmentTarget: 'contact' });
  }
  return Boolean(taskPanelInstance);
}

function showTaskDrawer(name) {
  if (!ensureTaskPanel()) return false;
  if (taskDrawerNameEl) {
    taskDrawerNameEl.textContent = name || 'Contact';
  }
  if (todoPanelEl) {
    todoPanelEl.dataset.context = 'contact';
    todoPanelEl.removeAttribute('hidden');
  }
  if (taskBackdropEl) taskBackdropEl.removeAttribute('hidden');
  document.body.classList.add('task-panel-open');
  return true;
}

function closeTaskDrawer() {
  document.body.classList.remove('task-panel-open');
  if (taskBackdropEl) taskBackdropEl.setAttribute('hidden', 'true');
  if (todoPanelEl) {
    todoPanelEl.setAttribute('hidden', 'true');
    delete todoPanelEl.dataset.context;
  }
}

async function openTaskDrawerForContact({ id, name, status }, tabKey = 'tasks') {
  if (!id) return;
  if (!showTaskDrawer(name || 'Contact')) return;

  currentTaskPromise = currentTaskPromise
    .catch(() => {})
    .then(() => initState({ contactId: id, initialStatus: status || 'New' }))
    .catch((err) => {
      console.error('[contacts] Failed to load contact for tasks', err);
    })
    .then(() => {
      taskPanelInstance.setContext?.({
        contactId: id,
        linkedModel: 'Contact',
        linkedId: id,
        assignmentTarget: 'contact',
        defaultTitleBuilder: null,
        lenderOptions: null
      });
      taskPanelInstance.setActiveTab?.(tabKey || 'tasks');
    });

  await currentTaskPromise;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-task-drawer-close]')) {
    closeTaskDrawer();
  }
});

taskBackdropEl?.addEventListener('click', () => closeTaskDrawer());

setActionHandlers({
  onTask: (payload) => {
    openTaskDrawerForContact(payload);
  },
  onComment: (payload) => {
    openTaskDrawerForContact(payload, 'comments');
  }
});

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
  try {
    const contacts = await fetchContacts();
    await initTopBar(contacts);
  } catch (err) {
    console.error(err);
    // If contacts cannot load, clear table to avoid stale state
    renderTable([]);
  }
});
