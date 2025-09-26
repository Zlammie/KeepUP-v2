export async function listCompetitions() {
  const res = await fetch('/api/competitions');
  if (!res.ok) throw new Error('Failed to load competitions');
  return res.json();
}

export async function deleteCompetition(id) {
  const res = await fetch(`/api/competitions/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    let msg = 'Delete failed';
    try {
      const errJson = await res.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }
  return true;
}
