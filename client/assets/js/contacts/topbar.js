// /assets/js/contacts/topbar.js
import { renderTable } from './render.js';
import { fetchMyCommunities } from './api.js';

const CORE_STATUSES = ['all','new','target','possible','negotiation','be-back','purchased'];
const EXTENDED_STATUSES = ['all','closed','cold','not-interested','deal-lost','bust'];
const COMMUNITY_ALL = 'all';
const COMMUNITY_UNASSIGNED = 'unassigned';

const state = {
  allContacts: [],
  communities: [], // [{ id, name }]
  currentCommunity: COMMUNITY_ALL,
  currentStatus: 'all',
  filterMode: 'core',
  sort: { field: null, dir: 1 }, // dir = 1 (asc), -1 (desc)
};

function getActiveStatuses() {
  return state.filterMode === 'core' ? CORE_STATUSES : EXTENDED_STATUSES;
}

function normalizeStatus(raw) {
  const s = String(raw || 'new').trim().toLowerCase();

  if (s.includes('negoti')) return 'negotiation';
  if (s.replace(/\s+/g, '-') === 'be-back' || (s.includes('be') && s.includes('back'))) return 'be-back';
  if (s.includes('not') && s.includes('interest')) return 'not-interested';
  if (s.includes('deal') && s.includes('lost')) return 'deal-lost';
  if (s === 'close' || s === 'closed') return 'closed';
  if (s === 'cold') return 'cold';
  if (s === 'bust' || s === 'busted') return 'bust';

  return s;
}

function unionStatuses() {
  const set = new Set([...CORE_STATUSES, ...EXTENDED_STATUSES]);
  set.delete('all');
  return ['all', ...Array.from(set)];
}

function countByStatus(contacts) {
  const keys = unionStatuses();
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  counts.all = contacts.length;

  contacts.forEach((c) => {
    const key = normalizeStatus(c.status);
    if (counts[key] != null) counts[key] += 1;
  });
  return counts;
}

function getContactCommunityEntries(contact) {
  const entries = [];
  const pushEntry = (id, name) => {
    if (!id) return;
    entries.push({
      id: String(id),
      name: name || contact?.communityName || contact?.community || '',
    });
  };

  const arrays = [contact?.communityIds, contact?.communities];
  arrays.forEach((arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => {
      if (!item) return;
      const id = item._id ?? item.id ?? item.value ?? item;
      const name = item.name ?? item.label ?? item.title ?? item.communityName ?? item.community ?? '';
      pushEntry(id, name);
    });
  });

  if (contact?.communityId) {
    pushEntry(contact.communityId, contact.communityName);
  }

  return entries;
}

function extractCommunityIds(contact) {
  const entries = getContactCommunityEntries(contact);
  const unique = new Set(entries.map((e) => e.id));
  return Array.from(unique);
}

function isUnassigned(contact) {
  return extractCommunityIds(contact).length === 0;
}

function contactMatchesCommunity(contact, key) {
  if (key === COMMUNITY_ALL) return true;
  if (key === COMMUNITY_UNASSIGNED) return isUnassigned(contact);
  const ids = extractCommunityIds(contact);
  return ids.includes(String(key));
}

function filterByCommunity(list, key) {
  if (key === COMMUNITY_ALL) return list;
  return list.filter((contact) => contactMatchesCommunity(contact, key));
}

