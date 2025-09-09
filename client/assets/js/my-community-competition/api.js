// client/assets/js/my-community-competition/api.js
export async function fetchCommunityOptions() {
  return fetch('/api/communities/select-options').then(r => r.json());
}

export async function fetchCommunityProfile(id) {
  return fetch(`/api/my-community-competition/${id}`).then(r => r.json());
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
export async function fetchSalesSeries(communityId) {
  return fetch(`/api/community-profiles/${communityId}/sales?months=12`);
}
export async function fetchBasePriceSeries(communityId) {
  return fetch(`/api/community-profiles/${communityId}/base-prices?months=12`);
}
export async function fetchQmiSoldsPoints(communityId) {
  return fetch(`/api/communities/${communityId}/qmi-solds-scatter`);
}
