// /assets/js/lenders/api.js
export async function fetchLenders() {
  const res = await fetch('/api/lenders');
  if (!res.ok) throw new Error(`Failed to fetch lenders: ${res.status}`);
  return res.json();
}

export async function updateLender(id, patch) {
  const res = await fetch(`/api/lenders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update lender ${id}`);
  return res.json().catch(() => ({}));
}
export async function deleteLender(id) {
  const res = await fetch(`/api/lenders/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Delete failed with ${res.status}`);
  }
  return res.json();
}