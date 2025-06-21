// realtorSearch.js

/**
 * Wiring up the realtor search autocomplete and creation.
 */
function setupRealtorSearch() {
  const searchInput      = document.getElementById('realtor-search');
  const resultsContainer = document.getElementById('realtor-search-results');

  // ─── Handle typing (no debounce here; add one if you like) ─────────────────
  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    resultsContainer.innerHTML = '';

    if (!query) return;

    try {
      const res      = await fetch(`/api/realtors/search?q=${encodeURIComponent(query)}`);
      const realtors = await res.json();

      if (!Array.isArray(realtors)) {
        console.error('Expected array, got:', realtors);
        resultsContainer.innerHTML = '<div>Error fetching realtors</div>';
        return;
      }

      if (realtors.length === 0) {
        resultsContainer.innerHTML = '<div>No results found. Press Enter to create new realtor.</div>';
        return;
      }

      realtors.forEach(realtor => {
        const div = document.createElement('div');
        div.textContent = `${realtor.firstName} ${realtor.lastName} (${realtor.email})`;
        div.classList.add('search-result');

        div.addEventListener('click', () => {
          fillRealtorFields(realtor);
          updatedContactRealtorId = realtor._id;
          resultsContainer.innerHTML = '';
        });

        resultsContainer.appendChild(div);
      });
    } catch (err) {
      console.error('Search error:', err);
      resultsContainer.innerHTML = '<div>Error fetching realtors</div>';
    }
  });

  // ─── Handle Enter to create new realtor ────────────────────────────────
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && resultsContainer.innerHTML.includes('No results')) {
      e.preventDefault();

      const newRealtor = {
        firstName: document.getElementById('realtorFirstName').value,
        lastName:  document.getElementById('realtorLastName').value,
        email:     document.getElementById('realtorEmail').value,
        phone:     document.getElementById('realtorPhone').value,
        brokerage: document.getElementById('realtorBrokerage').value,
      };

      try {
        const res   = await fetch('/api/realtors', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(newRealtor),
        });
        const saved = await res.json();
        fillRealtorFields(saved);
        updatedContactRealtorId = saved._id;
        resultsContainer.innerHTML = '';
      } catch (err) {
        console.error('Error creating realtor:', err);
      }
    }
  });
}

/**
 * Populate the realtor fields in your form.
 */
function fillRealtorFields(realtor) {
  document.getElementById('realtorFirstName').value = realtor.firstName || '';
  document.getElementById('realtorLastName').value  = realtor.lastName  || '';
  document.getElementById('realtorPhone').value     = realtor.phone     || '';
  document.getElementById('realtorEmail').value     = realtor.email     || '';
  document.getElementById('realtorBrokerage').value = realtor.brokerage || '';
}

// Expose them so contactLoader.js can wire everything up
window.setupRealtorSearch  = setupRealtorSearch;
window.fillRealtorFields  = fillRealtorFields;
