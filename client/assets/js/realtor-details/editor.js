// Populate form & autosave

import { dom, allDataInputs } from './domCache.js';
import { updateRealtorField } from './api.js';
import { updateHeaderFromInputs } from './identity.js';
import { state } from './state.js';

export function populateForm(r) {
  dom.inputs.firstName.value = r.firstName || '';
  dom.inputs.lastName.value  = r.lastName  || '';
  dom.inputs.email.value     = r.email     || '';
  dom.inputs.phone.value     = r.phone     || '';
  dom.inputs.brokerage.value = r.brokerage || '';

  dom.inputs.license.value = r.licenseNumber      || '';
  dom.inputs.bAddr.value   = r.brokerageAddress   || '';
  dom.inputs.bCity.value   = r.brokerageCity      || '';
  dom.inputs.bState.value  = r.brokerageState     || '';
  dom.inputs.bZip.value    = r.brokerageZip       || '';

  updateHeaderFromInputs();
}

export function setupAutosave() {
  // Live header updates for identity fields
  ['realtorFirstName','realtorLastName','realtorPhone','realtorEmail','realtorBrokerage']
    .forEach(id => document.getElementById(id)?.addEventListener('input', updateHeaderFromInputs));

  // Blur autosave
  allDataInputs().forEach(input => {
    input.addEventListener('blur', async (e) => {
      const field = e.target.dataset.field;
      const value = e.target.value.trim();
      try {
        await updateRealtorField(state.realtorId, { [field]: value });
      } catch (err) {
        console.warn('Autosave failed for', field, err);
      }
    });
  });
}
