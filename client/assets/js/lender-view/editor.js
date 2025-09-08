import { dom } from './domCache.js';
import { updateLenderField } from './api.js';
import { state } from './state.js';
import { updateHeader } from './identity.js';

export function populateForm(l){
  dom.inputs.firstName.value = l.firstName || '';
  dom.inputs.lastName.value  = l.lastName  || '';
  dom.inputs.email.value     = l.email     || '';
  dom.inputs.phone.value     = l.phone     || '';
  dom.inputs.company.value   = l.company   || '';
}

export function setupAutosave(){
  ['lenderFirstName','lenderLastName','lenderPhone','lenderEmail'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input', updateHeader);
  });

  document.querySelectorAll('input[data-field]').forEach(input=>{
    input.addEventListener('blur', async (e)=>{
      const field = e.target.dataset.field;
      const value = e.target.value.trim();
      try { await updateLenderField(state.lenderId, { [field]: value }); }
      catch(err){ console.warn('Autosave failed for', field, err); }
    });
  });
}
