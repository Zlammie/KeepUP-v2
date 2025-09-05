document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('community-form');
  const nameEl = document.getElementById('communityName');
  const projEl = document.getElementById('projectNumber');

  const communitySelect = document.getElementById('communitySelect');
  const lotForm = document.getElementById('lotForm');

  // Load all communities for the dropdown
 function htmlesc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  async function loadCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (!res.ok) throw new Error(`GET /api/communities → ${res.status}`);
      const items = await res.json();
      if (communitySelect) {
        communitySelect.innerHTML = items.map(c =>
          `<option value="${c._id}">${htmlesc(c.name)}</option>`
        ).join('');
      }
      // also render the lots summary if we have a container
      if (lotsContainer) await renderLotsByCommunity(items);
    } catch (e) {
      console.error(e);
    }
  }

  // Renders a grouped “Lots by Community” block.
  // Assumes each community item either already includes `lots` or can be fetched at /api/communities/:id/lots
  async function renderLotsByCommunity(communities) {
    if (!lotsContainer) return;
    // Attempt to ensure we have lots arrays
    const enriched = await Promise.all(communities.map(async c => {
      if (Array.isArray(c.lots)) return c;
      try {
        const r = await fetch(`/api/communities/${c._id}/lots`);
        if (r.ok) {
          const lots = await r.json();
          return { ...c, lots };
        }
      } catch (_) {}
      return { ...c, lots: [] };
    }));

    lotsContainer.innerHTML = enriched.map(c => {
      const rows = (c.lots || []).map(l => `
        <tr>
          <td>${htmlesc(l.jobNumber)}</td>
          <td>${htmlesc(l.lot)}</td>
          <td>${htmlesc(l.block)}</td>
          <td>${htmlesc(l.phase)}</td>
          <td>${htmlesc(l.address)}</td>
          <td>${htmlesc(l.floorPlan || '')}</td>
          <td>${htmlesc(l.elevation || '')}</td>
        </tr>
      `).join('') || `<tr><td colspan="7" class="text-muted">No lots yet</td></tr>`;

      return `
        <div class="mb-4">
          <h5 class="mb-2">${htmlesc(c.name)}</h5>
          <div class="table-responsive">
            <table class="table table-sm table-bordered">
              <thead>
                <tr>
                  <th>Job #</th><th>Lot</th><th>Block</th><th>Phase</th>
                  <th>Address</th><th>Plan</th><th>Elev</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
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
        await loadCommunities(); // refresh dropdown + lots block
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  // Import from CSV/XLSX
  if (importForm && importFile) {
    importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!importFile.files.length) return alert('Choose a file first');

      const fd = new FormData(importForm); // includes the file under 'file'
      try {
        const res = await fetch('/api/communities/import', { method: 'POST', body: fd });
        const text = await res.text();
        if (!res.ok) throw new Error(`Import failed (${res.status}): ${text}`);
        let json;
        try { json = JSON.parse(text); } catch { json = { message: text }; }
        console.log('Import result:', json);
        // After import, reload communities and lots display
        await loadCommunities();
        alert('Import complete!');
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  // Initial load
  loadCommunities();
});