function deriveCommunitiesFromContacts(contacts) {
  const map = new Map();
  contacts.forEach((contact) => {
    getContactCommunityEntries(contact).forEach(({ id, name }) => {
      if (!id) return;
      if (!map.has(id)) {
        map.set(id, { id, name: name || 'Community' });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function mapCommunitiesForState(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  list.forEach((item) => {
    if (!item) return;
    const id = item._id ?? item.id ?? item.value;
    if (!id) return;
    const name = item.name ?? item.label ?? '';
    map.set(String(id), { id: String(id), name: name || 'Community' });
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildCommunityOptions() {
  const base = [
    { value: COMMUNITY_ALL, label: 'All Contacts' },
    ...state.communities.map((c) => ({ value: c.id, label: c.name || 'Community' })),
  ];
  base.push({ value: COMMUNITY_UNASSIGNED, label: 'Unassigned' });
  return base;
}

function populateCommunities() {
  const select = document.getElementById('communitySelect');
  if (!select) return;

  const options = buildCommunityOptions();
  if (!options.some((opt) => opt.value === state.currentCommunity)) {
    state.currentCommunity = COMMUNITY_ALL;
  }

  select.innerHTML = '';
  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
  select.value = state.currentCommunity;

  if (!select.dataset.boundChange) {
    select.addEventListener('change', () => {
      state.currentCommunity = select.value;
      applyFilters();
    });
    select.dataset.boundChange = 'true';
  }
}

function applyFilters() {
  const { allContacts, currentCommunity, currentStatus } = state;

  let list = filterByCommunity(allContacts, currentCommunity);

  if (currentStatus !== 'all') {
    list = list.filter((c) => normalizeStatus(c.status) === currentStatus);
  }

  if (state.sort.field === 'visitDate') {
    list = [...list].sort((a, b) => {
      const da = a.visitDate ? new Date(a.visitDate) : null;
      const db = b.visitDate ? new Date(b.visitDate) : null;
      if (!da && !db) return 0;
      if (!da) return state.sort.dir === 1 ? -1 : 1;
      if (!db) return state.sort.dir === 1 ? 1 : -1;
      return state.sort.dir * (da - db);
    });
  }

  renderTable(list);

  const scoped = filterByCommunity(allContacts, currentCommunity);
  const counts = countByStatus(scoped);
  updateCounts(counts);
}

function pillLabel(key) {
  return key
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildStatusPills() {
  const container = document.getElementById('statusFilters');
  container.innerHTML = '';

  const statuses = getActiveStatuses();

  statuses.forEach((statusKey, idx) => {
    const btn = document.createElement("button");
    btn.className = `status-pill ${statusKey}`;
    if ((state.currentStatus === statusKey) ||
        (state.currentStatus !== "all" && !statuses.includes(state.currentStatus) && statusKey === "all") ||
        (state.currentStatus === "all" && idx === 0)) {
      btn.classList.add("active");
    }
    btn.dataset.status = statusKey;
    const label = document.createElement("span");
    label.className = "label";
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
  const totalEl = document.getElementById('countTotal');
  if (totalEl) totalEl.textContent = counts.all ?? 0;

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
    const nextMode = state.filterMode === 'core' ? 'extended' : 'core';
    const nextStatuses = nextMode === 'core' ? CORE_STATUSES : EXTENDED_STATUSES;
    state.filterMode = nextMode;
    if (!nextStatuses.includes(state.currentStatus)) {
      state.currentStatus = 'all';
    }

    buildStatusPills();
    updateLabel();
    applyFilters();
  });
}

const visitHeader = document.getElementById('visitDateHeader');
const arrow = document.getElementById('visitDateArrow');
if (arrow) arrow.textContent = '--';

visitHeader?.addEventListener('click', () => {
  if (state.sort.field === 'visitDate') {
    state.sort.dir = -state.sort.dir;
  } else {
    state.sort.field = 'visitDate';
    state.sort.dir = 1;
  }

  arrow.textContent = state.sort.dir === 1 ? '^' : 'v';
  applyFilters();
});

function bindReset() {
  const resetBtn = document.getElementById('resetFilters');
  resetBtn?.addEventListener('click', () => {
    state.currentCommunity = COMMUNITY_ALL;
    state.currentStatus = 'all';
    state.filterMode = 'core';
    state.sort = { field: null, dir: 1 };

    const select = document.getElementById('communitySelect');
    if (select) select.value = COMMUNITY_ALL;

    buildStatusPills();
    const toggleBtnReset = document.getElementById("toggleFilterMode");
    if (toggleBtnReset) toggleBtnReset.textContent = "More";

    const arrowEl = document.getElementById('visitDateArrow');
    if (arrowEl) arrowEl.textContent = '--';

    applyFilters();
  });
}

export async function initTopBar(contacts) {
  state.allContacts = contacts.slice();
  state.currentCommunity = COMMUNITY_ALL;

  try {
    state.communities = mapCommunitiesForState(await fetchMyCommunities());
  } catch (err) {
    console.warn('[contacts] Failed to load communities, falling back to contact data', err);
    state.communities = [];
  }

  if (!state.communities.length) {
    state.communities = deriveCommunitiesFromContacts(state.allContacts);
  }

  populateCommunities();
  buildStatusPills();
  initStatusButtons();
  initToggle();
  bindReset();
  applyFilters();
}
