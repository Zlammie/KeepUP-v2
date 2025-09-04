// Centralize fetch calls so you can log, mock, or change routes easily.


async function json(req) {
const res = await fetch(req);
if (!res.ok) throw new Error(`${req} → ${res.status}`);
return res.json();
}


export async function fetchContact(contactId) {
return json(`/api/contacts/${contactId}`);
}


export async function saveContact(contactId, payload) {
const res = await fetch(`/api/contacts/${contactId}`, {
method: 'PUT', headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
if (!res.ok) throw new Error('Failed to save contact');
return res.json();
}


// Lot linking
export async function linkLot(contactId, { communityId, lotId, salesDate, salesPrice }) {
const res = await fetch(`/api/contacts/${contactId}/link-lot`, {
method: 'POST', headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ communityId, lotId, salesDate, salesPrice })
});
if (!res.ok) throw new Error('Failed to link lot');
return res.json();
}


export async function unlinkLot(contactId) {
const res = await fetch(`/api/contacts/${contactId}/unlink-lot`, { method: 'POST' });
if (!res.ok) throw new Error('Failed to unlink lot');
return res.json();
}


export async function searchRealtors(q) { return json(`/api/realtors/search?q=${encodeURIComponent(q)}`); }
export async function searchLenders(q) { return json(`/api/lenders/search?q=${encodeURIComponent(q)}`); }

export async function fetchRealtorById(id) {
  if (!id) throw new Error('fetchRealtorById: missing id');
  const res = await fetch(`/api/realtors/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`GET /api/realtors/${id} → ${res.status}`);
  return res.json();
}


// Add other endpoints here (status update, autosave fields, etc.)