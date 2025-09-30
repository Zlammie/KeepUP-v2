// /assets/js/contacts/api.js
export async function fetchContacts() {
  const res = await fetch('/api/contacts');
  if (!res.ok) throw new Error(`Failed to fetch contacts: ${res.status}`);
  return res.json();
}

export async function updateContact(id, patch) {
  const res = await fetch(`/api/contacts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update contact ${id}`);
  return res.json().catch(() => ({})); // some endpoints may return no body
}

export async function toggleFlag(id, flagged) {
  return updateContact(id, { flagged });
}

export async function postComment({ type, content, contactId }) {
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content, contactId }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json().catch(() => ({}));
}

export async function fetchMyCommunities() {
  const res = await fetch('/api/contacts/my/communities');
  if (!res.ok) throw new Error(`Failed to fetch communities: ${res.status}`);
  return res.json();
}
