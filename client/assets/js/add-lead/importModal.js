export function wireImportModal() {
  const uploadBtn = document.getElementById('uploadBtn');
  const importType = document.getElementById('importType');
  const importFile = document.getElementById('importFile');

  if (!uploadBtn) return; // fail-soft if modal not present

  uploadBtn.addEventListener('click', async () => {
    if (!importFile.files.length) {
      alert('Please select a .csv or .xlsx file');
      return;
    }
    const type = importType.value; // 'contacts' or 'realtors'
    const endpoint = type === 'realtors' ? '/api/realtors/import' : '/api/contacts/import';

    const form = new FormData();
    form.append('file', importFile.files[0]);

    const res = await fetch(endpoint, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(`Import failed: ${data.error || res.statusText}`);
      return;
    }

    const msg = `Import complete.
Created: ${data.created || 0}
Updated: ${data.updated || 0}
Skipped: ${data.skipped || 0}
Errors: ${data.errors?.length || 0}`;
    alert(msg);
    // Optionally refresh or close modal here
  });
}
