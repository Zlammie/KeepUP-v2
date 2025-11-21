import { els, groups } from './domCache.js';
import { getLeadType } from './state.js';

export function updateFieldVisibility() {
  const type = getLeadType();

  // reset everything to base state
  els.realtorFields.classList.add('d-none');
  els.lenderFields.classList.add('d-none');

  groups.visitDateGroup.classList.remove('d-none');
  groups.firstNameGroup.classList.remove('d-none');
  groups.lastNameGroup.classList.remove('d-none');
  groups.emailGroup.classList.remove('d-none');
  groups.phoneGroup.classList.remove('d-none');
  if (groups.sourceContainer) groups.sourceContainer.classList.remove('d-none');
  if (groups.communityGroup) groups.communityGroup.classList.remove('d-none');
  if (groups.statusContainer) groups.statusContainer.classList.remove('d-none');

  // base requireds
  els.firstName.required = true;
  els.lastName.required = false;
  els.email.required = false;
  els.phone.required = false;
  if (els.visitDate) els.visitDate.required = false;
  if (els.leadSource) els.leadSource.required = false;
  if (els.communitySelect) els.communitySelect.required = false;
  if (els.statusSelect) els.statusSelect.required = false;
  els.lenderFirstName.required = false;
  els.lenderLastName.required = false;

  if (type === 'realtor') {
    els.realtorFields.classList.remove('d-none');
  } else if (type === 'lender') {
    els.lenderFields.classList.remove('d-none');

    // hide the lead-only fields for lender entry
    groups.visitDateGroup.classList.add('d-none');
    groups.firstNameGroup.classList.add('d-none');
    groups.lastNameGroup.classList.add('d-none');
    groups.emailGroup.classList.add('d-none');
    groups.phoneGroup.classList.add('d-none');
    if (groups.sourceContainer) groups.sourceContainer.classList.add('d-none');
    if (groups.communityGroup) groups.communityGroup.classList.add('d-none');
    if (groups.statusContainer) groups.statusContainer.classList.add('d-none');

    // disable required constraints on hidden lead fields
    els.firstName.required = false;
    els.lastName.required = false;
    els.email.required = false;
    els.phone.required = false;
    if (els.leadSource) els.leadSource.required = false;
    if (els.communitySelect) els.communitySelect.required = false;
    if (els.statusSelect) els.statusSelect.required = false;

    // lender requireds
    els.lenderFirstName.required = true;
    els.lenderLastName.required = true;
  }

  if (type === 'realtor') {
    if (groups.sourceContainer) groups.sourceContainer.classList.add('d-none');
    if (groups.communityGroup) groups.communityGroup.classList.add('d-none');
    if (groups.statusContainer) groups.statusContainer.classList.add('d-none');
  }
}

