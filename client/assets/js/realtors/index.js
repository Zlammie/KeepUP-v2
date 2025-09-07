// /assets/js/realtors/index.js
import { fetchRealtors, deleteRealtor } from './api.js';
import { renderTable } from './render.js';
import { initRealtorModal } from './modal.js';

// --- contacts fetch (for stats) ---
async function fetchContacts() {
  const res = await fetch('/api/contacts');
  if (!res.ok) throw new Error('Failed to fetch contacts');
  return res.json();
}

function getLinkedRealtorIds(c) {
  const ids = new Set();
  [c?.realtorId, c?.realtor, c?.linkedRealtor, c?.realtor?._id]
    .filter(Boolean)
    .forEach(v => ids.add(typeof v === 'object' ? String(v._id ?? '') : String(v)));
  if (Array.isArray(c?.realtors)) {
    c.realtors.forEach(r => ids.add(typeof r === 'object' ? String(r._id ?? '') : String(r)));
  }
  return Array.from(ids).filter(Boolean);
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('negoti')) return 'negotiating';
  if (s === 'closed' || s === 'close') return 'closed';
  return s;
}

function buildRealtorStats(contacts) {
  const stats = new Map(); // realtorId -> { total, purchased, negotiating, closed }
  for (const c of contacts) {
    const status = normalizeStatus(c.status);
    const rids = getLinkedRealtorIds(c);
    if (!rids.length) continue;
    for (const rid of rids) {
      if (!stats.has(rid)) stats.set(rid, { total: 0, purchased: 0, negotiating: 0, closed: 0 });
      const b = stats.get(rid);
      b.total += 1;
      if (status === 'negotiating') b.negotiating += 1;
      if (status === 'purchased')   b.purchased   += 1;
      if (status === 'closed')      b.closed      += 1;
    }
  }
  return stats;
}

// --- Top bar state/logic ---
const state = {
  allRealtors: [],
  statsByRealtor: new Map(),
  search: '',
  filter: 'all', // 'all' | 'has-purchased' | 'has-negotiation' | 'has-closed'
};

function matchesSearch(r, q) {
  if (!q) return true;
  const t = q.toLowerCase();
  const fields = [r.firstName, r.lastName, r.email, r.phone, r.brokerage]
    .map(v => String(v || '').toLowerCase());
  return fields.some(v => v.includes(t));
}

function realtorPassesFilter(r) {
  const s = state.statsByRealtor.get(r._id) || { total: 0, purchased: 0, negotiating: 0, closed: 0 };
  switch (state.filter) {
    case 'has-purchased':   return s.purchased > 0;
    case 'has-negotiation': return s.negotiating > 0;
    case 'has-closed':      return s.closed > 0;
    default:                return true;
  }
}

function applyFilters() {
  const list = state.allRealtors
    .filter(r => matchesSearch(r, state.search))
    .filter(r => realtorPassesFilter(r));

  renderTable(list, state.statsByRealtor);

  const counts = {
    all: list.length,
    'has-purchased':   list.filter(r => (state.statsByRealtor.get(r._id)?.purchased   || 0) > 0).length,
    'has-negotiation': list.filter(r => (state.statsByRealtor.get(r._id)?.negotiating || 0) > 0).length,
    'has-closed':      list.filter(r => (state.statsByRealtor.get(r._id)?.closed      || 0) > 0).length,
  };

  const totalEl = document.getElementById('realtorTotal');
  if (totalEl) totalEl.textContent = counts.all;
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });
}

function initTopBar() {
  const searchEl   = document.getElementById('realtorSearch');
  const filterBox  = document.getElementById('realtorFilters');
  const resetBtn   = document.getElementById('resetRealtorFilters');
  const delToggle  = document.getElementById('toggleDeleteMode');

  // Delete mode toggle (show/hide last column)
  delToggle?.addEventListener('click', () => {
    document.querySelectorAll('.col-delete').forEach(el => el.classList.toggle('d-none'));
  });

  // Search (debounced)
  let t = null;
  searchEl?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.search = searchEl.value.trim();
      applyFilters();
    }, 200);
  });

  // Filter pills
  filterBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-pill');
    if (!btn) return;
    filterBox.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter || 'all';
    applyFilters();
  });

  // Reset
  resetBtn?.addEventListener('click', () => {
    state.search = '';
    state.filter = 'all';
    if (searchEl) searchEl.value = '';
    filterBox?.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    filterBox?.querySelector('.status-pill[data-filter="all"]')?.classList.add('active');
    applyFilters();
  });
}

// Delegated delete handler
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-realtor-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  if (!confirm('Delete this realtor?')) return;

  try {
    await deleteRealtor(id);
    state.allRealtors = state.allRealtors.filter(r => String(r._id) !== String(id));
    state.statsByRealtor.delete(id);
    btn.closest('tr')?.remove();
    applyFilters();
  } catch (err) {
    console.error('Delete realtor error:', err);
  }
});

// Single init (no duplicates)
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initRealtorModal(); // sets up comment modal hooks
    const [realtors, contacts] = await Promise.all([fetchRealtors(), fetchContacts()]);
    state.allRealtors    = realtors;
    state.statsByRealtor = buildRealtorStats(contacts);
    initTopBar();
    applyFilters();
  } catch (err) {
    console.error(err);
  }
});
