import { els, groups } from './domCache.js';
import { getLeadType } from './state.js';

const setRequired = (el, required) => {
  if (el) el.required = !!required;
};

const setDisabled = (el, disabled) => {
  if (el) el.disabled = !!disabled;
};

export function updateFieldVisibility() {
  const type = getLeadType();
  const isLender = type === 'lender';
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

  // default required / disabled flags
  setRequired(els.firstName, !isLender);
  setRequired(els.lastName, false);
  setRequired(els.email, false);
  setRequired(els.phone, false);
  setRequired(els.visitDate, false);
  setRequired(els.leadSource, false);
  setRequired(els.communitySelect, false);
  setRequired(els.statusSelect, false);
  setRequired(els.lenderFirstName, isLender);
  setRequired(els.lenderLastName, isLender);

  // prevent hidden contact fields from blocking lender submissions
  setDisabled(els.firstName, isLender);
  setDisabled(els.lastName, isLender);
  setDisabled(els.email, isLender);
  setDisabled(els.phone, isLender);
  setDisabled(els.visitDate, isLender);
  setDisabled(els.leadSource, isLender);
  setDisabled(els.communitySelect, isLender);
  setDisabled(els.statusSelect, isLender);
  setDisabled(els.lenderBrokerage, !isLender);
  setDisabled(els.lenderFirstName, !isLender);
  setDisabled(els.lenderLastName, !isLender);
  setDisabled(els.lenderEmail, !isLender);
  setDisabled(els.lenderPhone, !isLender);

  if (type === 'realtor') {
    show(els.realtorFields);
    hide(groups.sourceContainer);
    hide(groups.communityGroup);
    hide(groups.statusContainer);
    return;
  }

  if (isLender) {
    show(els.lenderFields);
    hide(groups.visitDateGroup);
    hide(groups.firstNameGroup);
    hide(groups.lastNameGroup);
    hide(groups.emailGroup);
    hide(groups.phoneGroup);
    hide(groups.sourceContainer);
    hide(groups.communityGroup);
    hide(groups.statusContainer);
    return;
  }
}
