import { getJson, putJson, patchJson } from '../../core/http.js';

export const fetchLender = (id) =>
  getJson(`/api/lenders/${id}`);

export const updateLenderField = (id, payload) =>
  putJson(`/api/lenders/${id}`, payload).catch(() => ({}));

export const fetchRelatedContacts = (id) =>
  getJson(`/api/contacts/by-lender/${id}`);

export const patchContactLender = (contactId, lenderEntryId, payload) =>
  patchJson(`/api/contacts/${contactId}/lenders/${lenderEntryId}`, payload).catch(() => ({}));
