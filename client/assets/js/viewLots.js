// public/scripts/viewLots.js
// Fetches, groups by close month, and renders the lots table for a community with accurate UTC date-only parsing

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ viewLots.js loaded');

  // Utility functions for UTC date-only parsing + formatting
  function parseDateUTC(dateStr) {
    // If it's date-only (YYYY-MM-DD), append Z to treat as UTC
    const iso = dateStr.length === 10 ? `${dateStr}T00:00:00Z` : dateStr;
    return new Date(iso);
  }

  function formatDateUTC(dateStr) {
    const d = parseDateUTC(dateStr);
    const month = d.getUTCMonth() + 1;
    const day   = d.getUTCDate();
    const year  = d.getUTCFullYear();
    return `${month}/${day}/${year}`;
  }

  function formatMonthYearUTC(dateStr) {
    const d = parseDateUTC(dateStr);
    return d.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  // Grab communityId from URL or fallback to <body data-community-id>
  const params = new URLSearchParams(window.location.search);
  const communityId = params.get('communityId') || document.body.dataset.communityId;
  if (!communityId) {
    console.error('Missing communityId in URL and data-community-id');
    return;
  }

  // Load all FloorPlans into a map for lookup
  let floorPlanMap = {};
  try {
    const fpRes = await fetch('/api/floorplans');
    if (fpRes.ok) {
      const fps = await fpRes.json();
      fps.forEach(fp => {
        floorPlanMap[fp._id] = fp.planName || fp.name || '';
      });
    }
  } catch (err) {
    console.warn('Error fetching floor plans:', err);
  }

  try {
    const res = await fetch(`/api/communities/${communityId}/lots`);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const lots = await res.json();

    // Sort by closeMonth: defined ascending, then undefined
    lots.sort((a, b) => {
      if (!a.closeMonth && !b.closeMonth) return 0;
      if (!a.closeMonth) return 1;
      if (!b.closeMonth) return -1;
      return parseDateUTC(a.closeMonth) - parseDateUTC(b.closeMonth);
    });

    const tableBody = document.getElementById('lotsTableBody');
    tableBody.innerHTML = '';

    // Group by UTC month-year
    const groups = lots.reduce((acc, lot) => {
      const key = lot.closeMonth
        ? formatMonthYearUTC(lot.closeMonth)
        : 'No Close Month';
      (acc[key] = acc[key] || []).push(lot);
      return acc;
    }, {});

    // Render each group with header and rows
    Object.entries(groups).forEach(([monthYear, groupLots]) => {
      // Header row
      const headerRow = document.createElement('tr');
      headerRow.classList.add('group-header');
      headerRow.innerHTML = `<td colspan="19">${monthYear}</td>`;
      tableBody.appendChild(headerRow);

      groupLots.forEach(lot => {
        // Determine planName
        const rawFP = lot.floorPlan;
        let planName = '';
        if (rawFP) {
          planName = typeof rawFP === 'object'
            ? (rawFP.planName || rawFP.name || '')
            : (floorPlanMap[rawFP] || '');
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
            ? `<a href=\"contact-details.html?id=${lot.purchaser._id}\">${lot.purchaser.lastName}</a>`
            : ''
          }</td>
          <td contenteditable="true" data-field="phone">${lot.phone || ''}</td>
          <td contenteditable="true" data-field="email">${lot.email || ''}</td>
          <td contenteditable="true" data-field="releaseDate">${
            lot.releaseDate ? formatDateUTC(lot.releaseDate) : ''
          }</td>
          <td contenteditable="true" data-field="expectedCompletionDate">${
            lot.expectedCompletionDate ? formatDateUTC(lot.expectedCompletionDate) : ''
          }</td>
          <td>${monthYear}</td>
          <td contenteditable="true" data-field="thirdParty">${
            lot.thirdParty ? formatDateUTC(lot.thirdParty) : ''
          }</td>
          <td contenteditable="true" data-field="firstWalk">${
            lot.firstWalk ? formatDateUTC(lot.firstWalk) : ''
          }</td>
          <td contenteditable="true" data-field="finalSignOff">${
            lot.finalSignOff ? formatDateUTC(lot.finalSignOff) : ''
          }</td>
          <td contenteditable="true" data-field="lender">${lot.lender?.name || ''}</td>
          <td contenteditable="true" data-field="closeDateTime">${
            lot.closeDateTime
              ? parseDateUTC(lot.closeDateTime)
                  .toLocaleString('en-US', { timeZone: 'UTC' })
              : ''
          }</td>
          <td contenteditable="true" data-field="listPrice">${lot.listPrice || ''}</td>
          <td contenteditable="true" data-field="salesPrice">${lot.salesPrice || ''}</td>
        `;
        tableBody.appendChild(row);
      });
    });
  } catch (err) {
    console.error('Error loading lots:', err);
  }
});
