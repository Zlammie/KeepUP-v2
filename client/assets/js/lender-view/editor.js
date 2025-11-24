import { dom } from './domCache.js';
import { updateLenderField } from './api.js';
import { state } from './state.js';
import { updateHeader } from './identity.js';

function cleanCompanyDisplay(company) {
  if (!company) return '';
  if (typeof company === 'object') {
    return company.name || company.title || company.label || company.companyName || '';
  }
  const str = String(company).trim();
  // Hide Mongo-style ObjectIds
  if (/^[a-f0-9]{24}$/i.test(str)) return '';
  return str;
}

export function populateForm(l){
  dom.inputs.firstName.value = l.firstName || '';
  dom.inputs.lastName.value  = l.lastName  || '';
  dom.inputs.email.value     = l.email     || '';
  dom.inputs.phone.value     = l.phone     || '';
  const brokerageName =
    l.lenderBrokerage ||
    l.brokerage ||
    (typeof l.company === 'object' ? (l.company?.name || l.company?.title || l.company?.label) : null) ||
    (!/^[a-f0-9]{24}$/i.test(String(l.company || '')) ? l.company : '') ||
    '';
  dom.inputs.company.value   = brokerageName;
}

export function setupAutosave(){
  ['lenderFirstName','lenderLastName','lenderPhone','lenderEmail','lenderCompany'].forEach(id=>{
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
