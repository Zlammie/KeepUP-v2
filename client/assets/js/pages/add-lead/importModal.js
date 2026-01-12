import { postForm } from '../../core/http.js';
import { populateCommunitiesSelect } from '../../features/communities/communitySelect.js';

export function wireImportModal() {
  const uploadBtn = document.getElementById('uploadBtn');
  const importType = document.getElementById('importType');
  const importFile = document.getElementById('importFile');
  const importCommunitySelect = document.getElementById('importCommunitySelect');

  if (!uploadBtn || !importType || !importFile) return; // fail-soft if modal not present

  if (importCommunitySelect) {
    populateCommunitiesSelect(importCommunitySelect, {
      placeholder: { value: '', label: 'No community (leave blank)', selected: true },
      errorLabel: 'Communities unavailable'
    });
  }

  uploadBtn.addEventListener('click', async () => {
    if (!importFile.files.length) {
      alert('Please select a .csv or .xlsx file');
      return;
    }
    const type = importType.value; // 'contacts' or 'realtors'
    const endpoint = type === 'realtors' ? '/api/realtors/import' : '/api/contacts/import';

    const form = new FormData();
    form.append('file', importFile.files[0]);
    const selectedCommunityId = importCommunitySelect?.value?.trim();
    if (selectedCommunityId) {
      form.append('communityId', selectedCommunityId);
    }

    try {
      const data = await postForm(endpoint, form);
      const msg = `Import complete.
Created: ${data.created || 0}
Updated: ${data.updated || 0}
Skipped: ${data.skipped || 0}
Errors: ${data.errors?.length || 0}`;
      alert(msg);
      // Optionally refresh or close modal here
    } catch (error) {
      const message = error?.data?.error || error?.message || 'Import failed';
      alert(`Import failed: ${message}`);
    }
  });
}
