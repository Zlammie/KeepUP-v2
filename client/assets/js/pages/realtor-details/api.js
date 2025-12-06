// All network calls for this page.
import { getJson, putJson } from '../../core/http.js';

export const fetchRealtor = (id) =>
  getJson(`/api/realtors/${id}`);

export const updateRealtorField = (id, payload) =>
  putJson(`/api/realtors/${id}`, payload).catch(() => ({}));

export const fetchRelatedContacts = (id) =>
  getJson(`/api/contacts/by-realtor/${id}`);
