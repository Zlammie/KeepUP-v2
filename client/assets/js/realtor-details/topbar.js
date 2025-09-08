// /assets/js/realtor-details/topbar.js
// Drives the contacts-style top bar on the Realtor details page

import { renderTable } from './table.js';

/* ---------- State ---------- */
const S = {
  allContacts: [],
  currentCommunity: 'all',  // 'all' or a community name
  currentStatus: 'all',     // 'all' or one of the status keys below
  mode: 'main',             // 'main' | 'more'
};

/* ---------- Status sets & normalization ---------- */
const MAIN_SET = ['all','new','target','possible','negotiation','be-back','purchased','closed','deal-lost'];
const MORE_SET = ['all','cold','bust','not-interested'];

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('negoti')) return 'negotiation';
  if (s.replace(/\s+/g,'-') === 'be-back') return 'be-back';
  if (s.includes('be') && s.includes('back')) return 'be-back';
  if (s.includes('not') && s.includes('interest')) return 'not-interested';
  if (s.includes('deal') && s.includes('lost')) return 'deal-lost';
  if (s === 'close' || s === 'closed') return 'closed';
  if (s === 'busted') return 'bust';
  if (s === 'purchase' || s === 'purchased') return 'purchased';
  return s; // new, target, possible, cold, bust, etc.
}

function visibleStatuses() { return S.mode === 'main' ? MAIN_SET : MORE_SET; }
function pillText(key) { return key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

/* ---------- Community helpers ---------- */
// contact.communities may be string or string[]
function hasCommunity(contact, community) {
  if (community === 'all') return true;
  const cs = contact?.communities;
  if (Array.isArray(cs)) return cs.includes(community);
  if (typeof cs === 'string') return cs === community;
  return false;
}

function collectCommunities(contacts) {
  const set = new Set();
  contacts.forEach(c => {
    const cs = c?.communities;
    if (Array.isArray(cs)) cs.forEach(x => x && set.add(x));
    else if (typeof cs === 'string' && cs) set.add(cs);
  });
  return ['all', ...Array.from(set).sort()];
}

/* ---------- Counts ---------- */
function countByStatus(list) {
  const counts = Object.create(null);
  // seed keys we show
  [...new Set([...MAIN_SET, ...MORE_SET])].forEach(k => counts[k] = 0);
  counts.all = list.length;
  list.forEach(c => {
    const k = normalizeStatus(c.status);
    if (k && counts[k] !== undefined) counts[k] += 1;
  });
  return counts;
}

/* ---------- Build pills UI (uses existing HTML container) ---------- */
function buildPills() {
  const box = document.getElementById('statusFilters');
  if (!box) return;
  box.innerHTML = '';

  const keys = visibleStatuses();
  keys.forEach((key, idx) => {
    const btn = document.createElement('button');
    btn.className = `status-pill ${key}`;
    btn.dataset.status = key;
    if ((S.currentStatus === key) || (S.currentStatus === 'all' && idx === 0)) {
      btn.classList.add('active');
    }
    btn.innerHTML = `<span class="label">${pillText(key)}</span><span class="value" data-count="${key}">0</span>`;
    box.appendChild(btn);
  });
}

function wirePills() {
  const box = document.getElementById('statusFilters');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-pill');
    if (!btn) return;
    const key = btn.dataset.status || 'all';

    // toggle selection (single-select like contacts top bar)
    box.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    S.currentStatus = key;
    applyFilters();
  });
}

/* ---------- Community select ---------- */
function populateCommunitySelect() {
  const sel = document.getElementById('communitySelect');
  if (!sel) return;
  sel.innerHTML = '';
  collectCommunities(S.allContacts).forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val === 'all' ? 'All Contacts' : val;
    sel.appendChild(opt);
  });
  sel.value = 'all';
  sel.addEventListener('change', () => {
    S.currentCommunity = sel.value;
    applyFilters();
  });
}

/* ---------- Toggle "More" / "Back" ---------- */
function wireModeToggle() {
  const btn = document.getElementById('toggleFilterMode');
  if (!btn) return;
  const setLabel = () => { btn.textContent = S.mode === 'main' ? 'More' : 'Back'; };
  setLabel();
  btn.addEventListener('click', () => {
    S.mode = S.mode === 'main' ? 'more' : 'main';
    // when switching sets, snap selection to All
    S.currentStatus = 'all';
    buildPills();
    setLabel();
    applyFilters();
  });
}

/* ---------- Reset button ---------- */
function wireReset() {
  const btn = document.getElementById('resetFilters');
  if (!btn) return;
  btn.addEventListener('click', () => {
    S.currentCommunity = 'all';
    S.currentStatus = 'all';
    S.mode = 'main';
    const sel = document.getElementById('communitySelect');
    if (sel) sel.value = 'all';
    buildPills();
    wirePills(); // ensure listeners exist after rebuild
    wireModeToggle();
    applyFilters();
  });
}

/* ---------- Apply filters + update counts/table ---------- */
function applyFilters() {
  const scopedByCommunity = S.currentCommunity === 'all'
    ? S.allContacts
    : S.allContacts.filter(c => hasCommunity(c, S.currentCommunity));

  let rows = scopedByCommunity;
  if (S.currentStatus !== 'all') {
    rows = rows.filter(c => normalizeStatus(c.status) === S.currentStatus);
  }

  // Render table
  renderTable(rows);

  // Update counts in visible pills + total
  const counts = countByStatus(scopedByCommunity);
  const totalEl = document.getElementById('countTotal');
  if (totalEl) totalEl.textContent = String(rows.length);

  document.querySelectorAll('#statusFilters .value').forEach(span => {
    const key = span.getAttribute('data-count');
    span.textContent = String(counts[key] || 0);
  });
}

/* ---------- Public init ---------- */
export function initTopBar(contacts) {
  S.allContacts = Array.isArray(contacts) ? contacts.slice() : [];

  populateCommunitySelect();
  buildPills();
  wirePills();
  wireModeToggle();
  wireReset();
  applyFilters(); // initial render
}
