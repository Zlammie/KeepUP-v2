import { state } from './state.js';

const purchaserCache = new Map();
export async function loadCommunities() {
  const sel = document.querySelector('#vl-community');
  try {
    const res = await fetch('/api/communities');
    if (!res.ok) throw new Error(`GET /api/communities → ${res.status}`);
    const items = await res.json();
    state.communities = Array.isArray(items) ? items : [];

    sel.innerHTML = state.communities.map(c =>
      `<option value="${c._id}">${escapeHtml(c.name)}${c.projectNumber ? ' — ' + escapeHtml(c.projectNumber) : ''}</option>`
    ).join('');
  } catch (err) {
    console.error('Failed to load communities', err);
    sel.innerHTML = '<option value="">(failed to load)</option>';
  }
}

// tiny escape to avoid importing utils here just for this template
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

export async function loadLots() {
  const tbody = document.querySelector('#lotsTableBody');
  const countBadge = document.querySelector('#vl-count');

  if (!state.communityId) {
    tbody.innerHTML = '<tr><td colspan="19" class="text-muted">Select a community</td></tr>';
    if (countBadge) countBadge.textContent = '0';
    return [];
  }

  try {
    const url = new URL(`/api/communities/${state.communityId}/lots`, location.origin);
    if (state.search) url.searchParams.set('q', state.search); // server supports ?q=

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`GET lots → ${res.status}`);
    const data = await res.json();
    const lots = Array.isArray(data) ? data : [];
    await hydratePurchasers(lots);
    return lots;
  } catch (err) {
    console.error('Failed to load lots', err);
    tbody.innerHTML = `<tr><td colspan="19" class="text-danger">Failed to load lots</td></tr>`;
    if (countBadge) countBadge.textContent = '0';
    return [];
  }
}

async function hydratePurchasers(lots) {
  const ids = new Set();
  for (const lot of lots || []) {
    if (!lot || lot.purchaserDisplayName) continue;
    const id = extractPurchaserId(lot);
    if (id) ids.add(id);
  }

  const missing = Array.from(ids).filter(id => !purchaserCache.has(id));
  if (missing.length) {
    await Promise.all(missing.map(async (id) => {
      try {
        const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`GET /api/contacts/${id} -> ${res.status}`);
        const contact = await res.json();
        purchaserCache.set(id, buildContactName(contact));
      } catch (err) {
        console.warn('[view-lots] contact fetch failed', id, err);
        purchaserCache.set(id, '');
      }
    }));
  }

  for (const lot of lots || []) {
    if (!lot) continue;
    if (!lot.purchaserDisplayName) {
      const id = extractPurchaserId(lot);
      if (id && purchaserCache.has(id)) {
        const name = purchaserCache.get(id);
        if (name) lot.purchaserDisplayName = name;
      }
    }
  }
}

function extractPurchaserId(lot) {
  if (!lot) return null;
  const { purchaser, purchaserId } = lot;
  if (purchaserId) return String(purchaserId).trim();
  if (typeof purchaser === 'string') return purchaser.trim();
  if (purchaser && typeof purchaser === 'object') {
    return String(purchaser._id || purchaser.id || '').trim();
  }
  return null;
}

function buildContactName(contact) {
  if (!contact || typeof contact !== 'object') return '';
  const parts = [];
  if (contact.firstName) parts.push(String(contact.firstName).trim());
  if (contact.lastName) parts.push(String(contact.lastName).trim());
  const joined = parts.filter(Boolean).join(' ');
  if (joined) return joined;
  if (contact.fullName) return String(contact.fullName).trim();
  if (contact.name) return String(contact.name).trim();
  return '';
}
