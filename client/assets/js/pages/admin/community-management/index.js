document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('community-form');
  const nameEl = document.getElementById('communityName');
  const projEl = document.getElementById('projectNumber');
  const productTypesEl = document.getElementById('productTypesOffered');
  const lotWidthsEl = document.getElementById('lotWidthsOffered');
  const managementModeEl = document.getElementById('managementMode');
  const stepOne = document.getElementById('communityCreateStep1');
  const stepTwo = document.getElementById('communityCreateStep2');
  const nextBtn = document.getElementById('communityStepNextBtn');
  const backBtn = document.getElementById('communityStepBackBtn');

  const communitySelect = document.getElementById('communitySelect');
  const lotForm = document.getElementById('lotForm');

  const parseStringList = (value) =>
    Array.from(new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ));

  const parseNumberList = (value) =>
    Array.from(new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry >= 0)
    )).sort((a, b) => a - b);

  async function loadCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (!res.ok) throw new Error(`GET /api/communities failed (${res.status})`);
      const items = await res.json();
      const current = communitySelect ? communitySelect.value : '';

      if (communitySelect) {
        communitySelect.innerHTML = items
          .map((c) => {
            const label = c.projectNumber ? `${c.name} - ${c.projectNumber}` : c.name;
            return `<option value="${c._id}">${label}</option>`;
          })
          .join('');
        const hasCurrent = items.some((c) => c._id === current);
        const next = hasCurrent ? current : items[0]?._id || '';
        communitySelect.value = next || '';
      }
    } catch (err) {
      console.error(err);
    }
  }

  nextBtn?.addEventListener('click', () => {
    if (!nameEl?.value.trim() || !projEl?.value.trim()) {
      alert('Community name and project number are required.');
      return;
    }
    stepOne?.classList.add('d-none');
    stepTwo?.classList.remove('d-none');
  });

  backBtn?.addEventListener('click', () => {
    stepTwo?.classList.add('d-none');
    stepOne?.classList.remove('d-none');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: nameEl.value.trim(),
      projectNumber: projEl.value.trim(),
      productTypesOffered: parseStringList(productTypesEl?.value),
      lotWidthsOffered: parseNumberList(lotWidthsEl?.value),
      managementMode: managementModeEl?.value || 'later'
    };

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Create failed (${res.status}): ${msg}`);
      }
      form.reset();
      stepTwo?.classList.add('d-none');
      stepOne?.classList.remove('d-none');
      if (managementModeEl) managementModeEl.value = 'later';
      await loadCommunities();
      document.dispatchEvent(new CustomEvent('cm:communityChanged'));
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });

  lotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const communityId = communitySelect.value;
    const lotWidthValue = document.getElementById('lotWidth')?.value;
    const parsedLotWidth = lotWidthValue === '' || lotWidthValue == null ? null : Number(lotWidthValue);
    const body = {
      jobNumber: document.getElementById('jobNumber').value.trim(),
      lot: document.getElementById('lot').value.trim(),
      block: document.getElementById('block').value.trim(),
      phase: document.getElementById('phase').value.trim(),
      address: document.getElementById('address').value.trim(),
      floorPlan: document.getElementById('floorPlan').value.trim(),
      elevation: document.getElementById('elevation').value.trim(),
      lotWidth: Number.isFinite(parsedLotWidth) && parsedLotWidth >= 0 ? parsedLotWidth : null
    };
    try {
      const res = await fetch(`/api/communities/${communityId}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Add lot failed (${res.status}): ${msg}`);
      }
      lotForm.reset();
      await loadCommunities();
      document.dispatchEvent(new CustomEvent('cm:communityChanged'));
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });

  document.addEventListener('cm:communitiesImported', loadCommunities);
  document.addEventListener('cm:communityChanged', loadCommunities);
  document.addEventListener('cm:communityClassificationSaved', loadCommunities);

  loadCommunities();
});
