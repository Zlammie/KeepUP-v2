/*

// contactLoader.js — rewritten clean version
// Goals:
// - Load contact data and hydrate all fields
// - Robustly hydrate + save linked lot (list price, sales price, sales date)
// - Render lender summary cards and individual lender controls
// - Avoid duplicate declarations and undefined refs
// - Guard optional integrations (auto-save listeners, searches, comments) if present

// ---------- Small utilities ----------

  // ---------- UI: community change loads floorplans ----------
  



  // ---------- Top summary row ----------
  function updateTopBarSummary() {
    // Text fields
    const lt = document.getElementById('lotLineUp');  if (document.getElementById('summary-lotLineUp')) document.getElementById('summary-lotLineUp').textContent = lt?.value || '—';
    const bt = document.getElementById('buyTime');    if (document.getElementById('summary-buyTime'))   document.getElementById('summary-buyTime').textContent   = bt?.value || '—';
    const bm = document.getElementById('buyMonth');   if (document.getElementById('summary-buyMonth'))  document.getElementById('summary-buyMonth').textContent  = bm?.value || '—';

    // Facing
    const facing = Array.from(document.querySelectorAll('input[name="facing"]:checked')).map(cb => cb.value);
    if (document.getElementById('summary-facing')) document.getElementById('summary-facing').textContent = facing.length ? facing.join(', ') : '—';

    // Floorplans (labels of checked boxes)
    const plans = Array.from(document.querySelectorAll('#floorplans-container input:checked'))
      .map(cb => cb.closest('label')?.innerText.trim()).filter(Boolean);
    if (document.getElementById('summary-floorplans')) document.getElementById('summary-floorplans').textContent = plans.length ? plans.join(', ') : '—';

    // Living
    const living = [];
    if (document.getElementById('investor')?.checked)         living.push('Investor');
    if (document.getElementById('renting')?.checked)          living.push('Renting');
    if (document.getElementById('own-selling')?.checked)      living.push('Own & Selling');
    if (document.getElementById('own-not-selling')?.checked)  living.push('Own & Not Selling');
    if (document.getElementById('summary-living')) document.getElementById('summary-living').textContent = living.length ? living.join(', ') : '—';
  }
  window.updateTopBarSummary = updateTopBarSummary;

  // Show lot-link UI when purchased; otherwise show community UI
function togglePurchasedSections(isPurchased) {
  // be flexible with your existing IDs/classes
  const communityBox = document.querySelector(
    '#community-section, #community-section-container, .community-section'
  );
  const lotLink = document.getElementById('lot-link-container');
  const linkedCard = document.getElementById('linked-lot-display');
  const purchasedSelector = document.getElementById('purchased-community-selector');

  if (isPurchased) {
    if (communityBox) communityBox.style.display = 'none';
    if (lotLink) lotLink.style.display = 'block';
    if (linkedCard) linkedCard.style.display = 'block';
    if (purchasedSelector) purchasedSelector.style.display = 'block';
  } else {
    if (communityBox) communityBox.style.display = '';
    if (lotLink) lotLink.style.display = 'none';
    if (linkedCard) linkedCard.style.display = 'none';
    if (purchasedSelector) purchasedSelector.style.display = 'none';
  }
}

  // ---------- Main loader ----------
  

    // Contact full name
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const nameEl = document.getElementById('contact-full-name');
    if (nameEl) nameEl.textContent = fullName || 'Unnamed Contact';

    // Status badge (top right)
    (function statusBadgeSync(){
      const badge = document.getElementById('contact-status-badge');
      const statusSelect = document.getElementById('status');
      if (!badge || !statusSelect) return;

      const format = (window.formatStatusLabel)
        ? window.formatStatusLabel
        : (s) => String(s || '').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g,c=>c.toUpperCase());

      const normalize = s => String(s||'').trim().toLowerCase().replace(/[_\s]+/g,'-');

      function apply(val){
        const key = normalize(val);
        badge.className = `status-badge ${key}`;
        const bg = (window.statusBackgrounds && window.statusBackgrounds[key]) || STATUS_BG[key];
        if (bg) {
          badge.style.backgroundColor = bg;
          badge.style.color = (key === 'cold' || key === 'negotiating') ? '#000' : '#fff';
        } else {
          badge.style.backgroundColor = '';
          badge.style.color = '';
        }
        badge.textContent = format(val);
      }

      // initial + change
      statusSelect.value = contact.status || statusSelect.value || 'new';
      apply(statusSelect.value);
      statusSelect.addEventListener('change', () => apply(statusSelect.value));
    })();

   
    // Realtor hydrate if provided
    if (contact.realtor?._id && typeof fillRealtorFields === 'function') {
      window.updatedContactRealtorId = contact.realtor._id;
      fillRealtorFields(contact.realtor);
    }

    // Populate base contact fields
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v ?? ''); };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

    setVal('firstName', contact.firstName);
    setVal('lastName',  contact.lastName);
    setVal('email',     contact.email);
    setVal('phone',     contact.phone);
    setVal('status',    contact.status);
    setVal('source',    contact.source);
    setVal('owner',     contact.owner);
    setVal('visit-date', contact.visitDate);
    setVal('lotLineUp',  contact.lotLineUp);
    setVal('buyTime',    contact.buyTime);
    setVal('buyMonth',   contact.buyMonth);

    // Facing checkboxes
    document.querySelectorAll('input[name="facing"]').forEach(cb => {
      cb.checked = Array.isArray(contact.facing) && contact.facing.includes(cb.value);
    });

    // Living
    setChk('investor',           contact.investor);
    setChk('renting',            contact.renting);
    setChk('own-selling',        contact.ownSelling);
    setChk('own-not-selling',    contact.ownNotSelling);

    // Linked Lot card (with prices + date inputs)
    if (contact.linkedLot?.jobNumber) {
      const lot = contact.linkedLot;
      const display = document.getElementById('linked-lot-display');
      if (display) {
        display.innerHTML = `
          <div class="linked-lot-card linked-lot-grid">
            <div class="lot-address" role="heading" aria-level="3"><span>${safe(lot.address)}</span></div>
            <div class="lot-chip-row">
              <div class="lot-chip"><strong>Job #:</strong> ${lot.jobNumber || '—'}</div>
              <div class="lot-chip"><strong>Lot:</strong> ${lot.lot || '—'} / ${lot.block || '—'}</div>
              <div class="lot-chip plan-chip"><strong>Plan & Elev:</strong> ${(lot.plan || lot.planName || '—')}${lot.elevation ? ' – ' + lot.elevation : ''}</div>
            </div>
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
            <section class="lot-box build-box">
              <div><strong>Build Status:</strong> ${safe(lot.buildStatus)}</div>
              <div><strong>Release Date:</strong> ${fmtDate(lot.releaseDate)}</div>
              <div><strong>Projected Completion:</strong> ${fmtDate(lot.projectedCompletion || lot.projectedCompletionDate)}</div>
            </section>
            <section class="lot-box close-box">
              <div><strong>Close Month:</strong> ${safe(lot.closeMonth)}</div>
              <div><strong>Lender Close Status:</strong> ${safe(lot.lenderCloseStatus)}</div>
              <div><strong>Close Date & Time:</strong> ${fmtDate(lot.closeDate)} ${lot.closeTime ?? ''}</div>
              <div><strong>3rd Party Date:</strong> ${fmtDate(lot.thirdPartyDate || lot.thirdPartyInspectionDate)}</div>
              <div><strong>1st Walk Date:</strong> ${fmtDate(lot.firstWalkDate)}</div>
              <div><strong>Final Sign Off Date:</strong> ${fmtDate(lot.finalSignOffDate)}</div>
            </section>
            <div class="lot-actions"><button id="unlink-lot-btn" type="button">Unlink Lot</button></div>
          </div>
        `;
        display.style.display = 'block';

        // Inputs
        const listInput  = document.getElementById('linked-list-price');
        const salesInput = document.getElementById('linked-sales-price');
        const dateInput  = document.getElementById('linked-sale-date');

        // IDs with dataset fallback
        let communityId = lot.communityId;
        let lotId       = lot.lotId;
        if ((!communityId || !lotId) && display.dataset) {
          communityId = communityId || display.dataset.communityId || null;
          lotId       = lotId       || display.dataset.lotId       || null;
        }



    // Allow autosave after lenders render
    if (Array.isArray(contact.lenders) && contact.lenders.length > 0) {
      window.allowAutoSave = true;
    }

    // Expand/collapse “More Details” panel (if present)
    const panel  = document.getElementById('more-info-panel');
    const toggle = document.getElementById('more-info-toggle');
    if (panel && toggle) {
      toggle.addEventListener('click', () => panel.classList.toggle('open'));
    }
  }
  window.loadContact = loadContact;

  
*/
    

