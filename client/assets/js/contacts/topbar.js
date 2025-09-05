// /assets/js/contacts/topbar.js
import { renderTable } from './render.js';

const CORE_STATUSES = ['all','new','target','possible','negotiation','be-back','purchased'];
const EXTENDED_STATUSES = ['all','closed','cold','not-interested','deal-lost','bust'];

const state = {
  allContacts: [],
  currentCommunity: 'all',
  currentStatus: 'all',
  filterMode: 'core',
  sort: { field: null, dir: 1 }, // NEW: dir = 1 (asc), -1 (desc)
};


function getActiveStatuses() {
  return state.filterMode === 'core' ? CORE_STATUSES : EXTENDED_STATUSES;
}

// Flexible community resolver. Point this to your canonical field if you have one.
function getCommunityName(contact) {
  return (
    contact?.communityName ||
    contact?.linkedLot?.communityName ||
    contact?.linkedLot?.community ||
    contact?.community ||
    'Unassigned'
  );
}

function normalizeStatus(raw) {
  const s = String(raw || 'new').trim().toLowerCase();

  // canonicalize common variants
  if (s.includes('negoti')) return 'negotiation';
  if (s.replace(/\s+/g, '-') === 'be-back' || s.includes('be') && s.includes('back')) return 'be-back';
  if (s.includes('not') && s.includes('interest')) return 'not-interested';
  if (s.includes('deal') && s.includes('lost')) return 'deal-lost';

  // map synonyms that might appear in data
  if (s === 'close' || s === 'closed') return 'closed';
  if (s === 'cold') return 'cold';
  if (s === 'bust' || s === 'busted') return 'bust';

  // keep originals for core set
  // 'new','target','possible','negotiation','be-back','purchased'
  return s;
}

function buildCommunityList(contacts) {
  const set = new Set();
  contacts.forEach((c) => set.add(getCommunityName(c)));
  return ['All Contacts', ...Array.from(set).sort()];
}

function unionStatuses() {
  const set = new Set([...CORE_STATUSES, ...EXTENDED_STATUSES]);
  set.delete('all'); // we add it explicitly
  return ['all', ...Array.from(set)];
}

function countByStatus(contacts) {
  // counts across ALL known statuses so we can fill either view
  const keys = unionStatuses();
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  counts.all = contacts.length;

  contacts.forEach((c) => {
    const key = normalizeStatus(c.status);
    if (counts[key] != null) counts[key] += 1;
  });
  return counts;
}

function applyFilters() {
  const { allContacts, currentCommunity, currentStatus } = state;

  let list = allContacts;

  if (currentCommunity !== 'all') {
    list = list.filter((c) => getCommunityName(c) === currentCommunity);
  }

  if (currentStatus !== 'all') {
    list = list.filter((c) => normalizeStatus(c.status) === currentStatus);
  }
  if (state.sort.field === 'visitDate') {
  list = [...list].sort((a, b) => {
    const da = a.visitDate ? new Date(a.visitDate) : null;
    const db = b.visitDate ? new Date(b.visitDate) : null;

    // blanks handling
    if (!da && !db) return 0;
    if (!da) return state.sort.dir === 1 ? -1 : 1; // blanks first in asc, last in desc
    if (!db) return state.sort.dir === 1 ? 1 : -1; // blanks first in asc, last in desc

    return state.sort.dir * (da - db);
  });
}

  renderTable(list);

  // counts computed within current community scope
  const scoped = currentCommunity === 'all'
    ? allContacts
    : allContacts.filter((c) => getCommunityName(c) === currentCommunity);

  const counts = countByStatus(scoped);
  updateCounts(counts);
}

function populateCommunities(contacts) {
  const select = document.getElementById('communitySelect');
  select.innerHTML = '';

  const options = buildCommunityList(contacts);
  options.forEach((label) => {
    const opt = document.createElement('option');
    opt.value = label === 'All Contacts' ? 'all' : label;
    opt.textContent = label;
    select.appendChild(opt);
  });

  select.value = 'all';
  select.addEventListener('change', () => {
    state.currentCommunity = select.value;
    applyFilters();
  });
}

function pillLabel(key) {
  // Human-friendly labels
  return key
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildStatusPills() {
  const container = document.getElementById('statusFilters');
  container.innerHTML = ''; // swap view

  const statuses = getActiveStatuses();

  statuses.forEach((statusKey, idx) => {
    const btn = document.createElement('button');
    btn.className = `status-pill ${statusKey}`;
    if ((state.currentStatus === statusKey) ||
        (state.currentStatus !== 'all' && !statuses.includes(state.currentStatus) && statusKey === 'all') ||
        (state.currentStatus === 'all' && idx === 0)) {
      btn.classList.add('active');
    }
    btn.dataset.status = statusKey;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = pillLabel(statusKey);

    const value = document.createElement('span');
    value.className = 'value';
    value.dataset.count = statusKey;
    value.textContent = '0';

    btn.append(label, value);
    container.appendChild(btn);
  });
}

function initStatusButtons() {
  const container = document.getElementById('statusFilters');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-pill');
    if (!btn) return;

    container.querySelectorAll('.status-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    state.currentStatus = btn.dataset.status || 'all';
    applyFilters();
  });
}

function updateCounts(counts) {
  // total count
  const totalEl = document.getElementById('countTotal');
  if (totalEl) totalEl.textContent = counts.all ?? 0;

  // visible pills only
  document.querySelectorAll('#statusFilters .status-pill .value').forEach((el) => {
    const key = el.dataset.count;
    el.textContent = counts[key] ?? 0;
  });
}

function initToggle() {
  const toggleBtn = document.getElementById('toggleFilterMode');
  const updateLabel = () => {
    toggleBtn.textContent = state.filterMode === 'core' ? 'More' : 'Back';
  };
  updateLabel();

  toggleBtn.addEventListener('click', () => {
    // preserve current status if it exists in next mode; otherwise fall back to 'all'
    const nextMode = state.filterMode === 'core' ? 'extended' : 'core';
    const nextStatuses = nextMode === 'core' ? CORE_STATUSES : EXTENDED_STATUSES;
    state.filterMode = nextMode;
    if (!nextStatuses.includes(state.currentStatus)) {
      state.currentStatus = 'all';
    }

    buildStatusPills();
    updateLabel();
    applyFilters(); // re-render & update counts for the newly visible pills
  });
}
const visitHeader = document.getElementById('visitDateHeader');
const arrow = document.getElementById('visitDateArrow');

visitHeader?.addEventListener('click', () => {
  if (state.sort.field === 'visitDate') {
    // toggle direction
    state.sort.dir = -state.sort.dir;
  } else {
    state.sort.field = 'visitDate';
    state.sort.dir = 1;
  }

  arrow.textContent = state.sort.dir === 1 ? '▲' : '▼';
  applyFilters();
});


export function initTopBar(contacts) {
  state.allContacts = contacts.slice();
  populateCommunities(state.allContacts);
  buildStatusPills();
  initStatusButtons();
  initToggle();

  const resetBtn = document.getElementById('resetFilters');
resetBtn?.addEventListener('click', () => {
  state.currentCommunity = 'all';
  state.currentStatus = 'all';
  state.filterMode = 'core';
  state.sort = { field: null, dir: 1 };

  // Reset dropdown
  document.getElementById('communitySelect').value = 'all';

  // Rebuild pills (go back to core)
  buildStatusPills();

  // Reset arrow in Visit Date header
  const arrow = document.getElementById('visitDateArrow');
  if (arrow) arrow.textContent = '▲▼';

  applyFilters();
});

  // initial render
  applyFilters();
}
