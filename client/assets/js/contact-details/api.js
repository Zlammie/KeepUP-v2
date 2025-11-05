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


export async function fetchTasks(params = {}) {
  const search = new URLSearchParams();
  if (params.linkedModel) search.set('linkedModel', params.linkedModel);
  if (params.linkedId) search.set('linkedId', params.linkedId);
  if (params.status) search.set('status', params.status);
  if (params.type) search.set('type', params.type);
  if (params.limit) search.set('limit', params.limit);

  const query = search.toString();
  return json(query ? `/api/tasks?${query}` : '/api/tasks');
}

// Add other endpoints here (status update, autosave fields, etc.)
export async function createTask(payload) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error || 'Failed to create task';
    throw new Error(message);
  }

  return data;
}

export async function updateTask(taskId, payload) {
  if (!taskId) throw new Error('updateTask: missing taskId');

  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error || 'Failed to update task';
    throw new Error(message);
  }

  return data;
}
