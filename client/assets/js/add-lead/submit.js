import { els } from './domCache.js';
import { getLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';

function buildPayload(type) {
  if (type === 'lender') {
    return {
      lenderBrokerage: els.lenderBrokerage.value,
      firstName: els.lenderFirstName.value,
      lastName: els.lenderLastName.value,
      email: els.lenderEmail.value,
      phone: els.lenderPhone.value,
      // note: no visitDate for lenders
    };
  }

  // contact or realtor share the base fields
  const base = {
    firstName: els.firstName.value,
    lastName: els.lastName.value,
    email: els.email.value,
    phone: els.phone.value,
    visitDate: els.visitDate.value,
    source: els.leadSource ? els.leadSource.value : ''
  };

  if (type === 'contact') {
    if (els.communitySelect && els.communitySelect.value) {
      base.communityId = els.communitySelect.value;
    }
    if (els.statusSelect && els.statusSelect.value) {
      base.status = els.statusSelect.value;
    }
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
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = getLeadType();

    const payload = buildPayload(type);

    try {
      const res = await fetch(endpointForType(type), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        console.error(`Failed to save ${type}`, msg);
        alert(`Failed to save ${type}.`);
        return;
      }

      alert(`${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`);
      els.form.reset();
      // keep the current type and refresh visibility so requireds/sections are correct after reset
      updateFieldVisibility();
    } catch (err) {
      console.error('Form save error:', err);
      alert('Unexpected error saving form.');
    }
  });
}
