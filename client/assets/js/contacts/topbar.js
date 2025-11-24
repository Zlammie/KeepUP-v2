// /assets/js/contacts/topbar.js
import { renderTable } from './render.js';
import { fetchMyCommunities, createContact } from './api.js';

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
  attentionOnly: false,
  sort: { field: null, dir: 1 }, // dir = 1 (asc), -1 (desc)
  searchTerm: '',
  isCreating: false,
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

function normalizeDigits(value) {
  return (value || '')
    .toString()
    .replace(/\D+/g, '');
}

function contactMatchesSearch(contact, lowerTerm, digitTerm) {
  if (!lowerTerm && !digitTerm) return true;

  const textParts = [
    contact.firstName,
    contact.lastName,
    `${contact.firstName || ''} ${contact.lastName || ''}`,
    contact.email,
    contact.status,
  ]
    .filter(Boolean)
    .map((value) => value.toString().toLowerCase());

  if (lowerTerm && textParts.some((value) => value.includes(lowerTerm))) {
    return true;
  }

  if (digitTerm) {
    const phoneDigits = normalizeDigits(contact.phone);
    if (phoneDigits && phoneDigits.includes(digitTerm)) {
      return true;
    }
  }

  return false;
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

function bindSearchInput() {
  const input = document.getElementById('contactsSearchInput');
  if (!input) return;

  input.addEventListener('input', (event) => {
    state.searchTerm = (event.target.value || '').trim();
    applyFilters();
  });
}

function serializeInlineLeadForm(form) {
  const formData = new FormData(form);
  const trimValue = (key) => (formData.get(key) || '').toString().trim();

  const payload = {
    firstName: trimValue('firstName'),
    lastName: trimValue('lastName'),
    email: trimValue('email'),
    phone: trimValue('phone'),
    status: (formData.get('status') || 'New').toString(),
  };

  const visitDate = formData.get('visitDate');
  if (visitDate) payload.visitDate = visitDate;

  Object.keys(payload).forEach((key) => {
    if (payload[key] === '') {
      delete payload[key];
    }
  });

  return payload;
}

function upsertContact(contact) {
  if (!contact) return;
  const id = contact._id || contact.id;
  if (!id) return;

  const normalized = {
    status: contact.status || 'New',
    ...contact,
  };

  const idx = state.allContacts.findIndex((item) => String(item._id) === String(id));
  if (idx >= 0) {
    state.allContacts[idx] = { ...state.allContacts[idx], ...normalized };
  } else {
    state.allContacts.unshift(normalized);
  }
}

function showInlineLeadForm() {
  const form = document.getElementById('inlineLeadForm');
  const addBtn = document.getElementById('inlineAddLeadBtn');
  const searchWrapper = document.getElementById('contactsSearchWrapper');
  if (!form || !addBtn) return;

  state.isCreating = true;
  form.classList.remove('d-none');
  addBtn.disabled = true;
  addBtn.setAttribute('aria-expanded', 'true');
  searchWrapper?.classList.add('d-none');

  const firstInput = form.querySelector('input[name="firstName"]');
  if (firstInput) firstInput.focus();
}

function hideInlineLeadForm() {
  const form = document.getElementById('inlineLeadForm');
  const addBtn = document.getElementById('inlineAddLeadBtn');
  const searchWrapper = document.getElementById('contactsSearchWrapper');
  if (!form || !addBtn) return;

  state.isCreating = false;
  form.classList.add('d-none');
  form.reset();
  addBtn.disabled = false;
  addBtn.setAttribute('aria-expanded', 'false');
  searchWrapper?.classList.remove('d-none');
}

function initInlineLeadForm() {
  const form = document.getElementById('inlineLeadForm');
  const addBtn = document.getElementById('inlineAddLeadBtn');
  if (!form || !addBtn) return;

  const cancelBtn = document.getElementById('cancelInlineLead');

  addBtn.addEventListener('click', () => {
    if (state.isCreating) return;
    showInlineLeadForm();
  });

  cancelBtn?.addEventListener('click', () => {
    hideInlineLeadForm();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;

    form.dataset.submitting = 'true';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn?.setAttribute('disabled', 'true');

    try {
      const payload = serializeInlineLeadForm(form);
      const result = await createContact(payload);
      const contact = result?.contact || result;
      if (!contact) throw new Error('Contact not returned from server');

      upsertContact(contact);
      hideInlineLeadForm();
      applyFilters();
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Failed to save contact. Please try again.');
    } finally {
      form.dataset.submitting = 'false';
      submitBtn?.removeAttribute('disabled');
    }
  });
}

function applyFilters() {
  const { allContacts, currentCommunity, currentStatus } = state;

  let list = filterByCommunity(allContacts, currentCommunity);

  if (currentStatus !== 'all') {
    list = list.filter((c) => normalizeStatus(c.status) === currentStatus);
  }

  if (state.attentionOnly) {
    list = list.filter((c) => !!c.requiresAttention);
  }

  const rawSearch = (state.searchTerm || '').trim();
  if (rawSearch) {
    const lowerTerm = rawSearch.toLowerCase();
    const digitTerm = rawSearch.replace(/\D+/g, '');
    list = list.filter((c) => contactMatchesSearch(c, lowerTerm, digitTerm));
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

document.addEventListener('contacts:status-updated', (event) => {
  const detail = event.detail || {};
  const contactId = detail.contactId;
  if (!contactId) return;

  const match = state.allContacts.find((c) => String(c._id) === String(contactId));
  if (match && detail.status) {
    match.status = detail.status;
  }

  applyFilters();
});

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
    state.searchTerm = '';
    state.attentionOnly = false;

    const select = document.getElementById('communitySelect');
    if (select) select.value = COMMUNITY_ALL;
    const searchInput = document.getElementById('contactsSearchInput');
    if (searchInput) searchInput.value = '';
    const attentionToggle = document.getElementById('attentionFilterToggle');
    if (attentionToggle) {
      attentionToggle.classList.remove('active');
      attentionToggle.setAttribute('aria-pressed', 'false');
    }

    hideInlineLeadForm();

    buildStatusPills();
    const toggleBtnReset = document.getElementById("toggleFilterMode");
    if (toggleBtnReset) toggleBtnReset.textContent = "More";

    const arrowEl = document.getElementById('visitDateArrow');
    if (arrowEl) arrowEl.textContent = '--';

    applyFilters();
  });
}

function bindAttentionFilter() {
  const toggle = document.getElementById('attentionFilterToggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    state.attentionOnly = !state.attentionOnly;
    toggle.classList.toggle('active', state.attentionOnly);
    toggle.setAttribute('aria-pressed', state.attentionOnly ? 'true' : 'false');
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
  bindSearchInput();
  initInlineLeadForm();
  buildStatusPills();
  initStatusButtons();
  initToggle();
  bindAttentionFilter();
  bindReset();
  applyFilters();
}
