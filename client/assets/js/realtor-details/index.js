import { setRealtorIdFromURL, state } from './state.js';
import { fetchRealtor, fetchRelatedContacts } from './api.js';
import { populateForm, setupAutosave } from './editor.js';
import { updateHeaderFromInputs, disableEditor, wireEditorToggle } from './identity.js';
import { initTopBar } from './topbar.js';

async function init() {
  setRealtorIdFromURL();
  if (!state.realtorId) { alert('Missing realtor id'); return; }

  try {
    const r = await fetchRealtor(state.realtorId);
    populateForm(r);
    updateHeaderFromInputs();
    disableEditor(true);
    setupAutosave();
    wireEditorToggle();

    // Load linked contacts and start the top bar + table
    state.allContacts = await fetchRelatedContacts(state.realtorId);
    initTopBar(state.allContacts);
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
