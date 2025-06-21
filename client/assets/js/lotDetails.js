document.addEventListener('DOMContentLoaded', async () => {
  const params     = new URLSearchParams(window.location.search);
  const commId     = params.get('communityId');
  const lotId      = params.get('lotId');
  if (!commId || !lotId) {
    return console.error('Missing communityId or lotId');
  }

  try {
    const res = await fetch(`/api/communities/${commId}/lots/${lotId}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const lot = await res.json();

    // Title
    document.getElementById('lotTitle').innerText =
      `Lot ${lot.jobNumber} – ${lot.address}`;

    // Details table
    const tbody = document.getElementById('lotDetailsBody');
    tbody.innerHTML = '';

    const fields = [
      ['Job Number', lot.jobNumber],
      ['Lot / Block / Phase', `${lot.lot} / ${lot.block} / ${lot.phase}`],
      ['Address', lot.address],
      ['Floor Plan', lot.floorPlan || ''],
      ['Elevation', lot.elevation || ''],
      ['Status', lot.status || ''],
      ['Purchaser',
        lot.purchaser
          ? `<a href="contact-details.html?id=${lot.purchaser._id}">
               ${lot.purchaser.lastName}
             </a>`
          : ''
      ],
      ['Phone', lot.phone || ''],
      ['Email', lot.email || ''],
      ['Release Date', lot.releaseDate || ''],
      ['Expected Completion', lot.expectedCompletionDate || ''],
      ['Close Month', lot.closeMonth || ''],
      ['3rd Party', lot.thirdParty || ''],
      ['1st Walk', lot.firstWalk || ''],
      ['Final Sign Off', lot.finalSignOff || ''],
      ['Lender', lot.lender || ''],
      ['Close Date & Time', lot.closeDateTime || ''],
      ['List Price', lot.listPrice || ''],
      ['Sales Price', lot.salesPrice || '']
    ];

    fields.forEach(([label, value]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${label}</strong></td><td>${value}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load lot details:', err);
    document.getElementById('lotTitle').innerText = 'Error loading lot';
  }
});
