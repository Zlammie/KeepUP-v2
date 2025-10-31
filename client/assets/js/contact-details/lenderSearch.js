// assets/js/contact-details/lenderSearch.js
import { getState } from './state.js';
import { formatPhoneDisplay } from '../shared/phone.js';

export function initLenderSearch() {
  renderLenderSummary();
  renderLenderCards();
  initLenderSearchUI();
}

/* ---------- SUMMARY (top 3) ---------- */
function renderLenderSummary() {
  const { contact } = getState();
  const statusBox = document.querySelector('.all-status-cont');
  if (!statusBox) return;

  statusBox.innerHTML = '';
  const statusLabels = {
    invite: 'Invite',
    submittedapplication: 'Submitted Application',
    subdocs: 'Submitted Docs',
    missingdocs: 'Missing Docs',
    approved: 'Approved',
    cannotqualify: 'Cannot Qualify'
  };

  const lenders = Array.isArray(contact.lenders) ? contact.lenders : [];
  const maxCards = 3;

  for (let i = 0; i < maxCards; i++) {
    if (i < lenders.length) {
      const entry = lenders[i];
      const lender = entry.lender || {};
      const raw = entry.status || 'invite';
      const label = statusLabels[raw] || raw;
      const dateField = raw === 'approved' ? entry.approvedDate : entry.inviteDate;
      const displayDate = dateField ? new Date(dateField).toLocaleDateString('en-US') : '—';

      const el = document.createElement('div');
      el.className = 'lender-snippet' + (entry.isPrimary ? ' primary' : '');
      el.innerHTML = `
        <div class="lender-line lender-header">
          <strong class="lender-name">${(lender.firstName||'')} ${(lender.lastName||'')}</strong>
          <span class="lender-brokerage">${lender.brokerage || lender.lenderBrokerage || '—'}</span>
        </div>
        <div class="lender-line lender-status"><span class="lender-status-badge ${raw}">${label}</span></div>
        <div class="lender-line lender-dates">
          ${(raw === 'approved' ? 'Approved Date' : 'Invite Date')}: <span>${displayDate}</span>
        </div>
      `;
      statusBox.appendChild(el);
    } else {
      const ph = document.createElement('div');
      ph.className = 'lender-snippet placeholder';
      ph.innerHTML = `<div class="placeholder-icon">+</div>`;
      statusBox.appendChild(ph);
    }
  }
}

/* ---------- FULL LIST (cards) ---------- */
function renderLenderCards() {
  const { contact } = getState();
  const list = document.getElementById('lender-list-container');
  if (!list) return;

  list.innerHTML = '';
  if (!Array.isArray(contact.lenders)) return;

  contact.lenders.forEach((entry) => {
    list.appendChild(createLenderCard(entry));
  });

  setupPrimaryLenderRadios();
}

function createLenderCard(entry) {
  const container = document.createElement('div');
  const lender = entry?.lender || {};
  container.className = 'lender-card';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-lender-btn';
  removeBtn.dataset.entryId = entry._id;
  removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
    <path d="M10 11v6"></path>
    <path d="M14 11v6"></path>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
  </svg>`;
  removeBtn.addEventListener('click', () => onRemoveLender(entry));
  container.prepend(removeBtn);

  container.insertAdjacentHTML('beforeend', `
    <div><strong>${(lender.firstName||'')} ${(lender.lastName||'')}</strong></div>
    <div>Email: ${lender.email || '—'}</div>
    <div>Phone: ${formatPhoneDisplay(lender.phone || '') || '—'}</div>
    <div>Brokerage: ${lender.brokerage || lender.lenderBrokerage || '—'}</div>

    <label class="primary-label">
      <input type="radio" name="primaryLender" value="${entry._id}" ${entry.isPrimary ? 'checked' : ''} class="no-auto"/>
      <span>Primary Lender</span>
    </label>

    <label>Status:
      <select class="lender-status no-auto">
        <option value="">-- Select Status --</option>
        <option${entry.status==='invite'?' selected':''} value="invite">Invite</option>
        <option${entry.status==='submittedapplication'?' selected':''} value="submittedapplication">Submitted Application</option>
        <option${entry.status==='subdocs'?' selected':''} value="subdocs">Submitted Docs</option>
        <option${entry.status==='missingdocs'?' selected':''} value="missingdocs">Missing Docs</option>
        <option${entry.status==='approved'?' selected':''} value="approved">Approved</option>
        <option${entry.status==='cannotqualify'?' selected':''} value="cannotqualify">Cannot Qualify</option>
      </select>
    </label>

    <label>Invite Date:
      <input type="date" class="lender-invite-date no-auto" value="${entry.inviteDate?.split('T')[0]||''}" />
    </label>
    <label>Approved Date:
      <input type="date" class="lender-approved-date no-auto" value="${entry.approvedDate?.split('T')[0]||''}" />
    </label>

    <button type="button" class="save-lender-btn">Save</button>
    <span class="lender-save-hint" aria-live="polite" style="margin-left:.5rem;"></span>
  `);

  container.querySelector('.save-lender-btn')
    .addEventListener('click', () => onSaveLender(entry, container));

  return container;
}

/* ---------- actions ---------- */
async function onRemoveLender(entry) {
  const { contactId, contact } = getState();
  const lender = entry?.lender || {};
  if (!confirm(`Remove lender "${(lender.firstName||'')} ${(lender.lastName||'')}"?`)) return;
  if (!contactId) return alert('Missing contact ID — cannot remove lender.');

  try {
    const res = await fetch(`/api/contacts/${contactId}/lenders/${entry._id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());

    const updated = await res.json();
    if (updated && Array.isArray(updated.lenders)) {
      contact.lenders = updated.lenders;
    }

    renderLenderSummary();
    renderLenderCards();
  } catch (err) {
    console.error('Failed to remove lender:', err);
    alert('Failed to remove lender');
  }
}

