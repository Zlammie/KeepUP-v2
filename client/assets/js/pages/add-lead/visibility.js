import { els, groups } from './domCache.js';
import { getLeadType } from './state.js';

export function updateFieldVisibility() {
  const type = getLeadType();
  const show = (el) => el?.classList.remove('d-none');
  const hide = (el) => el?.classList.add('d-none');

  // base reset
  hide(els.realtorFields);
  hide(els.lenderFields);

  show(groups.visitDateGroup);
  show(groups.firstNameGroup);
  show(groups.lastNameGroup);
  show(groups.emailGroup);
  show(groups.phoneGroup);
  show(groups.sourceContainer);
  show(groups.communityGroup);
  show(groups.statusContainer);

  // default required flags
  if (els.firstName) els.firstName.required = true;
  if (els.lastName) els.lastName.required = false;
  if (els.email) els.email.required = false;
  if (els.phone) els.phone.required = false;
  if (els.visitDate) els.visitDate.required = false;
  if (els.leadSource) els.leadSource.required = false;
  if (els.communitySelect) els.communitySelect.required = false;
  if (els.statusSelect) els.statusSelect.required = false;
  if (els.lenderFirstName) els.lenderFirstName.required = false;
  if (els.lenderLastName) els.lenderLastName.required = false;

  if (type === 'realtor') {
    show(els.realtorFields);
    hide(groups.sourceContainer);
    hide(groups.communityGroup);
    hide(groups.statusContainer);
    return;
  }

  if (type === 'lender') {
    show(els.lenderFields);
    hide(groups.visitDateGroup);
    hide(groups.firstNameGroup);
    hide(groups.lastNameGroup);
    hide(groups.emailGroup);
    hide(groups.phoneGroup);
    hide(groups.sourceContainer);
    hide(groups.communityGroup);
    hide(groups.statusContainer);

    if (els.lenderFirstName) els.lenderFirstName.required = true;
    if (els.lenderLastName) els.lenderLastName.required = true;
    return;
  }
}
