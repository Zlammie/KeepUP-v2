// All network calls for this page.

export async function fetchRealtor(id) {
  const res = await fetch(`/api/realtors/${id}`);
  if (!res.ok) throw new Error('Realtor not found');
  return res.json();
}

export async function updateRealtorField(id, payload) {
  const res = await fetch(`/api/realtors/${id}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json().catch(() => ({}));
}

export async function fetchRelatedContacts(id) {
  const res = await fetch(`/api/contacts/by-realtor/${id}`);
  if (!res.ok) throw new Error('Failed to load related contacts');
  return res.json();
}
