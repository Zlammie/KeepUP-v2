// assets/js/contact-details/lotLink.js
import { DOM, refreshDOM } from './domCache.js';
import { getState, setLinkedLot } from './state.js';
import {
  debounce,
  parseCurrency,
  formatCurrency,
  readDate,
  fmtDate,
  safe
} from './utils.js';
import { refreshStatusUI } from './status.js';

let hydrateAbort;
let renderToken = 0;

// -----------------------------------------
// helpers
// -----------------------------------------
function extractIds(snapshot, mount) {
  const s = snapshot || {};
  const ds = (mount && mount.dataset) || {};
  const communityId =
    ds.communityId ||
    s.communityId ||
    (s.community && (s.community._id || s.community)) ||
    null;

  const lotId =
    ds.lotId ||
    s.lotId ||
    (s.lot && (s.lot._id || s.lot)) ||
    s._id ||
    null;

  return {
    communityId: communityId ? String(communityId) : null,
    lotId:       lotId ? String(lotId) : null,
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (value ?? '—').toString();
}

function planLabelFrom(lot) {
  // After populate, floorPlan is an object { name, planNumber }; legacy may be a string.
  if (!lot) return '';
  const fp = lot.floorPlan;
  if (fp && typeof fp === 'object') return fp.name || fp.planNumber || fp.title || fp.code || '';
  if (typeof fp === 'string') return fp; // legacy import stored string
  if (lot.floorPlanName) return lot.floorPlanName;
  return '';
}


async function recoverLinkedLotFromServer() {
  try {
    const { contactId } = getState() || {};
    if (!contactId) return false;

    const r = await fetch(`/api/communities/lot-by-purchaser/${contactId}`);
    if (!r.ok) return false;
    const data = await r.json();
    if (!data?.found) return false;

    // Minimal snapshot for immediate render
    const lot = data.lot || {};
    setLinkedLot({
      communityId: String(data.communityId),
      lotId: String(lot._id),
      address: lot.address,
      jobNumber: lot.jobNumber,
      lot: lot.lot,
      block: lot.block,
      elevation: lot.elevation,
      floorPlan: lot.floorPlan || null,
      floorPlanName: lot.floorPlanName || '',
      status: lot.status || null,
      generalStatus: lot.generalStatus || null
    });
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------
// public API
// -----------------------------------------
export function initLotLinking() {
  renderFromState();
}

export function renderFromState() {
  const { linkedLot } = getState();
  const mount = DOM.linkedLotDisplay;
  if (!mount) return;

  if (!linkedLot) {
    mount.innerHTML = '';
    mount.style.display = 'none';
    delete mount.dataset.communityId;
    delete mount.dataset.lotId;

    recoverLinkedLotFromServer()
      .then((recovered) => {
        if (recovered) {
          renderFromState();    // now state has linkedLot
        } else {
          refreshStatusUI();    // show search UI
        }
      })
      .catch(() => refreshStatusUI());
    return;
  }

  // initial card from snapshot
  mount.innerHTML = linkedLotCardHTML(linkedLot);
  mount.style.display = 'block';

  const { communityId, lotId } = extractIds(linkedLot, mount);
  if (communityId) mount.dataset.communityId = communityId;
  if (lotId)       mount.dataset.lotId       = lotId;

  refreshDOM();                // inputs now exist
  hydrateCommunityLotAndBind(linkedLot); // fetch + fill
  attachUnlinkHandler();
  refreshStatusUI();           // hide search UI while card visible
}

// -----------------------------------------
// rendering
// -----------------------------------------
function linkedLotCardHTML(lot) {
  const placeholder = 'N/A';
  const plan = planLabelFrom(lot);
  const elev = lot?.elevation || '';
  const planElev = plan && elev ? `${plan} - ${elev}` : (plan || elev || placeholder);
  const jobNumber = lot?.jobNumber ? lot.jobNumber : placeholder;
  const lotNumber = lot?.lot ? lot.lot : placeholder;
  const blockNumber = lot?.block ? lot.block : placeholder;
  const generalStatus = lot?.generalStatus || lot?.status || placeholder;

  return `
     <!-- Make the OUTER card the ONLY grid container -->
    <div class="linked-lot-card linked-lot-grid">
      <!-- Keep the lot-address class so CSS grid-area applies -->
      <div class="lot-address lot-address-row">
        <div class="lot-address-main">${safe(lot.address)}</div>
        <div class="lot-build-status">
          <strong>General Status:</strong> <span id="linked-build-status">${safe(generalStatus)}</span>
        </div>
      </div>
      <div class="lot-chip-row">
        <div class="lot-chip"><strong>Job #:</strong> ${jobNumber}</div>
        <div class="lot-chip"><strong>Lot:</strong> ${lotNumber} / ${blockNumber}</div>
        <div class="lot-chip plan-chip"><strong>Plan & Elev:</strong> <span id="linked-plan-elev">${planElev}</span></div>
      </div>

      <section class="lot-box prices-box left-col">
        <div class="form-pair">
          <label for="linked-list-price"><strong>List Price:</strong></label>
          <input type="text" id="linked-list-price" placeholder="$435,000" inputmode="decimal" autocomplete="off" />
        </div>
        <div class="form-pair">
          <label for="linked-sales-price"><strong>Sales Price:</strong></label>
          <input type="text" id="linked-sales-price" placeholder="$425,000" inputmode="decimal" autocomplete="off" />
        </div>
        <div class="form-pair">
          <label for="linked-sale-date"><strong>Sales Date:</strong></label>
          <input type="date" id="linked-sale-date" />
        </div>
      </section>

      <section class="lot-box build-box left-col">
        <div class="form-pair">
          <label><strong>Release Date:</strong></label>
          <span id="linked-release-date">${fmtDate(lot.releaseDate)}</span>
        </div>
        <div class="form-pair">
          <label><strong>Projected Completion:</strong></label>
          <span id="linked-projected-completion">${fmtDate(lot.expectedCompletionDate)}</span>
        </div>
      </section>

      <section class="lot-box close-box left-col">
        <div class="form-pair">
          <label><strong>Close Month:</strong></label>
          <span id="linked-close-month">${safe(lot.closeMonth)}</span>
        </div>

        <div class="form-pair">
          <label><strong>Lender Close Status:</strong></label>
          <span id="linked-lender-close-status">${safe(lot.lender)}</span>
        </div>

        <div class="form-pair">
          <label><strong>Close Date:</strong></label>
          <span id="linked-close-date">${fmtDate(lot.closeDateTime)}</span>
        </div>

        <div class="form-pair">
          <label><strong>Close Time:</strong></label>
          <span id="linked-close-time"></span>
        </div>

        <hr class="lot-sep" />

        <div class="form-pair">
          <label><strong>3rd Party Date:</strong></label>
          <span id="linked-third-party-date">${fmtDate(lot.thirdParty)}</span>
        </div>

        <div class="form-pair">
          <label><strong>1st Walk Date:</strong></label>
          <span id="linked-first-walk-date">${fmtDate(lot.firstWalk)}</span>
        </div>

        <div class="form-pair">
          <label><strong>Final Sign Off Date:</strong></label>
          <span id="linked-final-signoff-date">${fmtDate(lot.finalSignOff)}</span>
        </div>
      </section>

      <div class="lot-actions"><button id="unlink-lot-btn" type="button">Unlink Lot</button></div>
    </div>
  `;
}

// -----------------------------------------
// hydrate + bind
// -----------------------------------------
async function hydrateCommunityLotAndBind(lotSnapshot) {
  hydrateAbort?.abort();
  hydrateAbort = new AbortController();
  const token = ++renderToken;

  const listInput  = document.getElementById('linked-list-price');
  const salesInput = document.getElementById('linked-sales-price');
  const dateInput  = document.getElementById('linked-sale-date');
  if (!listInput || !salesInput || !dateInput) return;

  const displayCurrency = (value) => {
    const formatted = formatCurrency(value);
    if (formatted) return formatted;
    if (value == null || value === '') return '';
    return String(value);
  };
  const applyCurrencyValue = (input, value) => {
    if (!input) return;
    input.value = displayCurrency(value);
  };
  const setupCurrencyInput = (input) => {
    if (!input || input.dataset.currencySetup === '1') return;
    input.dataset.currencySetup = '1';
    input.addEventListener('focus', () => {
      const numeric = parseCurrency(input.value);
      input.value = numeric == null ? '' : numeric.toString();
      if (typeof input.select === 'function') {
        requestAnimationFrame(() => input.select());
      }
    });
    input.addEventListener('blur', () => {
      input.value = displayCurrency(input.value);
    });
    input.value = displayCurrency(input.value);
  };

  const mount = DOM.linkedLotDisplay;
  let { communityId, lotId } = extractIds(lotSnapshot, mount);

  // Fallback: ask backend for ids by purchaser if missing
  if (!communityId || !lotId) {
    try {
      const { contactId } = getState();
      if (contactId) {
        const res = await fetch(`/api/communities/lot-by-purchaser/${contactId}`, { signal: hydrateAbort.signal });
        if (res.ok) {
          const data = await res.json();
          if (data?.found) {
            communityId = String(data.communityId);
            lotId = String(data.lot?._id || data.lotId);
            if (DOM.linkedLotDisplay) {
              DOM.linkedLotDisplay.dataset.communityId = communityId;
              DOM.linkedLotDisplay.dataset.lotId = lotId;
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  try {
    if (!communityId || !lotId) throw new Error('Missing communityId/lotId on linkedLot');

    const res = await fetch(`/api/communities/${communityId}/lots/${lotId}`, { signal: hydrateAbort.signal });
    if (!res.ok) throw new Error(await res.text());
    const srvLot = await res.json();
    if (token !== renderToken) return;

    // --- prices + sales date ---
    applyCurrencyValue(listInput, srvLot.listPrice ?? lotSnapshot.listPrice ?? '');
    applyCurrencyValue(salesInput, srvLot.salesPrice ?? lotSnapshot.salesPrice ?? '');
    setupCurrencyInput(listInput);
    setupCurrencyInput(salesInput);
    dateInput.value  = readDate(srvLot.salesDate);

    // --- build / schedule ---
    const statusLabel = srvLot.generalStatus || srvLot.status || 'N/A';
    setText('linked-build-status', statusLabel);
    setText('linked-release-date', fmtDate(srvLot.releaseDate));
    setText('linked-projected-completion', fmtDate(srvLot.expectedCompletionDate));

    // --- close / lender / walks ---
    setText('linked-close-month', srvLot.closeMonth || '—');
    setText('linked-lender-close-status', srvLot.lender || '—');
    // closeDateTime may include date+time; split if possible
    if (srvLot.closeDateTime) {
      const s = String(srvLot.closeDateTime);
      const [d, t] = s.includes('T') ? s.split('T') : s.split(/\s+/);
      setText('linked-close-date', fmtDate(d || srvLot.closeDateTime));
      setText('linked-close-time', (t || '').trim());
    } else {
      setText('linked-close-date', fmtDate(null));
      setText('linked-close-time', '');
    }
    setText('linked-third-party-date', fmtDate(srvLot.thirdParty));
    setText('linked-first-walk-date',  fmtDate(srvLot.firstWalk));
    setText('linked-final-signoff-date', fmtDate(srvLot.finalSignOff));

    // --- plan & elevation ---
    const plan = planLabelFrom(srvLot) || planLabelFrom(lotSnapshot);
    const elev = srvLot.elevation || lotSnapshot.elevation || '';
    const planElev = plan && elev ? `${plan} - ${elev}` : (plan || elev || 'N/A');
    setText('linked-plan-elev', planElev);

  } catch (e) {
    if (e.name !== 'AbortError') {
      if (token !== renderToken) return;
      // Snapshot-only fallback (uses your canonical names where possible)
      applyCurrencyValue(listInput, lotSnapshot.listPrice ?? '');
      applyCurrencyValue(salesInput, lotSnapshot.salesPrice ?? '');
      setupCurrencyInput(listInput);
      setupCurrencyInput(salesInput);
      dateInput.value  = readDate(lotSnapshot.salesDate);
      const fallbackStatus = lotSnapshot.generalStatus || lotSnapshot.status || 'N/A';
      setText('linked-build-status', fallbackStatus);
      setText('linked-release-date', fmtDate(lotSnapshot.releaseDate));
      setText('linked-projected-completion', fmtDate(lotSnapshot.expectedCompletionDate));

      setText('linked-close-month', lotSnapshot.closeMonth ?? '—');
      setText('linked-lender-close-status', lotSnapshot.lender ?? '—');
      if (lotSnapshot.closeDateTime) {
        const s = String(lotSnapshot.closeDateTime);
        const [d, t] = s.includes('T') ? s.split('T') : s.split(/\s+/);
        setText('linked-close-date', fmtDate(d || lotSnapshot.closeDateTime));
        setText('linked-close-time', (t || '').trim());
      } else {
        setText('linked-close-date', fmtDate(null));
        setText('linked-close-time', '');
      }
      setText('linked-third-party-date', fmtDate(lotSnapshot.thirdParty));
      setText('linked-first-walk-date',  fmtDate(lotSnapshot.firstWalk));
      setText('linked-final-signoff-date', fmtDate(lotSnapshot.finalSignOff));

      const plan = planLabelFrom(lotSnapshot);
      const elev = lotSnapshot.elevation || '';
      setText('linked-plan-elev', plan && elev ? `${plan} - ${elev}` : (plan || elev || 'N/A'));
      console.warn('Lot hydrate fallback to contact.linkedLot:', e?.message || e);
    }
  }

  // --- SAVE (debounced, only if changed) ---
  const initial = {
    listPrice:  parseCurrency(listInput.value),
    salesPrice: parseCurrency(salesInput.value),
    salesDate:  dateInput.value ? new Date(dateInput.value).toISOString() : null
  };

  const saveLotFields = debounce(async () => {
    const ds = DOM.linkedLotDisplay?.dataset || {};
    const cid = ds.communityId || communityId;
    const lid = ds.lotId || lotId;
    if (!cid || !lid) return;

    const next = {
      listPrice:  parseCurrency(listInput.value),
      salesPrice: parseCurrency(salesInput.value),
      salesDate:  dateInput.value ? new Date(dateInput.value).toISOString() : null
    };

    const payload = {};
    if (next.listPrice !== initial.listPrice)   payload.listPrice  = next.listPrice;
    if (next.salesPrice !== initial.salesPrice) payload.salesPrice = next.salesPrice;
    if (next.salesDate !== initial.salesDate)   payload.salesDate  = next.salesDate;
    if (!Object.keys(payload).length) return;

    try {
      const res = await fetch(`/api/communities/${cid}/lots/${lid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());

      // update local baseline
      const lot = getState().linkedLot || lotSnapshot;
      if ('listPrice'  in payload) lot.listPrice  = payload.listPrice;
      if ('salesPrice' in payload) lot.salesPrice = payload.salesPrice;
      if ('salesDate'  in payload) lot.salesDate  = payload.salesDate;
      initial.listPrice  = next.listPrice;
      initial.salesPrice = next.salesPrice;
      initial.salesDate  = next.salesDate;
    } catch (err) {
      console.error('Failed to save lot fields', err);
      alert('Could not save lot fields.');
    }
  }, 500);

  [listInput, salesInput, dateInput].forEach(el => {
    el.addEventListener('input',  saveLotFields);
    el.addEventListener('change', saveLotFields);
  });
}

// -----------------------------------------
// unlink
// -----------------------------------------
function attachUnlinkHandler() {
  const btn = document.getElementById('unlink-lot-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      // Use the mounted ids (set when we rendered the card)
     const ds  = DOM.linkedLotDisplay?.dataset || {};
      const cid = ds.communityId;
      const lid = ds.lotId;
      if (!cid || !lid) throw new Error('Missing communityId/lotId on unlink');

      // Unlink purchaser from this lot
      const res = await fetch(`/api/communities/${cid}/lots/${lid}/purchaser`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      setLinkedLot(null);  // local state → no linked lot

      if (DOM.linkedLotDisplay) {
        DOM.linkedLotDisplay.innerHTML = '';
        DOM.linkedLotDisplay.style.display = 'none';
        delete DOM.linkedLotDisplay.dataset.communityId;
        delete DOM.linkedLotDisplay.dataset.lotId;
      }
      refreshStatusUI();
    } catch (e) {
      console.error('Failed to unlink lot', e);
      alert('Could not unlink lot.');
    }
  });
}
