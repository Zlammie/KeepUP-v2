import { dom } from './domCache.js';

export function fullName(){
  const first = dom.inputs.firstName?.value?.trim() || '';
  const last  = dom.inputs.lastName?.value?.trim()  || '';
  return (first || last) ? `${first} ${last}`.trim() : 'LENDER NAME';
}

export function updateHeader(){
  const name  = fullName();
  const phone = dom.inputs.phone?.value?.trim() || 'Phone Number';
  const email = dom.inputs.email?.value?.trim() || 'Email';

  dom.hdrName.textContent = name;
  dom.titleName.textContent = name;
  dom.hdrPhone.textContent = phone;
  dom.hdrEmail.textContent = email;
  dom.hdrPhone.href = phone && phone !== 'Phone Number' ? `tel:${phone}` : '#';
  dom.hdrEmail.href = email && email !== 'Email' ? `mailto:${email}` : '#';
}

export function disableEditor(disabled){
  const inputs = Object.values(dom.inputs);
  inputs.forEach(i => { if(!i) return; i.disabled = disabled; i.tabIndex = disabled ? -1 : 0; });
  dom.editorCard.classList.toggle('is-hidden', disabled);
  dom.toggleEditBtn.textContent = disabled ? 'Edit' : 'Done';
}

export function wireEditorToggle(){
  dom.toggleEditBtn.addEventListener('click', ()=>{
    const hidden = dom.editorCard.classList.contains('is-hidden');
    disableEditor(!hidden ? true : false);
    if(!hidden) updateHeader(); // closing → refresh compact header
  });
}
