// /assets/js/address-details/api.js
const j = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

export const getLot = (communityId, lotId) =>
  fetch(`/api/communities/${communityId}/lots/${lotId}`).then(j);

export const putLot = (communityId, lotId, payload) =>
  fetch(`/api/communities/${communityId}/lots/${lotId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }).then(j).catch(() => ({})); // ignore body on some PUTs

export const getFloorPlans = () =>
  fetch('/api/floorplans').then(j);

export const getContact = (contactId) =>
  fetch(`/api/contacts/${contactId}`).then(j);

export const putContact = (contactId, payload) =>
  fetch(`/api/contacts/${contactId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }).then(j).catch(() => ({}));

export const getRealtor = (realtorId) =>
  fetch(`/api/realtors/${realtorId}`).then(j);
