// assets/js/contact-details/realtorSearch.js
import { DOM } from './domCache.js';
import { debounce } from './utils.js';

// Public init (called from index.js)
export function initRealtorSearch() {
  // Prefer the new cached nodes, but fall back to the legacy id if needed.
  const input    = DOM.realtorSearch || document.getElementById('realtor-search');
  const results  = DOM.realtorList   || document.getElementById('realtor-search-results');
  if (!input || !results) return;

  // Debounced typeahead search
  input.addEventListener('input', debounce(() => onType(input, results), 250));

  // Enter to create when "No results" is showing
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const hasNoResults = results.dataset.state === 'empty';
    if (!hasNoResults) return;

    e.preventDefault();
    await createFromForm(results);
  });

  // Dismiss results on Escape / outside click
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearResults(results);
  });
  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== input) clearResults(results);
  });
}

/* ---------------- internal: search & render ---------------- */
async function onType(input, results) {
  const q = input.value.trim();
  clearResults(results);
  if (!q) return;

  setBusy(results, true);
  try {
    const res = await fetch(`/api/realtors/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const list = await res.json();

    if (!Array.isArray(list)) {
      return renderError(results, 'Unexpected response.');
    }
    if (list.length === 0) {
      return renderEmpty(results, 'No results found. Press Enter to create a new realtor from the fields.');
    }

    const frag = document.createDocumentFragment();
    list.forEach(r => frag.appendChild(resultRow(r, results)));
    results.appendChild(frag);
    results.dataset.state = 'results';
  } catch (err) {
    console.error('[realtor] search error', err);
    renderError(results, 'Error fetching realtors.');
  } finally {
    setBusy(results, false);
  }
}

function resultRow(realtor, results) {
  const div = document.createElement('div');
  div.className = 'search-result';
  const name = [realtor.firstName, realtor.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = realtor.email ? ` (${realtor.email})` : '';
  div.textContent = `${name}${email}`;
  div.addEventListener('click', () => {
    fillRealtorFields(realtor);
    // Keep backward compatibility with older flows that read this
    window.updatedContactRealtorId = realtor._id || realtor.id || null;
    clearResults(results);
  });
  return div;
}

/* ---------------- internal: create on Enter ---------------- */
async function createFromForm(results) {
  const payload = {
    firstName: val('realtorFirstName'),
    lastName:  val('realtorLastName'),
    email:     val('realtorEmail'),
    phone:     val('realtorPhone'),
    brokerage: val('realtorBrokerage'),
  };

  // Minimal validation: require at least a name or an email
  if (!payload.firstName && !payload.lastName && !payload.email) {
    return renderError(results, 'Enter a first/last name or an email before creating.');
  }

  setBusy(results, true);
  try {
    const res = await fetch('/api/realtors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const saved = await res.json();

    fillRealtorFields(saved);
    window.updatedContactRealtorId = saved._id || saved.id || null;
    clearResults(results);
  } catch (err) {
    console.error('[realtor] create error', err);
    renderError(results, 'Error creating realtor.');
  } finally {
    setBusy(results, false);
  }
}

/* ---------------- internal: DOM helpers ---------------- */
export function fillRealtorFields(realtor) {
  set('realtorFirstName', realtor.firstName || '');
  set('realtorLastName',  realtor.lastName  || '');
  set('realtorPhone',     realtor.phone     || '');
  set('realtorEmail',     realtor.email     || '');
  set('realtorBrokerage', realtor.brokerage || '');
}

function set(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function clearResults(results) {
  results.innerHTML = '';
  results.dataset.state = '';
}

function renderEmpty(results, msg) {
  results.innerHTML = `<div class="search-empty">${msg}</div>`;
  results.dataset.state = 'empty';
}
function renderError(results, msg) {
  results.innerHTML = `<div class="search-error">${msg}</div>`;
  results.dataset.state = 'error';
}
function setBusy(results, isBusy) {
  results.classList.toggle('is-loading', !!isBusy);
}
