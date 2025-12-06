// /assets/js/pages/realtors/api.js
import { getJson, putJson, postJson, deleteJson } from '../../core/http.js';

export const fetchRealtors = () => getJson('/api/realtors');

export const updateRealtor = (id, patch) =>
  putJson(`/api/realtors/${id}`, patch).catch(() => ({}));

export const postRealtorComment = ({ type, content, realtorId }) =>
  postJson('/api/comments', { type, content, realtorId }).catch(() => ({}));

export const deleteRealtor = (id) =>
  deleteJson(`/api/realtors/${id}`);
