import { populateCommunitiesSelect } from '../../features/communities/communitySelect.js';
import { els } from './domCache.js';
import { setLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';
import { wireLeadTypeButtons } from './leadTypeButtons.js';
import { wireSubmit } from './submit.js';
import { wireImportModal } from './importModal.js';

// Entry point
document.addEventListener('DOMContentLoaded', () => {
  // Ensure state matches the hidden input's initial value
  setLeadType(els.leadTypeInput?.value || 'contact');

  // Wire UI
  wireLeadTypeButtons();
  wireSubmit();
  wireImportModal();

  populateCommunitiesSelect(els.communitySelect);

  // Initial paint
  updateFieldVisibility();
});
