

// contactLoader.js

document.addEventListener('DOMContentLoaded', () => {
  const contactId = getContactId();
  if (!contactId) {
    console.error('No contact ID in URL — use ?id=<theContactId>');
    return;
  }

  window.contactId = contactId;
  window.saveTimeout = null;

  

 loadContact().then(() => {
  setupAutoSaveListeners();
  setupRealtorSearch();
  document
    .querySelectorAll('.lender-form')
    .forEach(form => setupLenderSearch(form));

  setupCommentSection();

  // ✅ Finally call this
  setupLotSearch();
  updateTopBarSummary();
    document
      .querySelectorAll('#more-info-body input, #more-info-body select')
     .forEach(el => el.addEventListener('change', updateTopBarSummary));
  });
});

async function handleCommunityChange(e) {
  const commId      = e.target.value;
  const fpContainer = document.getElementById('floorplans-container');
  fpContainer.innerHTML = '';  // clear old

  if (!commId) return;

  try {
    const res   = await fetch(`/api/communities/${commId}/floorplans`);
    const plans = await res.json();

    plans.forEach(plan => {
      const lbl = document.createElement('label');
      lbl.style.display = 'block';
      const cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.name    = 'floorplans';
      cb.value   = plan._id;

      lbl.appendChild(cb);
      lbl.insertAdjacentText('beforeend', ` ${plan.name} (${plan.planNumber})`);
      fpContainer.appendChild(lbl);
    });
      // re-bind autosave for the new checkboxes
      if (window.setupAutoSaveListeners) setupAutoSaveListeners();

      // update the summary once
      updateTopBarSummary();

      // hook each new floorplan box to update the summary on change
      document
        .querySelectorAll('#floorplans-container input')
        .forEach(cb => cb.addEventListener('change', updateTopBarSummary));
            updateTopBarSummary();

      // bind summary updates on the new floorplan checkboxes
      document
        .querySelectorAll('#floorplans-container input')
        .forEach(cb => cb.addEventListener('change', updateTopBarSummary));
    
  } catch (err) {
    console.error('Failed to load floor plans:', err);
  }
  
}

// Reusable safe reload
function reloadContactWithParams() {
  const id = getContactId();
  if (!id) return alert('Missing contact ID');

  const currentParams = new URLSearchParams(window.location.search);
  currentParams.set('id', id);

  // Always preserve status/source if they exist
  if (!currentParams.get('status')) currentParams.set('status', 'purchased');
  if (!currentParams.get('source')) currentParams.set('source', 'walk-in-lead');

  window.location.href = `/contact-details.html?${currentParams.toString()}`;
}
window.reloadContactWithParams = reloadContactWithParams;

function updateTopBarSummary() {
  // 1) Text fields
  document.getElementById('summary-lotLineUp').textContent =
    document.getElementById('lotLineUp').value || '—';
  document.getElementById('summary-buyTime').textContent =
    document.getElementById('buyTime').value   || '—';
  document.getElementById('summary-buyMonth').textContent =
    document.getElementById('buyMonth').value  || '—';

  // 2) Facing checkboxes
  const facing = Array.from(
    document.querySelectorAll('input[name="facing"]:checked')
  ).map(cb => cb.value);
  document.getElementById('summary-facing').textContent =
    facing.length ? facing.join(', ') : '—';

  // 3) Floor plans (read labels next to checked boxes)
  const plans = Array.from(
    document.querySelectorAll('#floorplans-container input:checked')
  ).map(cb => cb.closest('label').innerText.trim());
  document.getElementById('summary-floorplans').textContent =
    plans.length ? plans.join(', ') : '—';

  // 4) Living condition
  const living = [];
  if (document.getElementById('investor').checked)    living.push('Investor');
  if (document.getElementById('renting').checked)     living.push('Renting');
  if (document.getElementById('own-selling').checked) living.push('Own & Selling');
  if (document.getElementById('own-not-selling').checked) living.push('Own & Not Selling');
  document.getElementById('summary-living').textContent =
    living.length ? living.join(', ') : '—';
}

