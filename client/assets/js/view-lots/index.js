// Entry point — fetch data, seed UI, and wire listeners
import { state } from './state.js';
import { loadCommunities, loadLots } from './api.js';
import { renderRows, updateCount, applyClientFilters } from './render.js';
import { bindEvents } from './events.js';
import { initTaskPanel } from '../contact-details/tasks.js';

document.addEventListener('DOMContentLoaded', init);

const taskBackdropEl = document.getElementById('task-drawer-backdrop');
const todoPanelEl = document.getElementById('todo-panel');
const taskDrawerNameEl = document.getElementById('task-panel-contact-name');
const lotsTableEl = document.getElementById('lotsTable');

let taskPanelInstance = null;
let taskLoadQueue = Promise.resolve();

function ensureTaskPanel() {
  if (!taskPanelInstance) {
    const currentUserId = document.body.dataset.currentUserId || '';
    taskPanelInstance = initTaskPanel({
      currentUserId,
      defaultAssignmentTarget: 'contact'
    });
  }
  return Boolean(taskPanelInstance);
}

function showTaskDrawer(name) {
  if (!ensureTaskPanel()) return false;
  if (taskDrawerNameEl) {
    taskDrawerNameEl.textContent = name || 'Lot';
  }
  if (todoPanelEl) {
    todoPanelEl.dataset.context = 'lot';
    todoPanelEl.removeAttribute('hidden');
  }
  taskBackdropEl?.removeAttribute('hidden');
  document.body.classList.add('task-panel-open');
  return true;
}

function closeTaskDrawer() {
  document.body.classList.remove('task-panel-open');
  taskBackdropEl?.setAttribute('hidden', 'true');
  if (todoPanelEl) {
    todoPanelEl.setAttribute('hidden', 'true');
    delete todoPanelEl.dataset.context;
  }
}

async function openTaskDrawerForLot(meta, tabKey = 'tasks') {
  if (!meta?.lotId) return;
  const displayName = (meta.address || meta.jobNumber || '').trim() || 'Lot';
  if (!showTaskDrawer(displayName)) return;

  const titleBuilder = () => {
    const addr = (meta.address || '').trim();
    return addr ? `Follow up on ${addr}` : 'Follow up on this lot';
  };

  taskLoadQueue = taskLoadQueue
    .catch(() => {})
    .then(() => taskPanelInstance?.setContext?.({
        contactId: null,
        linkedModel: 'Lot',
        linkedId: meta.lotId,
        assignmentTarget: 'contact',
        defaultTitleBuilder: titleBuilder
      }))
    .then(() => taskPanelInstance?.setActiveTab?.(tabKey || 'tasks'))
    .catch((err) => {
      console.error('[view-lots] Failed to open task drawer', err);
    });

  await taskLoadQueue;
}

function bindTaskDrawerUI() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-task-drawer-close]')) {
      closeTaskDrawer();
    }
  });
  taskBackdropEl?.addEventListener('click', () => closeTaskDrawer());
}

function bindTaskActions() {
  lotsTableEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('.table-icon-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action !== 'task' && action !== 'comment') return;

    event.preventDefault();
    event.stopPropagation();

    const lotId = btn.dataset.lotId;
    if (!lotId) return;

    const meta = {
      lotId,
      communityId: btn.dataset.communityId || state.communityId || null,
      address: btn.dataset.address || '',
      jobNumber: btn.dataset.jobNumber || ''
    };
    const tab = action === 'comment' ? 'comments' : 'tasks';
    openTaskDrawerForLot(meta, tab);
  });
}

async function init() {
  bindTaskDrawerUI();
  bindTaskActions();

  // 1) communities
  await loadCommunities();
  // make communities visible to events.js for first-select logic
  window.__communities = state.communities;

  // 2) preselect community + bind events
  bindEvents();

  // 3) initial lots
  const lots = await loadLots();
  const filtered = applyClientFilters(lots, state.filters);
  renderRows(filtered);
  updateCount(filtered.length);
}
