import { setLenderIdFromURL, state } from './state.js';
import { fetchLender, fetchRelatedContacts } from './api.js';
import { dom } from './domCache.js';
import { updateHeader, disableEditor, wireEditorToggle } from './identity.js';
import { populateForm, setupAutosave } from './editor.js';
import { initTopBar } from './topbar.js';
import { renderTable } from './table.js';

async function init(){
  setLenderIdFromURL();
  if(!state.lenderId){ alert('Missing lender id'); return; }

  try{
    // Load lender & populate
    const lender = await fetchLender(state.lenderId);
    populateForm(lender);
    updateHeader();
    disableEditor(true);
    wireEditorToggle();
    setupAutosave();

    // Load related contacts & boot top bar + table
    state.allContacts = await fetchRelatedContacts(state.lenderId);

    // initial table render; topbar will re-render as filters change
    renderTable(state.allContacts);

    // kick off top bar (counts + filtering + More/Back + community)
    initTopBar(state.allContacts);
  }catch(err){
    console.error(err);
    if(dom.tableBody) dom.tableBody.innerHTML = `<tr><td colspan="8">Error loading data.</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
