// Centralize fetch calls so you can log, mock, or change routes easily.
import { getJson, postJson, putJson, patchJson, deleteJson } from '../../core/http.js';

export const fetchContact = (contactId) => getJson(`/api/contacts/${contactId}`);

export const saveContact = (contactId, payload) =>
  putJson(`/api/contacts/${contactId}`, payload);

// Lot linking
export const linkLot = (contactId, { communityId, lotId, salesDate, salesPrice }) =>
  postJson(`/api/contacts/${contactId}/link-lot`, { communityId, lotId, salesDate, salesPrice });

export const unlinkLot = (contactId) =>
  postJson(`/api/contacts/${contactId}/unlink-lot`, {});

export const searchRealtors = (q) =>
  getJson(`/api/realtors/search?q=${encodeURIComponent(q)}`);

export const searchLenders = (q) =>
  getJson(`/api/lenders/search?q=${encodeURIComponent(q)}`);

export const fetchRealtorById = (id) => {
  if (!id) throw new Error('fetchRealtorById: missing id');
  return getJson(`/api/realtors/${encodeURIComponent(id)}`);
};

export async function fetchTasks(params = {}) {
  const search = new URLSearchParams();
  if (params.linkedModel) search.set('linkedModel', params.linkedModel);
  if (params.linkedId) search.set('linkedId', params.linkedId);
  if (params.status) search.set('status', params.status);
  if (params.type) search.set('type', params.type);
  if (params.limit) search.set('limit', params.limit);

  const query = search.toString();
  return getJson(query ? `/api/tasks?${query}` : '/api/tasks');
}

export async function fetchFollowUpSchedules(params = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  const query = search.toString();
  return getJson(query ? `/api/task-schedules?${query}` : '/api/task-schedules');
}

export async function assignFollowUpSchedule(contactId, scheduleId, options = {}) {
  if (!contactId || !scheduleId) {
    throw new Error('assignFollowUpSchedule requires contactId and scheduleId');
  }

  const payload = { scheduleId };
  if (options.reasonPrefix) {
    payload.reasonPrefix = options.reasonPrefix;
  }

  return postJson(`/api/contacts/${encodeURIComponent(contactId)}/followup-schedule`, payload);
}

export async function unassignFollowUpSchedule(contactId, options = {}) {
  if (!contactId) {
    throw new Error('unassignFollowUpSchedule requires contactId');
  }
  const search = new URLSearchParams();
  if (options.cleanup) search.set('cleanup', '1');
  const query = search.toString();
  const endpoint = query
    ? `/api/contacts/${encodeURIComponent(contactId)}/followup-schedule?${query}`
    : `/api/contacts/${encodeURIComponent(contactId)}/followup-schedule`;

  return deleteJson(endpoint);
}

// Add other endpoints here (status update, autosave fields, etc.)
export const createTask = (payload) => postJson('/api/tasks', payload);

export const updateTask = (taskId, payload) => {
  if (!taskId) throw new Error('updateTask: missing taskId');
  return patchJson(`/api/tasks/${encodeURIComponent(taskId)}`, payload);
};
