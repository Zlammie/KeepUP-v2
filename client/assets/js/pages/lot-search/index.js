window.setupLotSearch = async function setupLotSearch() {
  console.log('lotSearch.js loaded');

  const searchInput        = document.getElementById('lot-search');
  const resultsContainer   = document.getElementById('lot-search-results');
  const linkButton         = document.getElementById('link-lot-btn');
  const communitySelect    = document.getElementById('community-select');

  // when user types, fetch matching lots
  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    resultsContainer.innerHTML = '';
    linkButton.disabled = true;
    delete linkButton.dataset.lotId;
    if (!query) return;

    const communityId = communitySelect?.value;
    if (!communityId) {
      resultsContainer.innerHTML = '<div style="color:red;">Missing community ID</div>';
      console.error('Missing community ID for lot search');
      return;
    }

    try {
      const res  = await fetch(`/api/communities/${communityId}/lots?q=${encodeURIComponent(query)}`);
      const lots = await res.json();

      if (!Array.isArray(lots) || !lots.length) {
        resultsContainer.innerHTML = '<div>No matching lots found</div>';
        return;
      }

        lots.slice(0, 8).forEach(lot => {
        const div = document.createElement('div');
        div.textContent = `${lot.address} (${lot.lot}, Block ${lot.block})`;
        div.classList.add('search-result');
        div.addEventListener('click', () => {
          linkButton.disabled = false;
          linkButton.dataset.lotId = lot._id;
          searchInput.value = lot.address;
          resultsContainer.innerHTML = '';
        });
        resultsContainer.appendChild(div);
      });

      // Optional: show a note if more than 10 were found
      if (lots.length > 10) {
        const note = document.createElement('div');
        note.style.fontSize = '0.8rem';
        note.style.color = '#666';
        note.textContent = `Showing 10 of ${lots.length} results… refine your search`;
        resultsContainer.appendChild(note);
      }
    } catch (err) {
      console.error('Lot search failed:', err);
      resultsContainer.innerHTML = '<div>Error fetching lots</div>';
    }
  });

  // when user clicks "Link Lot"
  linkButton.addEventListener('click', async e => {
    e.preventDefault();
    const lotId       = linkButton.dataset.lotId;
    const contactId   = window.contactId;
    const communityId = communitySelect?.value;

    if (!lotId || !contactId || !communityId) {
      return alert('Missing lot, contact, or community ID');
    }

    try {
      // 1) link the lot on the Contact side
      const res1 = await fetch(`/api/contacts/${contactId}/link-lot`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lotId })
      });
      if (!res1.ok) throw new Error('Failed to link lot to contact');

      // 2) set this contact as purchaser on the Community side
      const res2 = await fetch(
        `/api/communities/${communityId}/lots/${lotId}/purchaser`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ contactId })
        }
      );
      if (!res2.ok) throw new Error('Failed to set purchaser on lot');

      // 3) read back the updated lot (with purchaser populated)
      const updatedLot = await res2.json();

      // 4) swap UI from search → linked display
      document.getElementById('lot-link-container').style.display = 'none';
      const display = document.getElementById('linked-lot-display');
      display.innerHTML = `
        <div>
          <strong>Lot Linked:</strong><br/>
          Job #: ${updatedLot.jobNumber}<br/>
          Lot: ${updatedLot.lot} | Block: ${updatedLot.block}<br/>
          Address: ${updatedLot.address}<br/>
          <strong>Purchaser:</strong> ${updatedLot.purchaser.lastName}<br/>
          <button id="unlink-lot-btn">Unlink Lot</button>
        </div>
      `;
      display.style.display = 'block';

      // 5) re-bind unlink logic
      document.getElementById('unlink-lot-btn').addEventListener('click', async () => {
        const ok = confirm('Unlink this lot?');
        if (!ok) return;

        // unlink on Contact side
        const res3 = await fetch(`/api/contacts/${contactId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ linkedLot: null })
        });
        if (!res3.ok) return alert('Failed to unlink lot from contact');

        // optional: also clear purchaser on Community side
        await fetch(
          `/api/communities/${communityId}/lots/${lotId}/purchaser`,
          {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contactId: null })
          }
        );

        // reload to refresh UI
        if (typeof reloadContactWithParams === 'function') {
          reloadContactWithParams();
        } else {
          window.location.reload();
        }
      });

    } catch (err) {
      console.error('Error linking lot:', err);
      alert(err.message);
    }
  });
};

// Lot Search Logic for linked lots - Adding Sales Date and Sales Price//
async function linkSelectedLot({ communityId, lotId, contactId }) {
  const saleDateInput  = document.getElementById('sale-date');
  const salePriceInput = document.getElementById('sale-price');

  const salesDate  = saleDateInput.value ? new Date(saleDateInput.value) : null;
  const salesPrice = salePriceInput.value?.trim() || null;

  // Basic guardrails
  if (!lotId || !communityId || !contactId) {
    console.error('Missing lot/community/contact data for linking.');
    return;
  }

  // Prepare payload – include purchaser plus sales fields
  const payload = {
    purchaser: contactId,
    // Optional: uncomment if you want to mark the lot as SOLD here
    // status: 'SOLD',
    salesPrice: salesPrice,
    salesDate: salesDate, // If your schema is String, send saleDateInput.value instead
  };

  const res = await fetch(`/api/communities/${communityId}/lots/${lotId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Failed to link lot:', err);
    alert('Error linking lot. See console for details.');
    return;
  }

  const updatedLot = await res.json();

  // Update UI – show linked lot + sales details
  const display = document.getElementById('linked-lot-display');
  display.style.display = 'block';
  display.innerHTML = `
    <div class="linked-lot-card">
      <strong>Linked Lot:</strong> ${updatedLot.address || '—'}<br/>
      <strong>Job #:</strong> ${updatedLot.jobNumber || '—'}<br/>
      <strong>Sales Date:</strong> ${updatedLot.salesDate ? new Date(updatedLot.salesDate).toLocaleDateString() : '—'}<br/>
      <strong>Sales Price:</strong> ${updatedLot.salesPrice ? Number(updatedLot.salesPrice).toLocaleString() : '—'}
    </div>
  `;

  // Hide the purchased selector
  document.getElementById('purchased-community-selector').style.display = 'none';
}

