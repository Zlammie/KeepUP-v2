document.addEventListener('DOMContentLoaded', () => {
  const communityForm = document.getElementById('community-form');
  const lotForm = document.getElementById('lotForm');
  const communitySelect = document.getElementById('communitySelect');
  const lotsContainer = document.getElementById('lotsContainer');

  // Load communities into dropdown
  async function loadCommunities() {
    const res = await fetch('/api/communities');
    const communities = await res.json();

    communitySelect.innerHTML = '';
    communities.forEach(c => {
      const option = document.createElement('option');
      option.value = c._id;
      option.textContent = `${c.name} (${c.projectNumber})`;
      communitySelect.appendChild(option);
    });

    renderLots(communities);
  }

  // Render communities and lots
  function renderLots(communities) {
    lotsContainer.innerHTML = '';
    communities.forEach(community => {
      const section = document.createElement('div');
      section.innerHTML = `<h3>${community.name} (${community.projectNumber})</h3>`;
      const list = document.createElement('ul');
      community.lots.forEach(lot => {
        const li = document.createElement('li');
        li.textContent = `Job: ${lot.jobNumber}, Lot: ${lot.lot}, Block: ${lot.block}, Phase: ${lot.phase}, Address: ${lot.address}`;
        list.appendChild(li);
      });
      section.appendChild(list);
      lotsContainer.appendChild(section);
    });
  }

  // Create community
  communityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('communityName').value;
    const projectNumber = document.getElementById('projectNumber').value;

    await fetch('/api/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, projectNumber })
    });

    communityForm.reset();
    loadCommunities();
  });

  // Add lot
  lotForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const lotData = {
      jobNumber: document.getElementById('jobNumber').value,
      lot: document.getElementById('lot').value,
      block: document.getElementById('block').value,
      phase: document.getElementById('phase').value,
      address: document.getElementById('address').value,
      floorPlan: document.getElementById('floorPlan').value,
      elevation: document.getElementById('elevation').value
    };

    const communityId = document.getElementById('communitySelect').value;

    await fetch(`/api/communities/${communityId}/lots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lotData)
    });

    lotForm.reset();
    loadCommunities();
  });
  
  document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  const fileInput = document.getElementById('importFile');
  formData.append('file', fileInput.files[0]);

  const res = await fetch('/api/communities/import', {
    method: 'POST',
    body: formData
  });

  const result = await res.json();
  console.log('Import result:', result);
  if (result.success) {
    alert('Import successful!');
    loadCommunities(); // Refresh list
  } else {
    alert('Import failed.');
  }
});

  loadCommunities();
});
