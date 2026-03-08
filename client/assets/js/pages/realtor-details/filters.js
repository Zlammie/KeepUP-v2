// Realtor filters: All + Main/More swap, counts, canonical status + search/community
// Plain JS (no TS operators), safe in all modern browsers.

import { dom } from './domCache.js';
import { state } from './state.js';
import { debounce } from './utils.js';
import { renderTable, updateResultCount } from './table.js';

/* ===== Canonicalization ===== */
const CANON = new Map([
  ['new','New'], ['target','Target'], ['possible','Possible'],
  ['negotiating','Negotiating'], ['be-back','Be-Back'], ['be back','Be-Back'],
  ['cold','Cold'], ['purchased','Purchased'], ['closed','Closed'],
  ['not-interested','Not-Interested'], ['not interested','Not-Interested'],
  ['deal-lost','Deal-Lost'], ['deal lost','Deal-Lost'],
  ['bust','Bust'],
]);

function normalizeStatus(s) {
  if (!s) return '';
  const raw = String(s).trim();
  const lower = raw.toLowerCase();
  const hy = lower.replace(/\s+/g, '-');
  return CANON.get(hy) || CANON.get(lower) || raw;
}
function slugStatus(s) {
  return normalizeStatus(s).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}
function countByStatusNormalized(list) {
  const m = Object.create(null);
  for (const c of list) {
    const k = normalizeStatus(c.status);
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

/* ===== Sets & UI mode ===== */
const MAIN_SET = ['New','Target','Possible','Negotiating','Be-Back','Purchased','Closed','Deal-Lost'];
const MORE_SET = ['Cold','Bust','Not-Interested'];
let showMore = false; // false = MAIN_SET, true = MORE_SET

/* ===== Search & Community ===== */
export function wireSearch() {
  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', debounce(applyFiltersAndRender, 200));
  }
}
export function buildCommunityOptions() {
  const set = new Set();
  state.allContacts.forEach(c => {
    if (Array.isArray(c.communities)) c.communities.forEach(x => x && set.add(x));
    else if (c.communities) set.add(c.communities);
  });
  [...set].sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    dom.communitySel.appendChild(opt);
  });
  dom.communitySel.addEventListener('change', applyFiltersAndRender);
}

/* ===== Status pills (ALL + swapper) ===== */
export function buildStatusChips() {
  renderStatusPills();
}

function renderStatusPills() {
  dom.statusChips.innerHTML = '';

  // ALL pill
  const allPill = document.createElement('button');
  allPill.type = 'button';
  allPill.className = 'status-pill';
  allPill.dataset.status = '__ALL__';
  allPill.innerHTML = `<span class="label">All</span> <span class="value">0</span>`;
  allPill.addEventListener('click', () => {
    state.activeStatuses.clear();
    dom.statusChips.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
    allPill.classList.add('active');
    applyFiltersAndRender();
  });
  dom.statusChips.appendChild(allPill);

  // Decide which statuses to show
  const presentCanon = new Set(state.allContacts.map(c => normalizeStatus(c.status)).filter(Boolean));
  const baseOrder = showMore ? MORE_SET : MAIN_SET;
  const want = baseOrder.filter(s => presentCanon.has(s) || (state.statusOptions || []).includes(s));

  // Build visible pills
  for (const status of want) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `status-pill ${slugStatus(status)}`;
    pill.dataset.status = status; // canonical
    pill.innerHTML = `<span class="label">${status}</span> <span class="value">0</span>`;
    pill.addEventListener('click', () => {
      // selecting any specific status deactivates All
      const allBtn = dom.statusChips.querySelector('[data-status="__ALL__"]');
      if (allBtn) allBtn.classList.remove('active');

      if (state.activeStatuses.has(status)) {
        state.activeStatuses.delete(status);
        pill.classList.remove('active');
      } else {
        state.activeStatuses.add(status);
        pill.classList.add('active');
      }
      applyFiltersAndRender();
    });
    dom.statusChips.appendChild(pill);
  }

  // MORE / MAIN swap button (right aligned via CSS)
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.id = 'statusMoreBtn';
  swap.className = 'status-more';
  swap.textContent = showMore ? 'Main' : 'More';
  swap.addEventListener('click', () => {
    showMore = !showMore;
    state.activeStatuses.clear();     // avoid hidden active filters
    renderStatusPills();              // rebuild pills
    applyFiltersAndRender();          // update counts + table
  });
  dom.statusChips.appendChild(swap);

  // Start with All active
  allPill.classList.add('active');
}

/* Update counts on visible pills (incl. All) */
function updateStatusCounts(baseList) {
  const counts = countByStatusNormalized(baseList);

  const allVal = dom.statusChips.querySelector('[data-status="__ALL__"] .value');
  if (allVal) allVal.textContent = String(baseList.length);

  dom.statusChips.querySelectorAll('.status-pill').forEach(p => {
    const s = p.dataset.status;
    if (!s || s === '__ALL__') return;
    const v = p.querySelector('.value');
    if (v) v.textContent = String(counts[s] || 0);
  });
}

/* ===== Main filtering pipeline ===== */
export function applyFiltersAndRender() {
  const q = (dom.searchInput ? dom.searchInput.value : '').trim().toLowerCase();
  const community = dom.communitySel ? dom.communitySel.value : '';

  // 1) Base = search + community
  let base = state.allContacts.slice();

  if (q) {
    base = base.filter(c => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const comm  = Array.isArray(c.communities) ? c.communities.join(', ').toLowerCase()
                   : (c.communities || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || comm.includes(q);
    });
  }
  if (community) {
    base = base.filter(c =>
      Array.isArray(c.communities) ? c.communities.includes(community) : c.communities === community
    );
  }

  // Update pill counts for the base list
  updateStatusCounts(base);

  // 2) Apply status selections (canonical)
  let finalRows = base;
  if (state.activeStatuses.size > 0) {
    finalRows = finalRows.filter(c => state.activeStatuses.has(normalizeStatus(c.status)));
  }

  renderTable(finalRows);
  updateResultCount(finalRows.length, state.allContacts.length);
}
