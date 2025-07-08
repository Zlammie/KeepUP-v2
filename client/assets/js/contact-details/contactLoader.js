

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
      'new': 'lightblue',
      'be-back': 'orange',
      'cold': 'lightgray',
      'target': 'plum',
      'possible': 'lightseagreen',
      'negotiating': 'khaki',
      'purchased': 'lightgreen',
      'closed': 'mediumseagreen',
      'not-interested': 'salmon',
      'deal-lost': 'crimson'
    };

    const bgColor = statusBackgrounds[rawStatus] || '#ccc';

    statusEl.textContent = rawStatus.replace(/-/g, ' ');
    statusEl.style.backgroundColor = bgColor;
    statusEl.style.color = (rawStatus === 'cold' || rawStatus === 'negotiating') ? '#000' : '#fff';
  }
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
      <strong>${lender.firstName} ${lender.lastName}</strong><br/>
      <strong>${lender.brokerage || lender.lenderBrokerage || '—'}</strong><br/>
      <span class="lender-status-badge ${rawStatus}">
        ${label}
      </span><br/>
      ${rawStatus === 'approved' ? 'Approved Date' : 'Invite Date'}:
      <span>${displayDate}</span>
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

  

  if (contact.linkedLot?.jobNumber) {
  const lot = contact.linkedLot;
  const display = document.getElementById('linked-lot-display');
  display.innerHTML = `
    <div>
      <strong>Lot Linked:</strong><br/>
      Job #: ${lot.jobNumber}<br/>
      Lot: ${lot.lot} | Block: ${lot.block}<br/>
      Address: ${lot.address}<br/>
      <button id="unlink-lot-btn">Unlink Lot</button>
    </div>
  `;
  display.style.display = 'block';
  document.getElementById('lot-link-container').style.display = 'none';

  document.getElementById('unlink-lot-btn').addEventListener('click', async () => {
    const confirmDelete = confirm('Unlink this lot?');
    if (!confirmDelete) return;

    const res = await fetch(`/api/contacts/${window.contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedLot: null })
    });

    if (res.ok) {
      display.style.display = 'none';
      document.getElementById('lot-link-container').style.display = 'block';
    } else {
      alert('Failed to unlink lot');
    }
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
  container.style = 'border: 1px solid #ccc; padding: 10px; margin-bottom: 1em;';

  container.innerHTML = `
    <div><strong>${lender.firstName} ${lender.lastName}</strong></div>
    <div>Email: ${lender.email || '—'}</div>
    <div>Phone: ${lender.phone || '—'}</div>
    <div>Brokerage: ${lender.brokerage || lender.lenderBrokerage || '—'}</div>
    <label style="display:block; margin:0.5em 0;">
      <input
        type="radio"
        name="primaryLender"
        value="${entry._id}"
        ${entry.isPrimary ? 'checked' : ''}
        class="no-auto"
        />
        Primary
    </label>

    <label>Status:
      <select class="lender-status no-auto">
        <option value="">-- Select Status --</option>
        <option value="invite">Invite</option>
        <option value="submittedapplication">Submitted Application</option>
        <option value="subdocs">Submitted Docs</option>
        <option value="missingdocs">Missing Docs</option>
        <option value="approved">Approved</option>
        <option value="cannotqualify">Cannot Qualify</option>
      </select>
    </label>

    <label>Invite Date: <input type="date" class="lender-invite-date no-auto" /></label>
    <label>Approved Date: <input type="date" class="lender-approved-date no-auto" /></label>

   <button type="button" class="save-lender-btn">Save</button>
    <button type="button" class="remove-lender-btn" data-entry-id="${entry._id}" style="margin-left: 1em;">Remove</button>
  `;
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