async function onSaveLender(entry, container) {
  const { contactId, contact } = getState();
  if (!contactId) return alert('Missing contact ID — cannot save lender info.');

  const btn  = container.querySelector('.save-lender-btn');
  const hint = container.querySelector('.lender-save-hint');

  // Only fields your PATCH route actually updates
  const payload = {
    status:       container.querySelector('.lender-status')?.value || '',
    inviteDate:   normalizeDate(container.querySelector('.lender-invite-date')?.value),
    approvedDate: normalizeDate(container.querySelector('.lender-approved-date')?.value)
  };

  try {
    btn.disabled = true; if (hint) hint.textContent = 'Saving…';

    const res = await fetch(`/api/contacts/${contactId}/lenders/${entry._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());

    // Server returns the updated subdoc (populated)
    const serverEntry = await res.json(); // ← use it
    const idx = (contact.lenders || []).findIndex(l => l._id === entry._id);
    if (idx !== -1) contact.lenders[idx] = serverEntry; // replace in state with server truth

    // Repaint so everything is current (dates/status chips)
    renderLenderSummary();
    renderLenderCards();

    if (hint) hint.textContent = 'Saved';
    setTimeout(() => { if (hint && hint.textContent === 'Saved') hint.textContent = ''; }, 1200);
  } catch (err) {
    console.error('Failed to update lender:', err);
    alert('Error saving lender data');
    if (hint) hint.textContent = 'Error';
  } finally {
    btn.disabled = false;
  }
}


async function setupPrimaryLenderRadios() {
  document.querySelectorAll('input[name="primaryLender"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const lenderId = e.target.value;
      const { contactId, contact } = getState();
      if (!contactId) return;

      try {
        const res = await fetch(`/api/contacts/${contactId}/lenders/${lenderId}/primary`, { method: 'PUT' });
        if (!res.ok) throw new Error(await res.text());

        // Server returns the full contact (with lenders populated) — use it
        const updated = await res.json();
        if (updated && Array.isArray(updated.lenders)) {
          contact.lenders = updated.lenders;
        }

        renderLenderSummary();
        renderLenderCards();
      } catch (err) {
        console.error('Failed to set primary lender', err);
        alert('Could not update primary lender.');
        renderLenderCards(); // revert radio UI if needed
      }
    });
  });
}

/* =========================================================
   LENDER SEARCH + LINK (non-breaking add-on)
   ========================================================= */
let _selectedLender = null;
let _abortController = null;

function initLenderSearchUI() {
  const input    = document.getElementById('lender-search-input');
  const results  = document.getElementById('lender-search-results');
  const infoWrap = document.getElementById('lender-info-fields');
  const linkBtn  = document.getElementById('lender-link-btn');

  // If this page doesn’t have the block, bail quietly
  if (!input || !results || !infoWrap || !linkBtn) return;

  // typing → debounce → search
  input.addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    _selectedLender = null;
    linkBtn.disabled = true;
    clearInfoFields();
    infoWrap.style.display = 'none';

    if (!q || q.length < 2) { results.innerHTML = ''; return; }

    // cancel previous fetch if still running
    if (_abortController) _abortController.abort();
    _abortController = new AbortController();

    results.innerHTML = `<div class="results-note">Searching…</div>`;
    try {
      const matches = await lenderSearchAPI(q, _abortController.signal);
      renderSearchResults(matches);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[lender search] failed:', err);
        results.innerHTML = `<div class="results-note">Search failed</div>`;
      }
    }
  }, 250));

  linkBtn.addEventListener('click', linkSelectedLender);
}

async function lenderSearchAPI(query, signal) {
  const res = await fetch(`/api/lenders/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderSearchResults(list) {
  const results  = document.getElementById('lender-search-results');
  const infoWrap = document.getElementById('lender-info-fields');
  const linkBtn  = document.getElementById('lender-link-btn');

  if (!Array.isArray(list) || list.length === 0) {
    results.innerHTML = `<div class="results-note">No matches — refine your search.</div>`;
    infoWrap.style.display = 'none';
    linkBtn.disabled = true;
    return;
  }

  results.innerHTML = '';
  list.forEach(l => {
    const row = document.createElement('div');
    row.className = 'result-item';
    const name = `${esc(l.firstName || '')} ${esc(l.lastName || '')}`.trim() || '—';
    const broker = esc(l.brokerage || l.lenderBrokerage || '—');
    const email  = esc(l.email || '—');
    const phoneDisplay = formatPhoneDisplay(l.phone || '') || '—';
    const phone  = esc(phoneDisplay);

    row.innerHTML = `
      <div class="name"><strong>${name}</strong></div>
      <div class="sub">${email} • ${phone} • ${broker}</div>
    `;
    row.addEventListener('click', () => selectLender(l));
    results.appendChild(row);
  });
}

function selectLender(l) {
  _selectedLender = l;
  setValue('lender-firstName', l.firstName || '');
  setValue('lender-lastName',  l.lastName  || '');
  setValue('lender-email',     l.email     || '');
  setValue('lender-phone',     formatPhoneDisplay(l.phone || ''));
  setValue('lender-brokerage', l.brokerage || l.lenderBrokerage || '');

  document.getElementById('lender-info-fields').style.display = 'block';
  document.getElementById('lender-link-btn').disabled = false;
}

async function linkSelectedLender() {
  if (!_selectedLender) return;
  const { contactId, contact } = getState();
  if (!contactId) { alert('Missing contact ID — cannot link lender.'); return; }

  const btn = document.getElementById('lender-link-btn');
  try {
    btn.disabled = true;

    // Old route: PATCH /api/contacts/:contactId/link-lender
    const res = await fetch(`/api/contacts/${contactId}/link-lender`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lenderId: _selectedLender._id,
        status: 'invite',
        inviteDate: null,
        approvedDate: null
      })
    });
    if (!res.ok) throw new Error(await res.text());

    // server returns the updated contact with lenders populated
    const updated = await res.json();

    // Refresh local state with the server's truth
    if (updated && Array.isArray(updated.lenders)) {
      contact.lenders = updated.lenders;
    }

    // repaint
    renderLenderSummary();
    renderLenderCards();

    // reset UI
    setValue('lender-firstName','');
    setValue('lender-lastName','');
    setValue('lender-email','');
    setValue('lender-phone','');
    setValue('lender-brokerage','');
    const input   = document.getElementById('lender-search-input');
    const results = document.getElementById('lender-search-results');
    if (input)   input.value = '';
    if (results) results.innerHTML = '';
    document.getElementById('lender-info-fields').style.display = 'none';
    _selectedLender = null;
  } catch (err) {
    console.error('[lender link] failed:', err);
    alert('Failed to link lender');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- tiny helpers ---------- */
function debounce(fn, wait = 250) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}
function setValue(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}
function clearInfoFields() {
  ['lender-firstName','lender-lastName','lender-email','lender-phone','lender-brokerage']
    .forEach(id => setValue(id, ''));
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

/* ---------- helpers ---------- */
function normalizeDate(v) {
  if (!v) return null;
  try { return new Date(v).toISOString(); } catch { return null; }
}