async function loadContact() {
  const contactId = window.contactId;

  if (!contactId) {
    console.error('No contact ID in URL — use ?id=<theContactId>');
    return;
  }

  const res = await fetch(`/api/contacts/${contactId}`);
  if (!res.ok) {
    console.error('Failed to fetch contact:', await res.text());
    alert('Contact not found or invalid ID');
    return;
  }

  const contact = await res.json();
  const communitySelect = document.getElementById('community-select');
  try {
    const commRes = await fetch('/api/communities');
    const comms   = await commRes.json();

    // clear & add default
    communitySelect.innerHTML = '<option value="">-- Select Community --</option>';
    comms.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c._id;
      opt.textContent = c.name;
      communitySelect.appendChild(opt);
    });

    // pre-select saved community
    const savedComm = contact.communityId?._id || contact.communityId || '';
    communitySelect.value = savedComm;
  } catch (err) {
    console.error('Failed to load communities:', err);
  }
   communitySelect.addEventListener('change', handleCommunityChange);

  const fpContainer = document.getElementById('floorplans-container');
fpContainer.innerHTML = '';  // clear any old checkboxes

if (contact.communityId) {
  const commId = contact.communityId._id || contact.communityId;
  const plansRes = await fetch(`/api/communities/${commId}/floorplans`);
  const plans    = await plansRes.json();

  plans.forEach(plan => {
    const lbl = document.createElement('label');
    lbl.style.display = 'block';
    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.name  = 'floorplans';
    cb.value = plan._id;
    

    if (contact.floorplans?.includes(plan._id)) {
      cb.checked = true;
    }

    lbl.appendChild(cb);
    lbl.insertAdjacentText('beforeend', ` ${plan.name} (${plan.planNumber})`);
    fpContainer.appendChild(lbl);
  });
}


  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const nameEl = document.getElementById('contact-full-name');
  if (nameEl) nameEl.textContent = fullName || 'Unnamed Contact';


  // ✅ Update contact status badge
  const statusEl = document.getElementById('contact-status-badge');
  if (statusEl) {
    const rawStatus = (contact.status || 'new').toLowerCase();

    // Match this to your status-styling.js values
    const statusBackgrounds = {
      'new': '#0E79B2',
      'be-back': '#FFB347',
      'cold': '#4682B4',
      'target': '#6A0DAD',
      'possible': '#B57EDC',
      'negotiating': '#3CB371',
      'purchased': '#2E8B57',
      'closed': '#495057',
      'not-interested': '#FF6F61',
      'deal-lost': '#B22222',
      'bust': '#8B0000'
    };

    const bgColor = statusBackgrounds[rawStatus] || '#ccc';

    statusEl.textContent = (window.formatStatusLabel)
  ? window.formatStatusLabel(rawStatus)
  : rawStatus.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    statusEl.style.backgroundColor = bgColor;
    statusEl.style.color = (rawStatus === 'cold' || rawStatus === 'negotiating') ? '#000' : '#fff';
  }

  // --- live sync for the top status badge ---
