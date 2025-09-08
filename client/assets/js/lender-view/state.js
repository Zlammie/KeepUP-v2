export const state = {
  lenderId: null,
  allContacts: [],
};

export function setLenderIdFromURL() {
  const params = new URLSearchParams(location.search);
  state.lenderId = params.get('id');
}
