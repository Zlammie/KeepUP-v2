import { getJson, putJson, patchJson } from '../../core/http.js';

export const getLot = (communityId, lotId) =>
  getJson(`/api/communities/${communityId}/lots/${lotId}`);

export const putLot = (communityId, lotId, payload) =>
  putJson(`/api/communities/${communityId}/lots/${lotId}`, payload).catch(() => ({})); // tolerate empty bodies

export const getFloorPlans = (communityId) => (
  communityId
    ? getJson(`/api/communities/${encodeURIComponent(communityId)}/floorplans`)
    : getJson('/api/floorplans')
);

export const getContact = (contactId) => getJson(`/api/contacts/${contactId}`);

export const putContact = (contactId, payload) =>
  putJson(`/api/contacts/${contactId}`, payload).catch(() => ({}));

export const patchContactLender = (contactId, lenderEntryId, payload) =>
  patchJson(`/api/contacts/${contactId}/lenders/${lenderEntryId}`, payload).catch(() => ({}));

export const getRealtor = (realtorId) => getJson(`/api/realtors/${realtorId}`);

// Supports both signatures used by hydrate.js:
//   updateLot(communityId, lotId, patch)
//   updateLot(lotId, patch)
export function updateLot(communityId, lotId, patch) {
  if (!communityId || !lotId) throw new Error('updateLot: missing ids');
  const url = `/api/communities/${encodeURIComponent(communityId)}/lots/${encodeURIComponent(lotId)}`;
  return putJson(url, patch);
}
