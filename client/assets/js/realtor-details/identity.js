// Compact identity header + edit toggle logic

import { dom } from './domCache.js';
import { formatPhoneDisplay } from '../shared/phone.js';

export function fullNameFromInputs() {
  const first = dom.inputs.firstName?.value?.trim() || '';
  const last  = dom.inputs.lastName?.value?.trim()  || '';
  return (first || last) ? `${first} ${last}`.trim() : 'REALTOR NAME';
}

export function updateHeaderFromInputs() {
  const name  = fullNameFromInputs();
  const phoneRaw = dom.inputs.phone?.value?.trim() || '';
  const phone = phoneRaw ? formatPhoneDisplay(phoneRaw) : 'Phone Number';
  const email = dom.inputs.email?.value?.trim() || 'Email';
  const brokerage = dom.inputs.brokerage?.value?.trim() || '';

  dom.hdrName.textContent = name;
  dom.titleName.textContent = name;

  if (dom.hdrBrokerage) {
    dom.hdrBrokerage.textContent = brokerage ? ` • ${brokerage}` : '';
  }

  dom.hdrPhone.textContent = phone;
  dom.hdrPhone.href = phoneRaw ? `tel:${phoneRaw}` : '#';

  dom.hdrEmail.textContent = email;
  dom.hdrEmail.href = email && email !== 'Email' ? `mailto:${email}` : '#';
}

export function disableEditor(disabled) {
  const inputs = Object.values(dom.inputs);
  inputs.forEach(i => {
    if (!i) return;
    i.disabled = disabled;
    i.tabIndex = disabled ? -1 : 0;
  });
  dom.editorCard.classList.toggle('is-hidden', disabled);
  dom.toggleEditBtn.textContent = disabled ? 'More Details' : 'Done';
}

export function wireEditorToggle() {
  dom.toggleEditBtn.addEventListener('click', () => {
    const hidden = dom.editorCard.classList.contains('is-hidden');
    disableEditor(!hidden ? true : false);
    if (!hidden) updateHeaderFromInputs(); // closing → refresh compact header
  });
}
