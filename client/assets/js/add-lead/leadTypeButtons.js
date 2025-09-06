import { els } from './domCache.js';
import { setLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';

export function wireLeadTypeButtons() {
  els.leadTypeButtonsWrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      setLeadType(type);
      els.leadTypeInput.value = type;

      // toggle active pill
      els.leadTypeButtonsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateFieldVisibility();
    });
  });

  // If someone changes the hidden input via code, keep in sync:
  els.leadTypeInput.addEventListener('change', () => {
    setLeadType(els.leadTypeInput.value);
    updateFieldVisibility();
  });
}
