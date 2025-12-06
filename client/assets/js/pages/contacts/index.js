// /assets/js/contacts/index.js
import { deleteContact, fetchContacts, getContactById } from './api.js';
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
const contactCache = new Map();

function primeContactCache(contacts = []) {
  contacts.forEach((contact) => {
    if (contact && contact._id) {
      contactCache.set(contact._id, contact);
    }
  });
}

async function getContactData(id) {
  if (!id) return null;
  if (contactCache.has(id)) return contactCache.get(id);
  try {
    const contact = await getContactById(id);
    if (contact && contact._id) {
      contactCache.set(contact._id, contact);
    }
    return contact;
  } catch (err) {
    console.error(`[contacts] Failed to fetch contact ${id}`, err);
    return null;
  }
}

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

async function openTaskDrawerForContact(payload = {}, tabKey = 'tasks') {
  const { id } = payload;
  if (!id) return;

  const contact = payload.contact || contactCache.get(id) || await getContactData(id);
  const displayName = contact
    ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || payload.name || 'Contact'
    : (payload.name || 'Contact');
  const status = contact?.status || payload.status || 'New';

  if (!showTaskDrawer(displayName)) return;

  currentTaskPromise = currentTaskPromise
    .catch(() => {})
    .then(() => initState({ contactId: id, initialStatus: status }))
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

async function handleDeleteContact({ id, name }) {
  if (!id) return;

  const label = name || 'this contact';
  const ok = confirm(`Delete ${label}? This cannot be undone.`);
  if (!ok) return;

  try {
    await deleteContact(id);
    contactCache.delete(id);
    const row = contactsTable.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      row.remove();
    }
    document.dispatchEvent(new CustomEvent('contacts:deleted', { detail: { contactId: id } }));
  } catch (err) {
    const message = err?.message || 'Delete failed. Please try again.';
    console.error('[contacts] Delete failed', err);
    alert(message);
  }
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
  },
  onDelete: handleDeleteContact
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const contacts = await fetchContacts();
    primeContactCache(contacts);
    await initTopBar(contacts);
  } catch (err) {
    console.error(err);
    // If contacts cannot load, clear table to avoid stale state
    renderTable([]);
  }
});
