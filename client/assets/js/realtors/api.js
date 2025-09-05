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

export async function postRealtorComment({ type, content, realtorId }) {
  // Matches your contacts pattern, but passes realtorId.
  // If your backend uses a separate endpoint, change the URL accordingly.
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content, realtorId }),
  });
  if (!res.ok) throw new Error('Failed to post realtor comment');
  return res.json().catch(() => ({}));
}