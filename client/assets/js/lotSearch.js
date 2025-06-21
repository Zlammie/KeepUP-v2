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

      lots.forEach(lot => {
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
