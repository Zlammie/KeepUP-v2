window.getContactId = function () {
  const urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) return urlId;
  if (window.contactId) return window.contactId;
  return null;
};

