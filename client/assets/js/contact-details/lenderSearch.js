// assets/js/contact-details/lenderSearch.js
import { getState } from './state.js';

export function initLenderSearch() {
  renderLenderSummary();
  renderLenderCards();
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
    <div>Phone: ${lender.phone || '—'}</div>
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
    // Optimistic local update: remove from state, then repaint
    contact.lenders = (contact.lenders || []).filter(l => l._id !== entry._id);
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

  const payload = {
    isPrimary:   !!container.querySelector(`input[name="primaryLender"][value="${entry._id}"]`)?.checked,
    status:      container.querySelector('.lender-status')?.value || '',
    inviteDate:  normalizeDate(container.querySelector('.lender-invite-date')?.value),
    approvedDate:normalizeDate(container.querySelector('.lender-approved-date')?.value)
  };

  try {
    btn.disabled = true; if (hint) hint.textContent = 'Saving…';
    const res = await fetch(`/api/contacts/${contactId}/lenders/${entry._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());

    // Mirror local state and repaint summary only (keeps cards intact)
    Object.assign(entry, payload);
    renderLenderSummary();
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

function setupPrimaryLenderRadios() {
  document.querySelectorAll('input[name="primaryLender"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const lenderId = e.target.value;
      const { contactId, contact } = getState();
      if (!contactId) return;

      try {
        const res = await fetch(`/api/contacts/${contactId}/lenders/${lenderId}/primary`, { method: 'PUT' });
        if (!res.ok) throw new Error(await res.text());

        // Optimistically update local state: set this one primary, others false
        (contact.lenders || []).forEach(l => { l.isPrimary = (l._id === lenderId); });
        renderLenderSummary();
        renderLenderCards(); // re-render to reflect radio state
      } catch (err) {
        console.error('Failed to set primary lender', err);
        alert('Could not update primary lender.');
        // Repaint to undo the optimistic UI if needed
        renderLenderCards();
      }
    });
  });
}

/* ---------- helpers ---------- */
function normalizeDate(v) {
  if (!v) return null;
  try { return new Date(v).toISOString(); } catch { return null; }
}
