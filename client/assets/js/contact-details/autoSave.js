// assets/js/contact-details/autosave.js
import { debounce } from './utils.js';
import { getState, setContact } from './state.js';
import * as api from './api.js';

const DEBOUNCE_MS = 500;

// Common single-value inputs by id → payload field
const idMap = {
  firstName: 'firstName',
  lastName:  'lastName',
  email:     'email',
  phone:     'phone',
  status:    'status',
  source:    'source',
  owner:     'owner',
  visitDate: 'visit-date',
  lotLineUp: 'lotLineUp',
  buyTime:   'buyTime',
  buyMonth:  'buyMonth',
};

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
  // floorplans: multi-select checkboxes
  bindGroup('input[name="floorplans"]', () => {
    const vals = [...document.querySelectorAll('input[name="floorplans"]:checked')].map(cb => cb.value);
    saveField('floorplans', vals);
  });

  // facing: multi-select checkboxes
  bindGroup('input[name="facing"]', () => {
    const vals = [...document.querySelectorAll('input[name="facing"]:checked')].map(cb => cb.value);
    saveField('facing', vals);
  });

  // living booleans
  bindSimpleCheckbox('investor');
  bindSimpleCheckbox('renting');
  bindSimpleCheckbox('own-selling', 'ownSelling');
  bindSimpleCheckbox('own-not-selling', 'ownNotSelling');

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
function bindGroup(selector, compute) {
  const handler = debounce(compute, DEBOUNCE_MS);
  document.querySelectorAll(selector).forEach(el => el.addEventListener('change', handler));
}

function bindSimpleCheckbox(id, fieldName = id) {
  const el = document.getElementById(id);
  if (!el) return;
  const handler = debounce(() => saveField(fieldName, !!el.checked), DEBOUNCE_MS);
  el.addEventListener('change', handler);
}

function readValue(el) {
  if (el.type === 'checkbox') return !!el.checked;
  return el.value;
}

async function saveField(field, value) {
  try {
    const { contactId } = getState();
    const payload = { [field]: value };
    const updated = await api.saveContact(contactId, payload);
    setContact(updated);
  } catch (e) {
    console.error('[autosave] failed', field, e);
  }
}

async function saveRealtorSelection() {
  const realtorId = window.updatedContactRealtorId;
  if (!realtorId) return;
  await saveField('realtor', realtorId);
}
