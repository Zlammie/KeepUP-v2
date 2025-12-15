import { postJson } from '../../core/http.js';
import { els } from './domCache.js';
import { getLeadType, setLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';

function buildPayload(type) {
  if (type === 'lender') {
    return {
      lenderBrokerage: els.lenderBrokerage.value,
      firstName: els.lenderFirstName.value,
      lastName: els.lenderLastName.value,
      email: els.lenderEmail.value,
      phone: els.lenderPhone.value,
    };
  }

  // contact or realtor share the base fields
  const base = {
    firstName: els.firstName.value,
    lastName: els.lastName.value,
    email: els.email.value,
    phone: els.phone.value,
    visitDate: els.visitDate.value,
    source: els.leadSource ? els.leadSource.value : '',
  };

  if (type === 'contact') {
    if (els.communitySelect?.value) base.communityId = els.communitySelect.value;
    if (els.statusSelect) base.status = els.statusSelect.value;
  }

  if (type === 'realtor') {
    base.brokerage = els.brokerage.value;
  }

  return base;
}

function endpointForType(type) {
  if (type === 'realtor') return '/api/realtors';
  if (type === 'lender') return '/api/lenders';
  return '/api/contacts';
}

export function wireSubmit() {
  if (!els.form) return;

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = getLeadType();
    const payload = buildPayload(type);

    try {
      await postJson(endpointForType(type), payload);
      alert(`${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`);
      els.form.reset();

      // keep the current type and refresh visibility so requireds/sections are correct after reset
      if (els.leadTypeInput) els.leadTypeInput.value = type;
      setLeadType(type);
      updateFieldVisibility();
    } catch (error) {
      console.error('Form save error:', error);
      const message = error?.data?.error || error?.message || 'Unexpected error saving form.';
      alert(message);
    }
  });
}
