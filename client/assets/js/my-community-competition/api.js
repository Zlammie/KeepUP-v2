// client/assets/js/my-community-competition/api.js
export async function fetchCommunityOptions() {
  const r = await fetch('/api/communities/select-options', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`select-options failed: ${r.status}`);
  return r.json(); // expect [{ id, label }] or [{ _id, name, ... }]
}

export async function fetchCommunityProfile(id) {
  if (!id) throw new Error('fetchCommunityProfile: missing id');
  const r = await fetch(`/api/my-community-competition/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`profile load failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function updateCommunityProfile(id, payload) {
  return fetch(`/api/my-community-competition/${id}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
}

export async function updateLinkedCompetitions(id, competitionIds) {
  return fetch(`/api/my-community-competition/${id}/linked-competitions`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ competitionIds })
  });
}

export async function searchCompetitions(q) {
  return fetch(`/api/competitions/search?q=${encodeURIComponent(q)}`).then(r => r.json());
}

// charts data
export async function fetchSalesSeries(id, months = 12) {
  if (!id) throw new Error('fetchSalesSeries: missing id');
  return fetch(`/api/community-profiles/${encodeURIComponent(id)}/sales?months=${months}`, { credentials: 'same-origin' });
}
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
