// client/assets/js/pages/my-community-competition/api.js
import { getJson, putJson } from '../../core/http.js';

export const fetchCommunityOptions = () =>
  getJson('/api/communities/select-options?scope=company');

export const fetchCommunityProfile = (id) => {
  if (!id) throw new Error('fetchCommunityProfile: missing id');
  return getJson(`/api/my-community-competition/${encodeURIComponent(id)}`);
};

export const updateCommunityProfile = (id, payload) =>
  putJson(`/api/my-community-competition/${id}`, payload);

export const updateLinkedCompetitions = (id, competitionIds) =>
  putJson(`/api/my-community-competition/${id}/linked-competitions`, { competitionIds });

export const searchCompetitions = (q) =>
  getJson(`/api/competitions/search?q=${encodeURIComponent(q)}`);

// charts data
export const fetchSalesSeries = (id, months = 12) => {
  if (!id) throw new Error('fetchSalesSeries: missing id');
  return getJson(`/api/community-profiles/${encodeURIComponent(id)}/sales?months=${months}`);
};
export async function fetchBasePriceSeries(communityId, months = 12) {
  if (!communityId) throw new Error('fetchBasePriceSeries: missing id');
  const spanNum = Number(months);
  const span = Number.isFinite(spanNum) ? spanNum : 12;
  return fetch(`/api/community-profiles/${encodeURIComponent(communityId)}/base-prices?months=${span}`, { credentials: 'same-origin' });
}
export async function fetchQmiSolds(communityId, month) {
  if (!communityId) throw new Error('fetchQmiSolds: missing id');
  let url = `/api/community-profiles/${encodeURIComponent(communityId)}/qmi-solds`;
  if (month) url += `?month=${encodeURIComponent(month)}`;
  return fetch(url, { credentials: 'same-origin' });
}

export async function fetchSqftScatter(communityId, month) {
  if (!communityId) throw new Error('fetchSqftScatter: missing id');
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  const query = params.toString();
  const url = `/api/community-profiles/${encodeURIComponent(communityId)}/base-price-scatter${query ? `?${query}` : ''}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`base-price-scatter failed: ${res.status}`);
  return res.json();
}

export async function fetchCommunityFloorPlans(communityId) {
  if (!communityId) throw new Error('fetchCommunityFloorPlans: missing id');
  const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/floorplans`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`floorplans load failed: ${res.status}`);
  return res.json();
}

export async function updateCommunityAmenities(communityId, communityAmenities) {
  if (!communityId) throw new Error('updateCommunityAmenities: missing id');
  const res = await fetch(`/api/my-community-competition/${encodeURIComponent(communityId)}/amenities`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityAmenities })
  });
  if (!res.ok) throw new Error(`amenities update failed: ${res.status}`);
  return res.json();
}
