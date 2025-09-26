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
  const r = await fetch(`/api/community-profiles/${encodeURIComponent(id)}/sales?months=${months}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`sales load failed: ${r.status} ${await r.text()}`);
  return r.json();
}
export async function fetchBasePriceSeries(communityId) {
  return fetch(`/api/community-profiles/${communityId}/base-prices?months=12`);
}
export async function fetchQmiSoldsPoints(communityId) {
  return fetch(`/api/communities/${communityId}/qmi-solds-scatter`);
}
