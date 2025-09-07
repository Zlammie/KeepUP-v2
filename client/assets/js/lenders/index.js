// /assets/js/lenders/index.js
import { fetchLenders } from './api.js';
import { renderTable } from './render.js';

const state = {
  allLenders: [],
  statsByLender: new Map(),
  search: '',
  filter: 'all' // 'all' | 'has-invited' | 'purchased-not-approved' | 'has-purchased'
};
function matchesSearch(l, q) {
  if (!q) return true;
  const t = q.toLowerCase();
  // Include brokerage/company field (lenderBrokerage) so users can search by company
  const fields = [
    l.firstName, l.lastName, l.email, l.phone, l.lenderBrokerage
  ].map(v => String(v || '').toLowerCase());
  return fields.some(v => v.includes(t));
}
async function fetchContacts() {
  const res = await fetch('/api/contacts');
  if (!res.ok) throw new Error('Failed to fetch contacts');
  return res.json();
}

function lenderPassesFilter(l) {
  const s = state.statsByLender.get(l._id) || { invited: 0, purchasedNotApproved: 0, purchased: 0 };
  switch (state.filter) {
    case 'has-invited':            return s.invited > 0;
    case 'purchased-not-approved': return s.purchasedNotApproved > 0;
    case 'has-purchased':          return s.purchased > 0;
    default:                       return true;
  }
}

function applyFilters() {
  // scope list by search + filter
  const list = state.allLenders
    .filter(l => matchesSearch(l, state.search))
    .filter(l => lenderPassesFilter(l));

  // render the scoped list with the same stats map
  renderTable(list, state.statsByLender);

  // update pill counters (scoped to current search!)
  const counts = {
    all: list.length,
    'has-invited':            list.filter(l => (state.statsByLender.get(l._id)?.invited || 0) > 0).length,
    'purchased-not-approved': list.filter(l => (state.statsByLender.get(l._id)?.purchasedNotApproved || 0) > 0).length,
    'has-purchased':          list.filter(l => (state.statsByLender.get(l._id)?.purchased || 0) > 0).length,
  };

  const totalEl = document.getElementById('lenderTotal');
  if (totalEl) totalEl.textContent = counts.all;

  Object.entries(counts).forEach(([k,v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });
}

function initTopBar() {
  const searchEl = document.getElementById('lenderSearch');
  const filterBox = document.getElementById('lenderFilters');
  const resetBtn  = document.getElementById('resetLenderFilters'); // add if you want a Reset button

  // search (debounced)
  let t = null;
  searchEl?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.search = searchEl.value.trim();
      applyFilters();
    }, 200);
  });

  // pill filters
  filterBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-pill');
    if (!btn) return;
    filterBox.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter || 'all';
    applyFilters();
  });

  // optional reset
  resetBtn?.addEventListener('click', () => {
    state.search = '';
    state.filter = 'all';
    if (searchEl) searchEl.value = '';
    filterBox?.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    filterBox?.querySelector('.status-pill[data-filter="all"]')?.classList.add('active');
    applyFilters();
  });
}

// --- helpers: read lender links from contact.lenders[] ---
function getLinkedLenderIds(contact) {
  if (!Array.isArray(contact?.lenders)) return [];
  const ids = new Set();
  for (const rel of contact.lenders) {
    const v = rel?.lender;
    if (!v) continue;
    ids.add(typeof v === 'object' ? String(v._id ?? v) : String(v));
  }
  return Array.from(ids);
}

function getLenderRel(contact, lenderId) {
  if (!Array.isArray(contact?.lenders)) return null;
  const idStr = String(lenderId);
  return contact.lenders.find(rel => {
    const v = rel?.lender;
    const relId = typeof v === 'object' ? String(v._id ?? v) : String(v);
    return relId === idStr;
  }) || null;
}

// --- status normalizers ---
function normalizeContactStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('negoti')) return 'negotiation';
  if ((s.includes('be') && s.includes('back')) || s.replace(/\s+/g,'-') === 'be-back') return 'be-back';
  if (s === 'close' || s === 'closed') return 'closed';
  return s; // new, target, possible, purchased, cold, etc.
}

function normalizeRelStatus(raw) {
  // contact.lenders[].status is stored lowercase by schema; normalize safely
  return String(raw || '').toLowerCase().replace(/[^a-z]/g,'');
}


// invited set from *contact.status*
const INVITED_CONTACT_STATUSES = new Set(['new', 'target', 'possible', 'negotiation', 'be-back', 'cold']);

// purchased-not-approved set from *contact.lenders[].status*
const PNA_REL_STATUSES = new Set(['invite','subdocs','subapplication','missingdocs']);

// Build: Map<lenderId, { invited, purchasedNotApproved, purchased }>
function buildLenderStats(contacts) {
  const stats = new Map();

  for (const c of contacts) {
    const cStatus = normalizeContactStatus(c.status);
    const linkedLenders = getLinkedLenderIds(c);
    if (!linkedLenders.length) continue;

    for (const lid of linkedLenders) {
      if (!stats.has(lid)) {
        stats.set(lid, { invited: 0, purchasedNotApproved: 0, purchased: 0 });
      }
      const bucket = stats.get(lid);

      // Invited
      if (INVITED_CONTACT_STATUSES.has(cStatus)) {
        bucket.invited += 1;
      }

      // Purchased & Purchased not Approved
      if (cStatus === 'purchased') {
        bucket.purchased += 1;

        const rel = getLenderRel(c, lid);
        const relKey = normalizeRelStatus(rel?.status);
        if (PNA_REL_STATUSES.has(relKey)) {
          bucket.purchasedNotApproved += 1;
        }
      }
    }
  }
  return stats;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [lenders, contacts] = await Promise.all([fetchLenders(), fetchContacts()]);
    const statsByLender = buildLenderStats(contacts);

    // Save to state BEFORE init & filtering
    state.allLenders    = lenders;
    state.statsByLender = statsByLender;

    initTopBar();
    applyFilters();        // this will call renderTable(list, state.statsByLender)
  } catch (err) {
    console.error(err);
  }
});
