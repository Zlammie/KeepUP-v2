// Central state + constants so modules stay dumb.

export const state = {
  realtorId: null,
  allContacts: [],
  activeStatuses: new Set(),
  statusOptions: [
    'New','Target','Possible','Negotiation','Be-Back','Cold',
    'Purchased','Closed','Not-Interested','Bust'
  ]
};

export function setRealtorIdFromURL() {
  const params = new URLSearchParams(location.search);
  state.realtorId = params.get('id');
}
