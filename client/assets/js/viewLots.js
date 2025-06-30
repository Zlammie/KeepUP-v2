// public/scripts/viewLots.js
// Fetches and renders the lots table for a community

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ viewLots.js loaded');

  // Grab communityId from URL or fallback to <body data-community-id>
  const params = new URLSearchParams(window.location.search);
  const communityId = params.get('communityId') || document.body.dataset.communityId;
  if (!communityId) {
    console.error('Missing communityId in URL and data-community-id');
    return;
  }
  console.log('viewLots.js: Loading lots for community →', communityId);

  // A) Load all FloorPlans into a map for lookup
  let floorPlanMap = {};
  try {
    const fpRes = await fetch('/api/floorplans');
    if (fpRes.ok) {
      const fps = await fpRes.json();
      fps.forEach(fp => {
        // adjust "planName" if your FloorPlan uses a different key
        floorPlanMap[fp._id] = fp.planName || fp.name || '';
      });
      console.log('Loaded floorPlanMap:', floorPlanMap);
    } else {
      console.warn('Could not load floor plans:', fpRes.status);
    }
  } catch (err) {
    console.warn('Error fetching floor plans:', err);
  }

  try {
    const res = await fetch(`/api/communities/${communityId}/lots`);
    console.log('fetch status:', res.status);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed ${res.status}: ${text}`);
    }

    const lots = await res.json();
    console.log(`About to render ${lots.length} lots`);
    const tableBody = document.getElementById('lotsTableBody');
    tableBody.innerHTML = '';

    // Render each lot as a table row
    lots.forEach(lot => {
      console.log('Rendering lot:', lot._id, 'floorPlan:', lot.floorPlan);

      // B) Determine planName: use populated or map lookup
      const rawFP = lot.floorPlan;
      let planName = '';
      if (rawFP) {
        if (typeof rawFP === 'object') {
          planName = rawFP.planName || rawFP.name || '';
        } else {
          planName = floorPlanMap[rawFP] || '';
        }
      }

      const link = `address-details.html?communityId=${communityId}&lotId=${lot._id}`;
      const row = document.createElement('tr');
      row.dataset.lotId = lot._id;
      row.innerHTML = `
        <td><a href="${link}">${lot.jobNumber || ''}</a></td>
        <td><a href="${link}">${lot.lot || ''}/${lot.block || ''}/${lot.phase || ''}</a></td>
        <td><a href="${link}">${lot.address || ''}</a></td>
        <td>${planName}</td>
        <td contenteditable="true" data-field="elevation">${lot.elevation || ''}</td>
        <td contenteditable="true" data-field="status">${lot.status || ''}</td>
        <td>${lot.purchaser
          ? `<a href="contact-details.html?id=${lot.purchaser._id}">${lot.purchaser.lastName}</a>`
          : ''
        }</td>
        <td contenteditable="true" data-field="phone">${lot.phone || ''}</td>
        <td contenteditable="true" data-field="email">${lot.email || ''}</td>
        <td contenteditable="true" data-field="releaseDate">${
          lot.releaseDate ? new Date(lot.releaseDate).toLocaleDateString() : ''
        }</td>
        <td contenteditable="true" data-field="expectedCompletionDate">${
          lot.expectedCompletionDate
            ? new Date(lot.expectedCompletionDate).toLocaleDateString()
            : ''
        }</td>
        <td contenteditable="true" data-field="closeMonth">${lot.closeMonth || ''}</td>
        <td contenteditable="true" data-field="thirdParty">${
          lot.thirdParty ? new Date(lot.thirdParty).toLocaleDateString() : ''
        }</td>
        <td contenteditable="true" data-field="firstWalk">${
          lot.firstWalk ? new Date(lot.firstWalk).toLocaleDateString() : ''
        }</td>
        <td contenteditable="true" data-field="finalSignOff">${
          lot.finalSignOff ? new Date(lot.finalSignOff).toLocaleDateString() : ''
        }</td>
        <td contenteditable="true" data-field="lender">${lot.lender?.name || ''}</td>
        <td contenteditable="true" data-field="closeDateTime">${
          lot.closeDateTime ? new Date(lot.closeDateTime).toLocaleString() : ''
        }</td>
        <td contenteditable="true" data-field="listPrice">${lot.listPrice || ''}</td>
        <td contenteditable="true" data-field="salesPrice">${lot.salesPrice || ''}</td>
      `;
      tableBody.appendChild(row);
    });

    console.log('Rows appended:', tableBody.children.length);

    // Auto-save handler for contenteditable cells
    tableBody.addEventListener('focusout', async evt => {
      const cell = evt.target.closest('td[contenteditable="true"]');
      if (!cell) return;
      const field = cell.dataset.field;
      const row = cell.parentElement;
      const lotId = row.dataset.lotId;
      const newValue = cell.innerText.trim();
      if (newValue === '') return;

      const payload = { [field]: newValue };
      try {
        const saveRes = await fetch(
          `/api/communities/${communityId}/lots/${lotId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!saveRes.ok) {
          const errText = await saveRes.text();
          throw new Error(`Save failed: ${saveRes.status} - ${errText}`);
        }
      } catch (err) {
        console.error('Error saving lot field:', field, err);
      }
    });
  } catch (err) {
    console.error('Error loading lots:', err);
  }
});