(function () {
  const statusSelect = document.getElementById('status');
  const topBadge     = document.getElementById('contact-status-badge');
  if (!statusSelect || !topBadge) return;

  // reuse your formatter if you exposed it; otherwise fallback
  const format = (window.formatStatusLabel)
    ? window.formatStatusLabel
    : (s) => String(s || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

  const normalizeKey = (s) => String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  // if you keep inline colors on the badge, reuse your background map
  const bgMap = (window.statusBackgrounds) || {
    'new': '#0E79B2',
    'be-back': '#FFB347',
    'cold': '#4682B4',
    'target': '#6A0DAD',
    'possible': '#B57EDC',
    'negotiating': '#3CB371',
    'purchased': '#2E8B57',
    'closed': '#495057',
    'not-interested': '#FF6F61',
    'deal-lost': '#B22222',
    'bust': '#8B0000'
  };

  function applyTopBadge(val) {
    const key   = normalizeKey(val);
    const label = format(val);

    // (A) If you rely on CSS classes for colors:
    topBadge.className = `status-badge ${key}`;

    // (B) If you still use inline colors, keep these 3 lines:
    const bg = bgMap[key];
    if (bg) {
      topBadge.style.backgroundColor = bg;
      topBadge.style.color = (key === 'cold' || key === 'negotiating') ? '#000' : '#fff';
    } else {
      topBadge.style.backgroundColor = '';
      topBadge.style.color = '';
    }

    topBadge.textContent = label;
  }

  // initial render + on change
  applyTopBadge(statusSelect.value);
  statusSelect.addEventListener('change', () => {
    applyTopBadge(statusSelect.value);
  });
})();
const statusBox = document.querySelector('.all-status-cont');
statusBox.innerHTML = ''; // clear out old cards

// map enum → human labels
const statusLabels = {
  invite:         'Invite',
  subApplication: 'Submitted Application',
  subDocs:        'Submitted Docs',
  missingDocs:    'Missing Docs',
  approved:       'Approved',
  cannotQualify:  'Cannot Qualify'
};

const lenders = Array.isArray(contact.lenders) ? contact.lenders : [];
const maxCards = 3;

for (let i = 0; i < maxCards; i++) {
  if (i < lenders.length) {
    // real lender
    const entry     = lenders[i];
    const lender    = entry.lender;
    const rawStatus = entry.status || 'invite';
    const label     = statusLabels[rawStatus] || rawStatus;
    const dateField = rawStatus === 'approved' ? entry.approvedDate : entry.inviteDate;
    const displayDate = dateField ? new Date(dateField).toLocaleDateString('en-US') : '—';

    const snippet = document.createElement('div');
    snippet.className = 'lender-snippet';
    if (entry.isPrimary) snippet.classList.add('primary');
    snippet.innerHTML = `
     <div class="lender-line lender-header">
        <strong class="lender-name">${lender.firstName} ${lender.lastName}</strong>
        <span class="lender-brokerage">${lender.brokerage || lender.lenderBrokerage || '—'}</span>
      </div>
      <div class="lender-line lender-status">
        <span class="lender-status-badge ${rawStatus}">${label}</span>
      </div>
      <div class="lender-line lender-dates">
        ${rawStatus === 'approved' ? 'Approved Date' : 'Invite Date'}:
        <span>${displayDate}</span>
      </div>
    `;
    statusBox.appendChild(snippet);

  } else {
    // placeholder card
    const ph = document.createElement('div');
    ph.className = 'lender-snippet placeholder';
    ph.innerHTML = `<div class="placeholder-icon">+</div>`;
    statusBox.appendChild(ph);
  }
}

  const lenderList = document.getElementById('lender-list-container');
 if (lenderList) {
    lenderList.innerHTML = ''; // clear before re-render
    if (Array.isArray(contact.lenders)) {
      contact.lenders.forEach((entry, idx) => {
        const card = createLenderCard(entry, idx);
        lenderList.appendChild(card);
      });
      setupPrimaryLenderRadios();
    }
  }

  function setupPrimaryLenderRadios() {
  document
    .querySelectorAll('input[name="primaryLender"]')
    .forEach(radio => {
      radio.addEventListener('change', async e => {
        const lenderId = e.target.value;
        const contactId = window.contactId; // from your loader

        try {
          await fetch(
            `/api/contacts/${contactId}/lenders/${lenderId}/primary`,
            { method: 'PUT' }
          );
          // reload the contact so the UI (and the isPrimary flags) refresh
          reloadContactWithParams();
        } catch (err) {
          console.error('Failed to set primary lender', err);
          alert('Could not update primary lender.');
        }
      });
    });
}

  // Populate realtor
  if (contact.realtor?._id) {
    window.updatedContactRealtorId = contact.realtor._id;
    fillRealtorFields(contact.realtor);
  }

  // Populate contact fields
  document.getElementById('firstName').value    = contact.firstName || '';
  document.getElementById('lastName').value     = contact.lastName  || '';
  document.getElementById('email').value        = contact.email     || '';
  document.getElementById('phone').value        = contact.phone     || '';
  document.getElementById('status').value       = contact.status    || '';
  document.getElementById('source').value       = contact.source    || '';
  document.getElementById('investor').checked   = contact.investor  || false;
  document.getElementById('owner').value = contact.owner || '';
  document.getElementById('visit-date').value   = contact.visitDate   || '';
  document.getElementById('lotLineUp').value    = contact.lotLineUp   || '';
  document.getElementById('buyTime').value     = contact.buyTime  || '';
  document.getElementById('buyMonth').value    = contact.buyMonth || '';
  // Facing checkboxes
  document.querySelectorAll('input[name="facing"]').forEach(cb => {
    cb.checked = Array.isArray(contact.facing)
                && contact.facing.includes(cb.value);
  });
  // Living condition checkboxes
  document.getElementById('investor').checked     = contact.investor     || false;
  document.getElementById('renting').checked      = contact.renting      || false;
  document.getElementById('own-selling').checked  = contact.ownSelling   || false;
  document.getElementById('own-not-selling').checked = contact.ownNotSelling || false;

  

// ⬇️ REPLACE your current "if (contact.linkedLot?.jobNumber) { ... }" with this:
if (contact.linkedLot?.jobNumber) {
  const lot = contact.linkedLot;

  // helpers
  const fmtDate = v => v ? new Date(v).toLocaleDateString() : '—';
  const fmtMoney = v => (v || v === 0) ? Number(v).toLocaleString() : '—';
  const safe = (v) => (v ?? '—');

  const planLabel = lot.planName || lot.floorPlan?.name || lot.floorPlanName || lot.plan || null;
  const elevLabel = lot.elevation || lot.elev || null;
  const planElev  = planLabel && elevLabel ? `${planLabel} – ${elevLabel}` : (planLabel || '—');

  const display = document.getElementById('linked-lot-display');
  display.innerHTML = `
      <div class="linked-lot-card linked-lot-grid">
        <!-- Address (full width) -->
        <div class="lot-address" role="heading" aria-level="3">
          <span>${safe(lot.address)}</span>
        </div>

        <!-- Chips row (3 items) -->
        <div class="lot-chip-row">
          <div class="lot-chip"><strong>Job #:</strong> ${lot.jobNumber || '—'}</div>
          <div class="lot-chip"><strong>Lot:</strong> ${lot.lot || '—'} / ${lot.block || '—'}</div>
          <div class="lot-chip plan-chip"><strong>Plan & Elev:</strong> ${(lot.plan || lot.planName || '—')}${lot.elevation ? ' – ' + lot.elevation : ''}</div>
        </div>

        <!-- Left column, box 1: Prices -->
        <section class="lot-box prices-box">
          <div class="form-pair">
            <label for="linked-list-price"><strong>List Price:</strong></label>
            <input type="number" id="linked-list-price" placeholder="e.g. 435000" step="0.01" inputmode="decimal" />
          </div>

          <div class="form-pair">
            <label for="linked-sales-price"><strong>Sales Price:</strong></label>
            <input type="number" id="linked-sales-price" placeholder="e.g. 425000" step="0.01" inputmode="decimal" />
          </div>

          <div class="form-pair">
            <label for="linked-sale-date"><strong>Sales Date:</strong></label>
            <input type="date" id="linked-sale-date" />
          </div>
        </section>

        <!-- Left column, box 2: Build -->
        <section class="lot-box build-box">
          <div><strong>Build Status:</strong> ${safe(lot.buildStatus)}</div>
          <div><strong>Release Date:</strong> ${fmtDate(lot.releaseDate)}</div>
          <div><strong>Projected Completion:</strong> ${fmtDate(lot.projectedCompletion || lot.projectedCompletionDate)}</div>
        </section>

        <!-- Right column: Close/inspection (tall, spans both rows) -->
        <section class="lot-box close-box">
          <div><strong>Close Month:</strong> ${safe(lot.closeMonth)}</div>
          <div><strong>Lender Close Status:</strong> ${safe(lot.lenderCloseStatus)}</div>
          <div><strong>Close Date & Time:</strong> ${fmtDate(lot.closeDate)} ${lot.closeTime ?? ''}</div>
          <div><strong>3rd Party Date:</strong> ${fmtDate(lot.thirdPartyDate || lot.thirdPartyInspectionDate)}</div>
          <div><strong>1st Walk Date:</strong> ${fmtDate(lot.firstWalkDate)}</div>
          <div><strong>Final Sign Off Date:</strong> ${fmtDate(lot.finalSignOffDate)}</div>
        </section>

        <div class="lot-actions">
          <button id="unlink-lot-btn" type="button">Unlink Lot</button>
        </div>
      </div>
    `;
  display.style.display = 'block';

 // 1) Grab the inline inputs we just rendered
const listInput  = document.getElementById('linked-list-price');
const salesInput = document.getElementById('linked-sales-price');
const dateInput  = document.getElementById('linked-sale-date');

// Helpers for hydration
const readMoney = v => v == null ? '' : String(v).replace(/[^0-9.]/g,'');
const readDate  = v => !v ? '' : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toISOString().slice(0,10));

// 2) IDs to reach the real lot subdoc
const communityId = lot.communityId;
const lotId       = lot.lotId;

// 3) Hydrate inputs (prefer the Community lot; fall back to contact.linkedLot)
async function hydrateFromCommunityLot() {
  try {
    if (!communityId || !lotId) throw new Error('Missing communityId/lotId on linkedLot');

    const res = await fetch(`/api/communities/${communityId}/lots/${lotId}`);
    if (!res.ok) throw new Error(await res.text());
    const srvLot = await res.json();

    listInput.value  = readMoney(srvLot.listPrice);
    salesInput.value = readMoney(srvLot.salesPrice);
    dateInput.value  = readDate(srvLot.salesDate);
  } catch (e) {
    console.warn('Community lot hydrate fallback → contact.linkedLot:', e?.message || e);
    listInput.value  = readMoney(lot.listPrice);
    salesInput.value = readMoney(lot.salesPrice);
    dateInput.value  = readDate(lot.salesDate ?? lot.saleDate);
  }
}
await hydrateFromCommunityLot();

// 4) Debounced save back to Community lot (true source of truth)
function debounce(fn, ms = 400) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

const saveLotFields = debounce(async () => {
  if (!communityId || !lotId) return; // can't save without IDs

  const payload = {
    listPrice:  listInput.value  ? String(listInput.value)  : '',
    salesPrice: salesInput.value ? String(salesInput.value) : '',
    salesDate:  dateInput.value  ? new Date(dateInput.value).toISOString() : null
  };

  try {
    const res = await fetch(`/api/communities/${communityId}/lots/${lotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    // mirror locally so the card stays in sync
    lot.listPrice  = payload.listPrice;
    lot.salesPrice = payload.salesPrice;
    lot.salesDate  = payload.salesDate;
  } catch (err) {
    console.error('Failed to save lot fields', err);
    alert('Could not save lot fields.');
  }
}, 500);

// 5) Wire up input events
[listInput, salesInput, dateInput].forEach(el => {
  el?.addEventListener('input',  saveLotFields);
  el?.addEventListener('change', saveLotFields);
});
}

  const statusSelect = document.getElementById('status');
  statusSelect.dispatchEvent(new Event('change'));
  updateStatusBackground();

  if (Array.isArray(contact.lenders) && contact.lenders.length > 0) {
    window.allowAutoSave = true;
  }
}

function renderLenderContactInfo(entry) {
  if (!entry?.lender) return;
  const lender = entry.lender;

  document.getElementById('lender-firstName').value  = lender.firstName  || '';
  document.getElementById('lender-lastName').value   = lender.lastName   || '';
  document.getElementById('lender-email').value      = lender.email      || '';
  document.getElementById('lender-phone').value      = lender.phone      || '';
  document.getElementById('lender-brokerage').value  = lender.brokerage  || '';

  document.getElementById('lender-info-fields').style.display = 'block';
}

function createLenderCard(entry, index) {
  const lender = entry.lender;
  if (!lender) return document.createTextNode(`Lender #${index + 1} is missing data`);

  const container = document.createElement('div');
  container.className = 'lender-card';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-lender-btn';
  removeBtn.dataset.entryId = entry._id;
  removeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>
  `;
  removeBtn.addEventListener('click', async () => {
    if (!confirm('Remove this lender?')) return;
    await fetch(`/api/contacts/${contactId}/lenders/${entry._id}`, { method: 'DELETE' });
    loadContact(); // or however you refresh the list
  });

  // 3) Prepend it so it sits in the top-right
  container.prepend(removeBtn);
  

 container.insertAdjacentHTML('beforeend',`
    <div><strong>${lender.firstName} ${lender.lastName}</strong></div>
    <div>Email: ${lender.email || '—'}</div>
    <div>Phone: ${lender.phone || '—'}</div>
    <div>Brokerage: ${lender.brokerage || lender.lenderBrokerage || '—'}</div>

    <label class="primary-label">
      <input
        type="radio"
        name="primaryLender"
        value="${entry._id}"
        ${entry.isPrimary ? 'checked' : ''}
        class="no-auto"
      />
       <span>Primary Lender</span>
    </label>

   <label>Status:
      <select class="lender-status no-auto">
        <option value="">-- Select Status --</option>
        <option${entry.status==='invite'?' selected':''} value="invite">Invite</option>
        <option${entry.status==='submittedapplication'?' selected':''} value="submittedapplication">Submitted Application</option>
        <option${entry.status==='subdocs'?' selected':''}         value="subdocs">Submitted Docs</option>
        <option${entry.status==='missingdocs'?' selected':''}     value="missingdocs">Missing Docs</option>
        <option${entry.status==='approved'?' selected':''}        value="approved">Approved</option>
        <option${entry.status==='cannotqualify'?' selected':''}    value="cannotqualify">Cannot Qualify</option>
      </select>
    </label>

    <label>Invite Date:
      <input type="date" class="lender-invite-date no-auto"
        value="${entry.inviteDate?.split('T')[0]||''}" />
    </label>
    <label>Approved Date:
      <input type="date" class="lender-approved-date no-auto"
        value="${entry.approvedDate?.split('T')[0]||''}" />
    </label>

    <button type="button" class="save-lender-btn">Save</button>
  `);

  
   // grab the controls into local variables
  const statusSelect   = container.querySelector('.lender-status');
  const inviteInput    = container.querySelector('.lender-invite-date');
  const approvedInput  = container.querySelector('.lender-approved-date');
  const primaryInput   = container.querySelector(`input[name="primaryLender"][value="${entry._id}"]`);


   // populate status dropdown
  container.querySelector('.lender-status').value = entry.status || '';
  statusSelect.value = entry.status || '';
  // populate date inputs (YYYY-MM-DD only)
  inviteInput.value   = entry.inviteDate   ? entry.inviteDate.split('T')[0]   : '';
  approvedInput.value = entry.approvedDate ? entry.approvedDate.split('T')[0] : '';

  if (entry.isPrimary) primaryInput.checked = true;

container.querySelector('.save-lender-btn').addEventListener('click', async () => {
  // 1) Read the current UI values
  const isPrimary   = primaryInput.checked;
  const status      = statusSelect.value;
  const inviteDate  = inviteInput.value;    // YYYY-MM-DD
  const approvedDate= approvedInput.value;  // YYYY-MM-DD

  // 2) Build your payload
  const payload = { 
    isPrimary,
    status,
    inviteDate,
    approvedDate
  };

  const contactId = getContactId();
  if (!contactId) {
    alert('Missing contact ID — cannot save lender info.');
    return;
  }

  try {
    console.log('⏳ Saving lender payload:', payload);
    // 3) Send it off
    const res = await fetch(
      `/api/contacts/${contactId}/lenders/${entry._id}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const updatedEntry = await res.json();
    console.log('✅ Server returned:', updatedEntry);

    // 4) Update your in-memory entry so future edits start from the new state
    entry.isPrimary    = updatedEntry.isPrimary;
    entry.status       = updatedEntry.status;
    entry.inviteDate   = updatedEntry.inviteDate;
    entry.approvedDate = updatedEntry.approvedDate;
    console.log('✅ Server returned:', updatedEntry);

    alert('Lender info updated!');
    loadContact();

    // 5) Live‐update your summary snippet
    const statusBox = document.querySelector('.all-status-cont');
    const snippets  = statusBox.querySelectorAll('.lender-snippet');
    const displayDate = status === 'approved'
      ? approvedDate
      : inviteDate;

    if (snippets[index]) {
      snippets[index].innerHTML = `
        <strong>${lender.firstName} ${lender.lastName}</strong><br/>
        ${status.charAt(0).toUpperCase()+status.slice(1)}: 
        <span>${displayDate || '—'}</span>
      `;
    }
  } catch (err) {
    console.error('Failed to update lender:', err);
    alert('Error saving lender data');
  }
});


container.querySelector('.remove-lender-btn').addEventListener('click', async () => {
  const confirmDelete = confirm(`Remove lender "${lender.firstName} ${lender.lastName}"?`);
  if (!confirmDelete) return;

  const contactId = getContactId();
  if (!contactId) {
    alert('Missing contact ID — cannot remove lender.');
    return;
  }

  const res = await fetch(`/api/contacts/${contactId}/lenders/${entry._id}`, {
    method: 'DELETE'
  });

  if (res.ok) {
    alert('Lender removed');
    loadContact(); // ✅ Just reload data — no page navigation
  } else {
    alert('Failed to remove lender');
    console.error(await res.text());
  }

  });

  return container;
}

// collapse/open the “More Details” panel
const panel = document.getElementById('more-info-panel');
const toggle = document.getElementById('more-info-toggle');
toggle.addEventListener('click', () => {
  panel.classList.toggle('open');
});