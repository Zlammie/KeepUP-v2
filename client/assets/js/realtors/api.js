// /assets/js/realtors/api.js
export async function fetchRealtors() {
  const res = await fetch('/api/realtors');
  if (!res.ok) throw new Error(`Failed to fetch realtors: ${res.status}`);
  return res.json();
}

export async function updateRealtor(id, patch) {
  const res = await fetch(`/api/realtors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update realtor ${id}`);
  return res.json().catch(() => ({}));
}
