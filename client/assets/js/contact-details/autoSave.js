

// autoSave.js
window.allowAutoSave = false;
// 1) Timer handle for debouncing saves
let saveTimeout;

// 2) Main auto‐save logic
async function autoSaveContact() {


  clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    const payload = {
      firstName:   document.getElementById('firstName').value,
      lastName:    document.getElementById('lastName').value,
      email:       document.getElementById('email').value,
      phone:       document.getElementById('phone').value,
      status:      document.getElementById('status').value,
      source:      document.getElementById('source').value,
      investor:    document.getElementById('investor').checked,
      owner:       document.getElementById('owner').value,
      communityId: document.getElementById('community-select').value,
      floorplans: Array.from(
      document.querySelectorAll('input[name="floorplans"]:checked')
      ).map(cb => cb.value),
      visitDate:   document.getElementById('visit-date').value,
      lotLineUp:   document.getElementById('lotLineUp').value,
      buyTime:     document.getElementById('buyTime').value,
      buyMonth:    document.getElementById('buyMonth').value,
      facing:      Array.from(
                      document.querySelectorAll('input[name="facing"]:checked')
                    ).map(cb => cb.value),
      renting:     document.getElementById('renting').checked,
      ownSelling:  document.getElementById('own-selling').checked,
      ownNotSelling: document.getElementById('own-not-selling').checked,
      realtor:     window.updatedContactRealtorId || null,
    };

      const contactId = getContactId();
      console.log('Auto-save payload for', contactId, payload);

      try {
        if (!contactId) {
          console.error('[AutoSave] No contact ID available — aborting save.');
          return;
        }

        const res = await fetch(`/api/contacts/${contactId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(`Auto-save failed (${res.status}):`, data);
        } else {
          console.log('Auto-saved contact:', data);
        }
      } catch (err) {
        console.error('Auto-save network error:', err);
      }
  }, 500);
}


// 3) Attach the change listeners to your inputs/selects
function setupAutoSaveListeners() {
 if (!getContactId()) {
  console.error('No contact ID — auto-save disabled.');
    return;
  }
  const inputs = document.querySelectorAll(
    '#contactForm input:not(.no-auto), #contactForm select:not(.no-auto), .realtor-container input'
  );

  inputs.forEach(input => input.addEventListener('change', autoSaveContact));
}

// 4) Expose so your loader can call it when ready
window.setupAutoSaveListeners = setupAutoSaveListeners;

// ===== Lot Sales Auto-Save (salesDate, salesPrice) =====
let lotSalesSaveTimeout = null;
const LOT_SALES_DEBOUNCE_MS = 500;

// Context for the currently linked lot.
// We'll set these from your "link lot" success code.
let linkedLotCtx = { communityId: null, lotId: null };

// Expose a setter so your link logic can tell us the current lot.
window.setLinkedLotContext = function (communityId, lotId) {
  linkedLotCtx.communityId = communityId || null;
  linkedLotCtx.lotId = lotId || null;

  // Optional: also store on the DOM for visibility/other scripts
  const box = document.getElementById('linked-lot-display');
  if (box) {
    if (communityId) box.dataset.communityId = communityId;
    if (lotId)       box.dataset.lotId = lotId;
    box.style.display = 'block';
  }
};

// Build payload respecting your schema types
function buildLotSalesPayload() {
  const dateEl  = document.getElementById('sale-date');
  const priceEl = document.getElementById('sale-price');
  if (!dateEl || !priceEl) return null;

  const salesDateVal  = dateEl.value;      // 'YYYY-MM-DD' from <input type="date">
  const salesPriceVal = (priceEl.value ?? '').toString().trim() || null;

  return {
    // Your schema is Date; a 'YYYY-MM-DD' string will be cast by Mongoose.
    // If you prefer to send a Date object, do: salesDate: salesDateVal ? new Date(salesDateVal) : null
    salesDate:  salesDateVal || null,
    salesPrice: salesPriceVal
  };
}

async function autoSaveLotSales() {
  clearTimeout(lotSalesSaveTimeout);
  lotSalesSaveTimeout = setTimeout(async () => {
    const { communityId, lotId } = linkedLotCtx;
    if (!communityId || !lotId) return; // no linked lot yet; do nothing

    const payload = buildLotSalesPayload();
    if (!payload) return;

    try {
      const res = await fetch(`/api/communities/${communityId}/lots/${lotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[Lot AutoSave] Failed:', res.status, err);
        return;
      }
      const updatedLot = await res.json();
      // Optional: reflect values in the linked-lot panel
      const box = document.getElementById('linked-lot-display');
      if (box) {
        box.innerHTML = `
          <div class="linked-lot-card">
            <strong>Linked Lot:</strong> ${updatedLot.address ?? '—'}<br/>
            <strong>Job #:</strong> ${updatedLot.jobNumber ?? '—'}<br/>
            <strong>Sales Date:</strong> ${updatedLot.salesDate ? new Date(updatedLot.salesDate).toLocaleDateString() : '—'}<br/>
            <strong>Sales Price:</strong> ${updatedLot.salesPrice ? Number(updatedLot.salesPrice).toLocaleString() : '—'}
          </div>
        `;
      }
    } catch (e) {
      console.error('[Lot AutoSave] Network error:', e);
    }
  }, LOT_SALES_DEBOUNCE_MS);
}

// Attach listeners for sales inputs (safe to call any time)
function setupLotSalesAutoSaveListeners() {
  const dateEl  = document.getElementById('sale-date');
  const priceEl = document.getElementById('sale-price');
  if (!dateEl || !priceEl) return;

  dateEl.addEventListener('input', autoSaveLotSales);
  priceEl.addEventListener('input', autoSaveLotSales);
}

// Expose to the page (call this once the contact-details page finishes rendering)
window.setupLotSalesAutoSaveListeners = setupLotSalesAutoSaveListeners;

