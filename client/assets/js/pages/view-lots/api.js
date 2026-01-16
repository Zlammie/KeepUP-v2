import { getJson, putJson } from '../../core/http.js';
import { state } from './state.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fetchLot = (communityId, lotId) =>
  getJson(`/api/communities/${encodeURIComponent(communityId)}/lots/${encodeURIComponent(lotId)}`);

export const fetchLotTasks = (lotId) =>
  getJson(`/api/tasks?linkedModel=Lot&linkedId=${encodeURIComponent(lotId)}`);

export const fetchCommunityLots = (communityId) =>
  getJson(`/api/communities/${encodeURIComponent(communityId)}/lots`);

export async function loadCommunities() {
  const select = document.querySelector('#vl-community');
  try {
    const items = await getJson('/api/communities');
    state.communities = Array.isArray(items) ? items : [];

    if (select) {
      select.innerHTML = state.communities
        .map((c) => {
          const id = esc(c._id);
          const name = esc(c.name || '');
          const proj = c.projectNumber ? ` — ${esc(c.projectNumber)}` : '';
          return `<option value="${id}">${name}${proj}</option>`;
        })
        .join('');
    }

    // seed community selection if unset
    if (!state.communityId && state.communities[0]?._id) {
      state.communityId = String(state.communities[0]._id);
    }
    if (select && state.communityId) {
      select.value = String(state.communityId);
    }
  } catch (err) {
    console.error('[view-lots] Failed to load communities', err);
    state.communities = [];
    if (select) select.innerHTML = '<option value="">(failed to load)</option>';
  }
  return state.communities;
}

export async function loadLots() {
  const tbody = document.querySelector('#lotsTableBody');
  if (!state.communityId) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="19" class="text-muted">Select a community</td></tr>';
    }
    return [];
  }

  try {
    const url = new URL(
      `/api/communities/${encodeURIComponent(state.communityId)}/lots`,
      window.location.origin
    );
    if (state.search) url.searchParams.set('q', state.search);

    const data = await getJson(url.toString());
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[view-lots] Failed to load lots', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="19" class="text-danger">Failed to load lots</td></tr>';
    }
    return [];
  }
}

export const updateLotGeneralStatus = (communityId, lotId, generalStatus) =>
  putJson(
    `/api/communities/${encodeURIComponent(communityId)}/lots/${encodeURIComponent(lotId)}`,
    { generalStatus }
  );
