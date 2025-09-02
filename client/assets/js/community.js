document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('community-form');
  const nameEl = document.getElementById('communityName');
  const projEl = document.getElementById('projectNumber');

  const communitySelect = document.getElementById('communitySelect');
  const lotForm = document.getElementById('lotForm');

  // Load all communities for the dropdown
  async function loadCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (!res.ok) throw new Error(`GET /api/communities → ${res.status}`);
      const items = await res.json();
      if (communitySelect) {
        communitySelect.innerHTML = items
          .map(c => `<option value="${c._id}">${c.name}</option>`)
          .join('');
      }
    } catch (e) { console.error(e); }
  }

  // Create new community
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: nameEl.value.trim(),
        projectNumber: projEl.value.trim(),
      };
      try {
        const res = await fetch('/api/communities', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`Create failed (${res.status}): ${msg}`);
        }
        form.reset();
        await loadCommunities();
        // TODO: toast success
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  // Add lot to selected community
  if (lotForm) {
    lotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const communityId = communitySelect.value;
      const body = {
        jobNumber: document.getElementById('jobNumber').value.trim(),
        lot:       document.getElementById('lot').value.trim(),
        block:     document.getElementById('block').value.trim(),
        phase:     document.getElementById('phase').value.trim(),
        address:   document.getElementById('address').value.trim(),
        floorPlan: document.getElementById('floorPlan').value.trim(),
        elevation: document.getElementById('elevation').value.trim()
      };
      try {
        const res = await fetch(`/api/communities/${communityId}/lots`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`Add lot failed (${res.status}): ${msg}`);
        }
        lotForm.reset();
        // TODO: refresh “Lots by Community” section
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  loadCommunities();

  document.addEventListener('DOMContentLoaded', () => {
  const importForm = document.getElementById('importForm');
  const importFile = document.getElementById('importFile');

  if (importForm && importFile) {
    importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!importFile.files.length) return alert('Choose a file first');

      const fd = new FormData(importForm); // includes the file under 'file'

      try {
        const res = await fetch('/api/communities/import', {
          method: 'POST',
          body: fd
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Import failed (${res.status}): ${text}`);
        }
        const json = await res.json();
        console.log('Import result:', json);
        alert('Import complete!');
        // TODO: refresh your community list / lots view
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }
});
});
