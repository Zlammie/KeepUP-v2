// assets/js/contact-details/hydrate.js
import { getState } from './state.js';
import { DOM, refreshDOM } from './domCache.js';
import { refreshStatusUI } from './status.js';
import { populateCommunities } from './communitySection.js';
import { fillRealtorFields } from './realtorSearch.js';
import * as api from './api.js';

let summaryListenersBound = false;

function populateBaseFields(contact) {
  setInputValue('firstName', contact?.firstName);
  setInputValue('lastName',  contact?.lastName);
  setInputValue('email',     contact?.email);
  setInputValue('phone',     contact?.phone);
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

  // 👉 NEW: base inputs
  populateBaseFields(contact);
  setInputValue('owner', contact?.owner);
  setDateInputValue('visit-date', contact?.visitDate);
  await populateRealtor(contact);

  // 2) Name in header (already there)
  const fullName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim();
  const nameEl = document.getElementById('contact-full-name');
  if (nameEl) nameEl.textContent = fullName || 'Unnamed Contact';

  // 3) Communities + floorplans
  await populateCommunities({ contact });

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
  setText('summary-facing', facing.length ? facing.join(', ') : '—');

  // Floorplans (labels of checked boxes)
  const plans = Array.from(document.querySelectorAll('#floorplans-container input:checked'))
    .map(cb => cb.closest('label')?.innerText.trim())
    .filter(Boolean);
  setText('summary-floorplans', plans.length ? plans.join(', ') : '—');

  // Living
  const living = [];
  if (document.getElementById('investor')?.checked)        living.push('Investor');
  if (document.getElementById('renting')?.checked)         living.push('Renting');
  if (document.getElementById('own-selling')?.checked)     living.push('Own & Selling');
  if (document.getElementById('own-not-selling')?.checked) living.push('Own & Not Selling');
  setText('summary-living', living.length ? living.join(', ') : '—');
}

async function populateRealtor(contact) {
  // If the template doesn’t include these, bail quietly
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

    fillRealtorFields({
      firstName: realtorObj?.firstName || '',
      lastName:  realtorObj?.lastName  || '',
      email:     realtorObj?.email     || '',
      phone:     realtorObj?.phone     || '',
      brokerage: realtorObj?.brokerage || realtorObj?.lenderBrokerage || '',
    });
  } catch (e) {
    console.warn('[hydrate] realtor fetch failed; leaving fields blank', e);
    fillRealtorFields({ firstName:'', lastName:'', email:'', phone:'', brokerage:'' });
  }
}

// ---- tiny helpers ----
function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (value && String(value).trim()) ? value : '—';
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

