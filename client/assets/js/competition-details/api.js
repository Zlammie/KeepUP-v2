// assets/js/competition-details/api.js
export async function putCompetition(id, payload) {
  const res = await fetch(`/api/competitions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT /competitions/${id} → ${res.status}`);
}

export async function putAmenities(id, communityAmenities) {
  const res = await fetch(`/api/competitions/${id}/amenities`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityAmenities }),
  });
  if (!res.ok) throw new Error(`PUT /competitions/${id}/amenities → ${res.status}`);
}