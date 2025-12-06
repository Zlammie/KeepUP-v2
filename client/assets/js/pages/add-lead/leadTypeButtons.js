import { els } from './domCache.js';
import { setLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';

function syncType(type) {
  setLeadType(type);
  if (els.leadTypeInput) els.leadTypeInput.value = type;
}

export function wireLeadTypeButtons() {
  if (!els.leadTypeButtonsWrap) return;

  els.leadTypeButtonsWrap.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      syncType(type);

      // toggle active pill
      els.leadTypeButtonsWrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      updateFieldVisibility();
    });
  });

  // If someone changes the hidden input via code, keep in sync:
  els.leadTypeInput?.addEventListener('change', () => {
    syncType(els.leadTypeInput.value);
    updateFieldVisibility();
  });
}
