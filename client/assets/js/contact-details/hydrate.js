// assets/js/contact-details/hydrate.js
import { getState } from './state.js';
import { DOM, refreshDOM } from './domCache.js';
import { refreshStatusUI } from './status.js';
import { populateCommunities } from './communitySection.js';
import { fillRealtorFields, updateRealtorDisplay } from './realtorSearch.js';
import * as api from './api.js';
import { formatPhoneDisplay } from '../shared/phone.js';

let summaryListenersBound = false;

function populateBaseFields(contact) {
  setInputValue('firstName', contact?.firstName);
  setInputValue('lastName',  contact?.lastName);
  setInputValue('email',     contact?.email);
  setInputValue('phone',     contact?.phone);

  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    phoneInput.value = formatPhoneDisplay(contact?.phone || '');
  }
  // add more when ready (e.g. 'source', etc.)
}


export async function hydrateAll() {
  const { contact } = getState();

  refreshDOM?.();

  // 1) Status field + purchased show/hide
  if (DOM.statusSelect && contact?.status) {
    DOM.statusSelect.value = contact.status;
  }
  refreshStatusUI();

  // ðŸ‘‰ NEW: base inputs
  populateBaseFields(contact);
  setInputValue('owner', contact?.owner);
  const visitDate = contact?.visitDate || contact?.VisitDate || contact?.visit_date;
  setDateInputValue('visit-date', visitDate);
  await populateRealtor(contact);

  // 2) Name in header (already there)
  const fullName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim();
  const nameEl = document.getElementById('contact-full-name');
  if (nameEl) nameEl.textContent = fullName || 'Unnamed Contact';

  // 3) Communities + floorplans
  await populateCommunities({ contact });

  //3.5) More-Details-Panel
  hydrateMoreDetails(contact);

  // 4) Summary
  hydrateSummaryOnly();

  // 5) Bind summary listeners once
  bindSummaryListeners();
}



/** Repaint only the top summary row without re-running the whole hydrate */
export function hydrateSummaryOnly() {
  updateTopBarSummary();
}

function bindSummaryListeners() {
  if (summaryListenersBound) return;
  if (!DOM.moreInfoBody) return;

  // Delegate once to avoid attaching many individual listeners
  DOM.moreInfoBody.addEventListener('change', (e) => {
    // Only react to form controls
    if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) return;
    updateTopBarSummary();
  });

  summaryListenersBound = true;
}

export function updateTopBarSummary() {
  // Text fields
  const lt = document.getElementById('lotLineUp');
  const bt = document.getElementById('buyTime');
  const bm = document.getElementById('buyMonth');

  setText('summary-lotLineUp', lt?.value);
  setText('summary-buyTime',   bt?.value);
  setText('summary-buyMonth',  bm?.value);

  // Facing
  const facing = Array.from(document.querySelectorAll('input[name="facing"]:checked'))
    .map(cb => cb.value);
  setText('summary-facing', facing.length ? facing.join(', ') : '');

  // Floorplans (labels of checked boxes)
  const plans = Array.from(document.querySelectorAll('#floorplans-container input:checked'))
    .map(cb => cb.closest('label')?.innerText.trim())
    .filter(Boolean);
  setText('summary-floorplans', plans.length ? plans.join(', ') : '');

  // Living
  const living = [];
  if (document.getElementById('investor')?.checked)        living.push('Investor');
  if (document.getElementById('renting')?.checked)         living.push('Renting');
  if (document.getElementById('own-selling')?.checked)     living.push('Own & Selling');
  if (document.getElementById('own-not-selling')?.checked) living.push('Own & Not Selling');
  setText('summary-living', living.length ? living.join(', ') : '');
}

