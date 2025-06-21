document.addEventListener('DOMContentLoaded', () => {
  const searchInput  = document.getElementById('lender-search-input');
  const resultsDiv   = document.getElementById('lender-search-results');
  const infoFields   = document.getElementById('lender-info-fields');
  const linkBtn      = document.getElementById('lender-link-btn');

  // Abort early if elements are missing (e.g. on wrong page)
  if (!searchInput || !resultsDiv || !infoFields || !linkBtn) {
    console.warn('[LenderSearch] Missing DOM elements. Search not initialized.');
    return;
  }

  let pickedLender = null;

  // 1) As-you-type search
  searchInput.addEventListener('input', async () => {
    const q = searchInput.value.trim();
    resultsDiv.innerHTML = '';
    infoFields.style.display = 'none';
    linkBtn.disabled = true;
    pickedLender = null;

    if (!q) return;

    try {
      const res = await fetch(`/api/lenders/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(await res.text());
      const lenders = await res.json();

      if (!Array.isArray(lenders) || lenders.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results">No matching lenders found.</div>';
        return;
      }

      lenders.forEach(lender => {
        const row = document.createElement('div');
        row.textContent = `${lender.firstName} ${lender.lastName} — ${lender.email || lender.phone || ''}`;
        row.classList.add('suggestion');
        row.style.cursor = 'pointer';

        row.addEventListener('click', () => {
          pickedLender = lender;
          document.getElementById('lender-firstName').value  = lender.firstName  || '';
          document.getElementById('lender-lastName').value   = lender.lastName   || '';
          document.getElementById('lender-email').value      = lender.email      || '';
          document.getElementById('lender-phone').value      = lender.phone      || '';
          document.getElementById('lender-brokerage').value  = lender.brokerage  || '';
          infoFields.style.display = 'block';
          linkBtn.disabled = false;
          resultsDiv.innerHTML = '';
        });

        resultsDiv.appendChild(row);
      });

    } catch (err) {
      console.error('Search error:', err);
      resultsDiv.innerHTML = '<div class="error">Search failed</div>';
    }
  });

  // 2) Link button
  linkBtn.addEventListener('click', async () => {
    if (!pickedLender) return;

    const contactId = getContactId();
    if (!contactId) {
      alert('No contact ID in URL — cannot link lender.');
      return;
    }

    try {
      const res = await fetch(`/api/contacts/${contactId}/link-lender`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lenderId: pickedLender._id })
      });

      if (!res.ok) throw new Error(await res.text());
      alert('Lender linked successfully!');
      linkBtn.disabled = true;
      window.allowAutoSave = true;

      // Reload with current params preserved
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.set('id', contactId);
      if (!currentParams.get('status')) currentParams.set('status', 'purchased');
      if (!currentParams.get('source')) currentParams.set('source', 'walk-in-lead');

      window.location.href = `/contact-details.html?${currentParams.toString()}`;

    } catch (err) {
      console.error('Link error:', err);
      alert('Failed to link lender');
    }
  });
});
