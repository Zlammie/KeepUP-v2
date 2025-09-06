import { state } from './state.js';

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
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load lots', err);
    tbody.innerHTML = `<tr><td colspan="19" class="text-danger">Failed to load lots</td></tr>`;
    if (countBadge) countBadge.textContent = '0';
    return [];
  }
}