async function populateRealtor(contact) {
  // If the template doesnâ€™t include these, bail quietly
  const anyRealtorField = ['realtorFirstName','realtorLastName','realtorEmail','realtorPhone','realtorBrokerage']
    .some(id => document.getElementById(id));
  if (!anyRealtorField) return;

  // Try common shapes
  let r = contact?.realtor ?? contact?.primaryRealtor ?? contact?.realtorId ?? contact?.realtor_id;
  if (!r) {
    // clear fields if nothing set
    fillRealtorFields({ firstName:'', lastName:'', email:'', phone:'', brokerage:'' });
    return;
  }

  try {
    const obj = (typeof r === 'string')
      ? await api.fetchRealtorById(r)
      : r; // already an object

    // Defensive: some APIs nest the person under .realtor/.person
    const realtorObj = obj?.realtor || obj?.person || obj;

    const populated = {
      firstName: realtorObj?.firstName || '',
      lastName:  realtorObj?.lastName  || '',
      email:     realtorObj?.email     || '',
      phone:     realtorObj?.phone     || '',
      brokerage: realtorObj?.brokerage || realtorObj?.lenderBrokerage || '',
    };
    fillRealtorFields(populated);
    updateRealtorDisplay(populated);
  } catch (e) {
    console.warn('[hydrate] realtor fetch failed; leaving fields blank', e);
    const blank = { firstName:'', lastName:'', email:'', phone:'', brokerage:'' };
    fillRealtorFields(blank);
    updateRealtorDisplay(blank);
  }
}

// ---- tiny helpers ----
function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = value == null ? '' : String(value).trim();
  el.textContent = text.length ? text : '';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? '';
}

function setDateInputValue(id, isoOrDateish) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!isoOrDateish) { el.value = ''; return; }
  // Accept ISO string, Date, or date-only string
  const d = typeof isoOrDateish === 'string' || isoOrDateish instanceof Date
    ? new Date(isoOrDateish)
    : new Date(String(isoOrDateish));
  if (Number.isNaN(+d)) { el.value = String(isoOrDateish); return; }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  // If it's a <input type="date"> use yyyy-mm-dd; otherwise still give a clean date-only
  el.value = `${yyyy}-${mm}-${dd}`;
}

// --- Hydrate the "More Details" panel from the contact doc ---
function hydrateMoreDetails(contact) {
  // A) Simple text inputs
  setInputValue('lotLineUp', contact?.lotLineUp);
  setInputValue('buyTime',   contact?.buyTime);
  setInputValue('buyMonth',  contact?.buyMonth);

  // (optional) Lead Source select, if you store it on the contact
  if (document.getElementById('source') && contact?.source) {
    setInputValue('source', contact.source);
  }

  // B) Facing checkboxes (supports array OR comma-separated string)
  const allFacing = Array.from(document.querySelectorAll('input[name="facing"]'));
  allFacing.forEach(cb => cb.checked = false);
  if (contact?.facing != null) {
    const faces = Array.isArray(contact.facing)
      ? contact.facing
      : String(contact.facing).split(',').map(s => s.trim()).filter(Boolean);
    allFacing.forEach(cb => { if (faces.includes(cb.value)) cb.checked = true; });
  }

  // C) Living condition (supports array OR individual booleans)
  // Array shape: ["Investor","Renting","Own & Selling","Own & Not Selling"]
  // Boolean shape: contact.investor, contact.renting, contact.ownSelling, contact.ownNotSelling
  const idForLabel = (label) => {
    switch (label) {
      case 'Investor':             return 'investor';
      case 'Renting':              return 'renting';
      case 'Own & Selling':        return 'own-selling';
      case 'Own & Not Selling':    return 'own-not-selling';
      default: return null;
    }
  };

  // Clear all first
  ['investor','renting','own-selling','own-not-selling']
    .forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });

  if (Array.isArray(contact?.living)) {
    contact.living.forEach(label => {
      const id = idForLabel(label);
      if (id) { const el = document.getElementById(id); if (el) el.checked = true; }
    });
  } else if (contact) {
    const setIf = (id, flag) => {
      const el = document.getElementById(id);
      if (el && Object.prototype.hasOwnProperty.call(contact, flag)) el.checked = !!contact[flag];
    };
    setIf('investor',        'investor');
    setIf('renting',         'renting');
    setIf('own-selling',     'ownSelling');
    setIf('own-not-selling', 'ownNotSelling');
  }
}



