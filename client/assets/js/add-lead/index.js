import { els } from './domCache.js';
import { setLeadType } from './state.js';
import { updateFieldVisibility } from './visibility.js';
import { wireLeadTypeButtons } from './leadTypeButtons.js';
import { wireSubmit } from './submit.js';
import { wireImportModal } from './importModal.js';

async function loadCommunities() {
  if (!els.communitySelect) return;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a community (optional)';
  els.communitySelect.innerHTML = '';
  els.communitySelect.appendChild(placeholder);
  try {
    const res = await fetch('/api/communities');
    if (!res.ok) throw new Error(`GET /api/communities -> ${res.status}`);
    const communities = await res.json();
    communities
      .map((community) => ({
        ...community,
        label: community.name || community.communityName || 'Unnamed community'
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((community) => {
        const option = document.createElement('option');
        option.value = community._id;
        option.textContent = community.label;
        els.communitySelect.appendChild(option);
      });
  } catch (err) {
    console.error('Failed to load communities for add-lead form', err);
    const errorOption = document.createElement('option');
    errorOption.value = '';
    errorOption.textContent = 'Communities unavailable';
    els.communitySelect.appendChild(errorOption);
  }
}

// Entry point
document.addEventListener('DOMContentLoaded', () => {
  // Ensure state matches the hidden input’s initial value
  setLeadType(els.leadTypeInput.value || 'contact');

  // Wire UI
  wireLeadTypeButtons();
  wireSubmit();
  wireImportModal();

  loadCommunities();

  // Initial paint
  updateFieldVisibility();
});
