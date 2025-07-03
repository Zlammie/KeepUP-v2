

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

  
});

});

async function populateCommunityDropdown(selectedId) {
  try {
    const res = await fetch('/api/communities');
    const communities = await res.json();

    const select = document.getElementById('community-select');
    if (!select) {
      console.error('Dropdown element #community-select not found');
      return;
    }

    select.innerHTML = '<option value="">-- Select Community --</option>';

    communities.forEach(comm => {
      const opt = document.createElement('option');
      opt.value = comm._id;
      opt.textContent = comm.name;
      if (comm._id === selectedId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    console.log('Community dropdown populated');
  } catch (err) {
    console.error('Failed to load communities:', err);
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
  statusBox.innerHTML = ''; // Clear existing cards

// Map raw enum keys → display labels
const statusLabels = {
  invite:         'Invite',
  submittedapplication: 'Submitted App',
  subdocs:        'Submitted Docs',
  missingdocs:    'Missing Docs',
  approved:       'Approved',
  cannotqualify:  'Cannot Qualify'
};

if (Array.isArray(contact.lenders) && contact.lenders.length > 0) {
  contact.lenders.forEach(entry => {
    const lender = entry.lender;
    if (!lender) return;

    // 1) Normalize and map to human label
    const rawStatus    = entry.status || 'invite';
    const displayLabel = statusLabels[rawStatus] || rawStatus;
    const statusClass  = rawStatus;  // for your CSS classes

    
     // 2) Format the date as MM/DD/YYYY
    const dateField = rawStatus === 'approved'
    ? entry.approvedDate
      : entry.inviteDate;
    let displayDate = '—';
    if (dateField) {
      // strip off the time, split into [YYYY,MM,DD]
      const [year, month, day] = dateField.split('T')[0].split('-');
      displayDate = `${month}/${day}/${year}`;
    }

    // 3) Create and style the snippet
    const snippet = document.createElement('div');
    snippet.className = 'lender-snippet';
    snippet.style = `
      background: #f9f9f9;
      border: 1px solid #ccc;
      padding: 8px;
      margin-bottom: 0.5em;
      border-radius: 6px;
    `;

    snippet.innerHTML = `
      <strong>${lender.firstName} ${lender.lastName}</strong><br/>
      <strong>${lender.brokerage || lender.lenderBrokerage || '—'}</strong><br/>
      <span class="lender-status-badge ${statusClass}">
        ${displayLabel}
      </span><br/>
      ${rawStatus === 'approved' ? 'Approved Date' : 'Invite Date'}:<br/>
      <span>${displayDate}</span>
    `;

    statusBox.appendChild(snippet);
      });
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
  console.log('communityId from contact:', contact.communityId);
  await populateCommunityDropdown(
  contact.communityId?._id || contact.communityId || ''
  );
  document.getElementById('visit-date').value   = contact.visitDate   || '';
  document.getElementById('lotLineUp').value    = contact.lotLineUp   || '';

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