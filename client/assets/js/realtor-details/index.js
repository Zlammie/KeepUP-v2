import { setRealtorIdFromURL, state } from './state.js';
import { fetchRealtor, fetchRelatedContacts } from './api.js';
import { populateForm, setupAutosave } from './editor.js';
import { updateHeaderFromInputs, disableEditor, wireEditorToggle } from './identity.js';
import { initTopBar } from './topbar.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { initState } from '../contact-details/state.js';
// Comments now use the task drawer; legacy modal removed.

let taskPanelInstance = null;
let taskDrawerNameEl = null;
let taskBackdropEl = null;
let todoPanelEl = null;
let currentTaskPromise = Promise.resolve();

function ensureTaskPanel() {
  if (!taskPanelInstance) {
    const currentUserId = document.body.dataset.currentUserId || '';
    taskPanelInstance = initTaskPanel({ currentUserId, defaultAssignmentTarget: 'contact' });
    todoPanelEl = document.getElementById('todo-panel');
    taskBackdropEl = document.getElementById('task-drawer-backdrop');
    taskDrawerNameEl = document.getElementById('task-panel-contact-name');
  }
  return Boolean(taskPanelInstance);
}

function getRealtorDisplayName() {
  const raw = document.getElementById('hdrName')?.textContent || '';
  return raw.trim() || 'Realtor';
}

function showTaskDrawer(name, context = 'contact') {
  if (!ensureTaskPanel()) return false;
  if (taskDrawerNameEl) {
    taskDrawerNameEl.textContent = name || 'Contact';
  }
  if (todoPanelEl) {
    todoPanelEl.dataset.context = context;
    todoPanelEl.removeAttribute('hidden');
  }
  if (taskBackdropEl) taskBackdropEl.removeAttribute('hidden');
  document.body.classList.add('task-panel-open');
  return true;
}

async function openContactTaskDrawer(contactId, contactName, contactStatus = 'New', tabKey = 'tasks') {
  if (!contactId) return;
  if (!showTaskDrawer(contactName || 'Contact', 'contact')) return;

  currentTaskPromise = currentTaskPromise
    .catch(() => {})
    .then(() => initState({ contactId, initialStatus: contactStatus || 'New' }))
    .catch((err) => {
      console.error('[realtor-details] Failed to load contact for tasks', err);
    })
    .then(() => {
      taskPanelInstance.setContext?.({
        contactId,
        linkedModel: 'Contact',
        linkedId: contactId,
        assignmentTarget: 'contact',
        defaultTitleBuilder: null,
        lenderOptions: null
      });
      taskPanelInstance.setActiveTab?.(tabKey || 'tasks');
    });

  await currentTaskPromise;
}

async function openRealtorTaskDrawer(tabKey = 'tasks') {
  if (!state.realtorId) return;
  const realtorName = getRealtorDisplayName();
  if (!showTaskDrawer(realtorName, 'realtor')) return;

  const realtorTitleBuilder = () => {
    const currentName = getRealtorDisplayName();
    return currentName ? `Follow up with ${currentName}` : 'Follow up with this realtor';
  };

  currentTaskPromise = currentTaskPromise
    .catch(() => {})
    .then(() => {
      taskPanelInstance.setContext?.({
        contactId: null,
        linkedModel: 'Realtor',
        linkedId: state.realtorId,
        assignmentTarget: 'realtor',
        defaultTitleBuilder: realtorTitleBuilder,
        lenderOptions: null
      });
      taskPanelInstance.setActiveTab?.(tabKey || 'tasks');
    })
    .catch((err) => {
      console.error('[realtor-details] Failed to open realtor tasks', err);
    });

  await currentTaskPromise;
}

function closeTaskDrawer() {
  document.body.classList.remove('task-panel-open');
  if (taskBackdropEl) taskBackdropEl.setAttribute('hidden', 'true');
  if (todoPanelEl) {
    todoPanelEl.setAttribute('hidden', 'true');
    delete todoPanelEl.dataset.context;
  }
}

function wireTaskButtons() {
  const table = document.querySelector('.related-table');
  if (table) {
    table.addEventListener('click', (event) => {
      const button = event.target.closest('.table-icon-btn');
      if (!button) return;
      const action = button.dataset.action;
      const context = button.closest('.table-action-buttons');
      const contactId = context?.dataset?.contact;
      const contactName = context?.dataset?.contactName || 'Contact';
      const contactStatus = context?.dataset?.contactStatus || 'New';

      if (action === 'task' && contactId) {
        openContactTaskDrawer(contactId, contactName, contactStatus, 'tasks');
        return;
      }
      if (action === 'comment' && contactId) {
        openContactTaskDrawer(contactId, contactName, contactStatus, 'comments');
        return;
      }
    });
  }

  const realtorActions = document.getElementById('realtorActionButtons');
  realtorActions?.addEventListener('click', (event) => {
    const button = event.target.closest('.table-icon-btn');
    if (!button) return;
    if (button.dataset.action === 'task') {
      openRealtorTaskDrawer('tasks');
    } else if (button.dataset.action === 'comment' && state.realtorId) {
      openRealtorTaskDrawer('comments');
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-task-drawer-close]')) {
      closeTaskDrawer();
    }
  });

  const backdrop = document.getElementById('task-drawer-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => closeTaskDrawer());
  }
}

async function init() {
  setRealtorIdFromURL();
  if (!state.realtorId) {
    alert('Missing realtor id');
    return;
  }

  try {
    const r = await fetchRealtor(state.realtorId);
    populateForm(r);
    updateHeaderFromInputs();
    disableEditor(true);
    setupAutosave();
    wireEditorToggle();

    // Load linked contacts and start the top bar + table
    state.allContacts = await fetchRelatedContacts(state.realtorId);
    initTopBar(state.allContacts);
    wireTaskButtons();
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
