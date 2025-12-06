// assets/js/contact-details/contact-autosave.js
import { debounce } from '../../core/async.js';
import { getState, setContact } from './state.js';
import * as api from './api.js';

const DEBOUNCE_MS = 500;

// Common single-value inputs by id + payload field
const idMap = {
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  status: 'status',
  source: 'source',
  owner: 'owner',
  visitDate: 'visit-date',
  lotLineUp: 'lotLineUp',
  buyTime: 'buyTime',
  buyMonth: 'buyMonth',
};

const livingCheckboxes = [
  { id: 'investor', label: 'Investor', field: 'investor' },
  { id: 'renting', label: 'Renting', field: 'renting' },
  { id: 'own-selling', label: 'Own & Selling', field: 'ownSelling' },
  { id: 'own-not-selling', label: 'Own & Not Selling', field: 'ownNotSelling' },
];

const floorplansHandler = debounce(() => {
  const vals = [...document.querySelectorAll('input[name="floorplans"]:checked')].map(cb => cb.value);
  saveField('floorplans', vals);
}, DEBOUNCE_MS);

export function bindAutosave() {
  // 1) Generic: anything marked with data-autosave
  document.querySelectorAll('[data-autosave]').forEach((el) => {
    const field = el.dataset.autosave;
    const handler = debounce(() => saveField(field, readValue(el)), DEBOUNCE_MS);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // 2) Fallback: bind known ids if they don't already have data-autosave
  Object.entries(idMap).forEach(([field, id]) => {
    const el = document.getElementById(id);
    if (!el || el.hasAttribute('data-autosave')) return;
    const handler = debounce(() => saveField(field, readValue(el)), DEBOUNCE_MS);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // 3) Groups & checkboxes
  bindFloorplanAutosave();

  bindGroup('input[name="facing"]', () => {
    const vals = [...document.querySelectorAll('input[name="facing"]:checked')]
      .map(cb => cb.value)
      .filter(Boolean);
    saveField('facing', vals);
  });

  // living booleans + aggregate array
  livingCheckboxes.forEach(({ id, field }) => {
    bindSimpleCheckbox(id, field, collectLivingPayload);
  });

  // 4) Realtor selection (set by realtorSearch.js for backward compatibility)
  const realtorFields = ['realtorFirstName','realtorLastName','realtorEmail','realtorPhone','realtorBrokerage'];
  realtorFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', debounce(saveRealtorSelection, DEBOUNCE_MS));
  });
  if (Object.prototype.hasOwnProperty.call(window, 'updatedContactRealtorId')) {
    saveRealtorSelection();
  }
}

// ---- helpers ----
export function bindFloorplanAutosave() {
  document.querySelectorAll('input[name="floorplans"]').forEach(el => {
    el.removeEventListener('change', floorplansHandler);
    el.addEventListener('change', floorplansHandler);
  });
}

function bindGroup(selector, compute) {
  const handler = debounce(compute, DEBOUNCE_MS);
  document.querySelectorAll(selector).forEach(el => el.addEventListener('change', handler));
}

function bindSimpleCheckbox(id, fieldName = id, extraPatchFn) {
  const el = document.getElementById(id);
  if (!el) return;
  const handler = debounce(() => {
    const patch = { [fieldName]: !!el.checked };
    if (typeof extraPatchFn === 'function') {
      Object.assign(patch, extraPatchFn());
    }
    savePayload(patch);
  }, DEBOUNCE_MS);
  el.addEventListener('change', handler);
}

function readValue(el) {
  // Multi-selects -> array of selected option values
  if (el.tagName === 'SELECT' && el.multiple) {
    return Array.from(el.selectedOptions).map(o => o.value);
  }
  if (el.type === 'checkbox') return !!el.checked;
  return el.value;
}

async function saveField(field, value) {
  return savePayload({ [field]: value });
}

async function savePayload(patch) {
  try {
    const { contactId } = getState();
    const updated = await api.saveContact(contactId, patch);
    setContact(updated);
  } catch (e) {
    console.error('[autosave] failed', patch, e);
  }
}

async function saveRealtorSelection() {
  // 1) If a search flow set an explicit id, use that
  const explicitId = window.updatedContactRealtorId;
  if (explicitId) {
    await saveField('realtorId', explicitId);
    return;
  }

  // 2) Otherwise use the typed fields to create-or-reuse a company realtor
  const $ = (id) => document.getElementById(id);
  const payload = {
    firstName: $.call(null, 'realtorFirstName')?.value?.trim() || '',
    lastName: $.call(null, 'realtorLastName')?.value?.trim() || '',
    email: $.call(null, 'realtorEmail')?.value?.trim() || '',
    phone: $.call(null, 'realtorPhone')?.value?.trim() || '',
    brokerage: $.call(null, 'realtorBrokerage')?.value?.trim() || '',
  };
  // If nothing is provided, do nothing.
  if (!payload.firstName && !payload.lastName && !payload.email && !payload.phone && !payload.brokerage) return;

  try {
    const res = await fetch('/api/realtors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('realtor create/link failed: ' + res.status);
    const realtor = await res.json();
    // 3) Link to the contact
    await saveField('realtorId', realtor._id);
  } catch (e) {
    console.error('[autosave] realtor create/link failed', e);
  }
}

function collectLivingPayload() {
  const selections = livingCheckboxes
    .filter(({ id }) => document.getElementById(id)?.checked)
    .map(({ label }) => label);
  return { living: selections };
}
