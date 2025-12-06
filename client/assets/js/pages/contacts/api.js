// /assets/js/pages/contacts/api.js
import { deleteJson, getJson, postJson, putJson } from '../../core/http.js';

export const fetchContacts = () => getJson('/api/contacts');

export const createContact = (payload) =>
  postJson('/api/contacts', payload);

export const updateContact = (id, patch) =>
  putJson(`/api/contacts/${id}`, patch).catch(() => ({}));

export const getContactById = (id) =>
  getJson(`/api/contacts/${id}`);

export const deleteContact = (id) =>
  deleteJson(`/api/contacts/${id}`);

export const postComment = ({ type, content, contactId }) =>
  postJson('/api/comments', { type, content, contactId }).catch(() => ({}));

export const fetchMyCommunities = () =>
  getJson('/api/contacts/my/communities');
