import { getJson, deleteJson } from '../../core/http.js';

export const listCompetitions = () =>
  getJson('/api/competitions');

export async function deleteCompetition(id) {
  try {
    await deleteJson(`/api/competitions/${id}`);
    return true;
  } catch (err) {
    const msg = err?.data?.error || err?.message || 'Delete failed';
    throw new Error(msg);
  }
}
