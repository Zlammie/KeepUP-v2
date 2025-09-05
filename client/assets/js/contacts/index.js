// /assets/js/contacts/index.js
import { fetchContacts } from './api.js';
import { initModal } from './modal.js';
import { renderTable } from './render.js';
import { initTopBar } from './topbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  initModal();

     try {
    const contacts = await fetchContacts();
    initTopBar(contacts); // handles first render + subsequent filtering
  } catch (err) {
    console.error(err);
  }

  try {
    const contacts = await fetchContacts();

    renderTable(contacts);
  } catch (err) {
    console.error(err);
    // Optionally show a toast or message to the user
  }
});
