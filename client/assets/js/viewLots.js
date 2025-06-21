// public/scripts/viewLots.js
document.addEventListener('DOMContentLoaded', async () => {
  const params      = new URLSearchParams(window.location.search);
  const communityId = params.get('communityId');
  if (!communityId) {
    console.error('Missing communityId in query string');
    return;
  }

  // 1) Fetch and render the table
  const res  = await fetch(`/api/communities/${communityId}/lots`);
  const lots = await res.json();
  const tableBody = document.getElementById('lotsTableBody');
  tableBody.innerHTML = '';

  lots.forEach(lot => {
    const row = document.createElement('tr');
    row.dataset.lotId = lot._id;              // store lotId for saves

    row.innerHTML = `
      <td contenteditable="true" data-field="jobNumber">${lot.jobNumber || ''}</td>
      <td contenteditable="true" data-field="lotBlockPhase">
        ${lot.lot} / ${lot.block} / ${lot.phase}
      </td>
      <td contenteditable="true" data-field="address">${lot.address || ''}</td>
      <td contenteditable="true" data-field="floorPlan">${lot.floorPlan || ''}</td>
      <td contenteditable="true" data-field="elevation">${lot.elevation || ''}</td>
      <td contenteditable="true" data-field="status">${lot.status || ''}</td>

      <td data-field="purchaser">
        ${
          lot.purchaser
            ? `<a href="contact-details.html?id=${lot.purchaser._id}">
                 ${lot.purchaser.lastName}
               </a>`
            : ''
        }
      </td>

      <td contenteditable="true" data-field="phone">${lot.phone || ''}</td>
      <td contenteditable="true" data-field="email">${lot.email || ''}</td>
      <td contenteditable="true" data-field="releaseDate">${lot.releaseDate || ''}</td>
      <td contenteditable="true" data-field="expectedCompletionDate">${lot.expectedCompletionDate || ''}</td>
      <td contenteditable="true" data-field="closeMonth">${lot.closeMonth || ''}</td>
      <td contenteditable="true" data-field="thirdParty">${lot.thirdParty || ''}</td>
      <td contenteditable="true" data-field="firstWalk">${lot.firstWalk || ''}</td>
      <td contenteditable="true" data-field="finalSignOff">${lot.finalSignOff || ''}</td>
      <td contenteditable="true" data-field="lender">${lot.lender || ''}</td>
      <td contenteditable="true" data-field="closeDateTime">${lot.closeDateTime || ''}</td>
      <td contenteditable="true" data-field="listPrice">${lot.listPrice || ''}</td>
      <td contenteditable="true" data-field="salesPrice">${lot.salesPrice || ''}</td>
    `;
    tableBody.appendChild(row);
  });

  // 2) Auto-save on blur for any editable cell
  tableBody.addEventListener('focusout', async evt => {
    const cell = evt.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    const field = cell.dataset.field;
    const row   = cell.parentElement;
    const lotId = row.dataset.lotId;
    let payload;

    if (field === 'lotBlockPhase') {
      // split back into three values
      const [lotNum, block, phase] = cell.innerText
        .split('/')
        .map(s => s.trim());
      payload = { lot: lotNum, block, phase };
    } else {
      payload = { [field]: cell.innerText.trim() };
    }

    try {
      const saveRes = await fetch(
        `/api/communities/${communityId}/lots/${lotId}`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        }
      );
      if (!saveRes.ok) throw new Error(`Save failed: ${saveRes.status}`);
    } catch (err) {
      console.error('Error saving lot field:', field, err);
      // Optionally: revert cell.innerText to the previous value
    }
  });
});
