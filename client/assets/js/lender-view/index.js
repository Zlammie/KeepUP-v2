import { setLenderIdFromURL, state } from './state.js';
import { fetchLender, fetchRelatedContacts } from './api.js';
import { dom } from './domCache.js';
import { updateHeader, disableEditor, wireEditorToggle } from './identity.js';
import { populateForm, setupAutosave } from './editor.js';
import { initTopBar } from './topbar.js';
import { renderTable, renderPurchasedTable } from './table.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { initState } from '../contact-details/state.js';

const normalizeStatus = (raw = '') => {
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (s.includes('sub') && s.includes('application')) return 'sub-application';
  if (s.includes('sub') && s.includes('doc')) return 'sub-docs';
  if (s.includes('missing') && s.includes('doc')) return 'missing-docs';
  if (s.includes('cannot') && s.includes('qual')) return 'cannot-qualify';
  return s;
};

const pickLenderEntry = (contact) => {
  const entries = contact?.lenders || [];
  const target = state.lenderId ? String(state.lenderId) : null;
  if (target) {
    const match = entries.find((entry) => {
      const entryId = entry?.lender?._id || entry?.lender;
      return entryId && String(entryId) === target;
    });
    if (match) return match;
  }
  return entries[0] || null;
};

const hasLinkedLotLocal = (contact = {}) => {
  const lot = contact.linkedLot || {};
  return Boolean(
    contact.lotId ||
    lot.lotId ||
    lot.communityId ||
    lot.address ||
    lot.jobNumber ||
    lot.block ||
    lot.phase ||
    lot.lot
  );
};

const computePurchasedFlag = (contact = {}) => {
  const status = String(contact.status || '').trim().toLowerCase();
  return status === 'purchased';
};

const annotateContacts = (list = []) =>
  list.map((contact) => {
    const entry = pickLenderEntry(contact);
    return {
      ...contact,
      _lenderStatus: normalizeStatus(entry?.status || ''),
      _purchasedWithLot: computePurchasedFlag(contact),
      _hasLinkedLot: hasLinkedLotLocal(contact)
    };
  });

const TAB = { ALL: 'all', PURCHASED: 'purchased' };

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

function getLenderDisplayName() {
  const raw = dom.hdrName?.textContent || '';
  const trimmed = raw.trim();
  return trimmed || 'Lender';
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
      console.error('[lender-view] Failed to load contact for tasks', err);
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

async function openLenderTaskDrawer(tabKey = 'tasks') {
  if (!state.lenderId) return;
  const lenderName = getLenderDisplayName();
  if (!showTaskDrawer(lenderName, 'lender')) return;

  const lenderTitleBuilder = () => {
    const name = getLenderDisplayName();
    return name ? `Follow up with ${name}` : 'Follow up with this lender';
  };

  currentTaskPromise = currentTaskPromise
    .catch(() => {})
    .then(() => {
      taskPanelInstance.setContext?.({
        contactId: null,
        linkedModel: 'Lender',
        linkedId: state.lenderId,
        assignmentTarget: 'lender',
        defaultTitleBuilder: lenderTitleBuilder,
        lenderOptions: [
          {
            id: state.lenderId,
          name: lenderName,
          isPrimary: true
        }
      ]
    });
      taskPanelInstance.setActiveTab?.(tabKey || 'tasks');
    })
    .catch((err) => {
      console.error('[lender-view] Failed to open lender tasks', err);
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
  const tables = document.querySelectorAll('.linked-table');
  tables.forEach((table) => {
    table.addEventListener('click', (event) => {
      const button = event.target.closest('.table-icon-btn');
      if (!button) return;
      const context = button.closest('.table-action-buttons');
      if (!context) return;
      const action = button.dataset.action;
      const contactId = context.dataset.contact;
      if ((action === 'task' || action === 'comment') && contactId) {
        const contactName = context.dataset.contactName || 'Contact';
        const contactStatus = context.dataset.contactStatus || 'New';
        const tabKey = action === 'comment' ? 'comments' : 'tasks';
        openContactTaskDrawer(contactId, contactName, contactStatus, tabKey);
      }
    });
  });

  const lenderActions = document.getElementById('lenderActionButtons');
  lenderActions?.addEventListener('click', (event) => {
    const button = event.target.closest('.table-icon-btn');
    if (!button) return;
    if (button.dataset.action === 'task') {
      openLenderTaskDrawer('tasks');
    } else if (button.dataset.action === 'comment') {
      openLenderTaskDrawer('comments');
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

function toggleTabs(target = TAB.ALL) {
  const { tabs } = dom;
  if (!tabs) return;
  const showPurchased = target === TAB.PURCHASED;

  tabs.allPanel?.classList.toggle('is-hidden', showPurchased);
  tabs.purchasedPanel?.classList.toggle('is-hidden', !showPurchased);

  tabs.allBtn?.classList.toggle('active', !showPurchased);
  tabs.purchasedBtn?.classList.toggle('active', showPurchased);

  tabs.allBtn?.setAttribute('aria-selected', (!showPurchased).toString());
  tabs.purchasedBtn?.setAttribute('aria-selected', showPurchased.toString());
  tabs.allPanel?.setAttribute('aria-hidden', showPurchased ? 'true' : 'false');
  tabs.purchasedPanel?.setAttribute('aria-hidden', showPurchased ? 'false' : 'true');
}

function initTabs() {
  const { tabs } = dom;
  if (!tabs?.allBtn || !tabs?.purchasedBtn) return;

  tabs.allBtn.addEventListener('click', () => toggleTabs(TAB.ALL));
  tabs.purchasedBtn.addEventListener('click', () => toggleTabs(TAB.PURCHASED));

  toggleTabs(TAB.ALL);
}

async function init(){
  setLenderIdFromURL();
  if(!state.lenderId){ alert('Missing lender id'); return; }

  try{
    // Load lender & populate
    const lender = await fetchLender(state.lenderId);
    populateForm(lender);
    updateHeader();
    disableEditor(true);
    wireEditorToggle();
    setupAutosave();

    // Load related contacts & boot top bar + table
    const contacts = await fetchRelatedContacts(state.lenderId);
    state.allContacts = annotateContacts(contacts);
    state.purchasedContacts = state.allContacts.filter((contact) => contact._purchasedWithLot);

    // initial table render; topbar will re-render as filters change
    renderTable(state.allContacts);
    renderPurchasedTable(state.purchasedContacts);

    // kick off top bar (counts + filtering + More/Back + community)
    initTopBar(state.allContacts);
    initTabs();
    wireTaskButtons();
  }catch(err){
    console.error(err);
    if(dom.tableBody) dom.tableBody.innerHTML = `<tr><td colspan="9">Error loading data.</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

