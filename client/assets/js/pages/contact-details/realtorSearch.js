// assets/js/contact-details/realtorSearch.js
import { DOM } from './domCache.js';
import { debounce } from '../../core/async.js';
import { formatPhoneDisplay } from '../../shared/phone.js';

// Public init (called from index.js)
export function initRealtorSearch() {
  const input = DOM.realtorSearch || document.getElementById('realtor-search');
  const results = DOM.realtorList || document.getElementById('realtor-search-results');
  if (!input || !results) return;

  input.addEventListener('input', debounce(() => onType(input, results), 250));

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const hasNoResults = results.dataset.state === 'empty';
    if (!hasNoResults) return;

    e.preventDefault();
    await createFromForm(results);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearResults(results);
  });

  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== input) {
      clearResults(results);
    }
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
      renderError(results, 'Unexpected response.');
      return;
    }
    if (list.length === 0) {
      renderEmpty(results, 'No results found. Press Enter to create a new realtor from the fields.');
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach((realtor) => frag.appendChild(resultRow(realtor, results)));
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
  const emailPart = realtor.email ? ` (${realtor.email})` : '';
  div.textContent = `${name}${emailPart}`;
  div.addEventListener('click', () => {
    fillRealtorFields(realtor);
    window.updatedContactRealtorId = realtor._id || realtor.id || null;
    const hid = document.getElementById('realtorId');
    if (hid) {
      hid.value = String(window.updatedContactRealtorId || '');
      hid.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearResults(results);
  });
  return div;
}

/* ---------------- internal: create on Enter ---------------- */
async function createFromForm(results) {
  const payload = {
    firstName: val('realtorFirstName'),
    lastName: val('realtorLastName'),
    email: val('realtorEmail'),
    phone: val('realtorPhone'),
    brokerage: val('realtorBrokerage'),
  };

  if (!payload.firstName && !payload.lastName && !payload.email) {
    renderError(results, 'Enter a first/last name or an email before creating.');
    return;
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
    const hid = document.getElementById('realtorId');
    if (hid) {
      hid.value = String(window.updatedContactRealtorId || '');
      hid.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearResults(results);
  } catch (err) {
    console.error('[realtor] create error', err);
    renderError(results, 'Error creating realtor.');
  } finally {
    setBusy(results, false);
  }
}

/* ---------------- shared field helpers ---------------- */
export function fillRealtorFields(realtor) {
  set('realtorFirstName', realtor.firstName || '');
  set('realtorLastName', realtor.lastName || '');
  set('realtorPhone', formatPhoneDisplay(realtor.phone || ''));
  set('realtorEmail', realtor.email || '');
  set('realtorBrokerage', realtor.brokerage || '');
  updateRealtorDisplay(realtor);
}

export function updateRealtorDisplay(realtor = {}) {
  const nameEl = document.getElementById('realtor-card-name');
  if (nameEl) {
    const name = [realtor.firstName, realtor.lastName].filter(Boolean).join(' ').trim();
    nameEl.textContent = name || 'No realtor linked';
  }

  const phoneEl = document.getElementById('realtor-card-phone');
  if (phoneEl) {
    const formatted = formatPhoneDisplay(realtor.phone || '');
    phoneEl.textContent = formatted || '--';
    phoneEl.href = realtor.phone ? `tel:${realtor.phone}` : '#';
  }

  const emailEl = document.getElementById('realtor-card-email');
  if (emailEl) {
    const email = (realtor.email || '').trim();
    emailEl.textContent = email || '--';
    emailEl.href = email ? `mailto:${email}` : '#';
  }

  const brokerageEl = document.getElementById('realtor-card-brokerage');
  if (brokerageEl) {
    brokerageEl.textContent = realtor.brokerage || '--';
  }
}

function set(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

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

