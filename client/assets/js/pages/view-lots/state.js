// Shared state for the View Lots page
export const state = {
  communities: [],
  communityId: null,
  search: '',
  // keys: 'available' | 'spec' | 'comingSoon' | 'sold'
  filters: new Set(),
  planById: new Map(), 
};
