// /assets/js/pages/lenders/api.js
import { getJson, putJson, deleteJson } from '../../core/http.js';

export const fetchLenders = () => getJson('/api/lenders');

export const updateLender = (id, patch) =>
  putJson(`/api/lenders/${id}`, patch).catch(() => ({}));

export const deleteLender = (id) =>
  deleteJson(`/api/lenders/${id}`);
