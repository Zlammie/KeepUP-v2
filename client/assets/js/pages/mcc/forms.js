// client/assets/js/mcc/forms.js
import { COMMUNITY_API, toFormData, numOrNull } from './context.js';

function updateFeeGroups() {
  const feeNone = document.getElementById('feeNone');
  const feeMud  = document.getElementById('feeMud');
  const feePid  = document.getElementById('feePid');
  const none = !!feeNone?.checked;
  const mud  = !!feeMud?.checked && !none;
  const pid  = !!feePid?.checked && !none;
  const mudGroup = document.getElementById('mudFeeGroup');
  const pidGroup = document.getElementById('pidFeeGroup');
  if (mudGroup) mudGroup.style.display = mud ? '' : 'none';
  if (pidGroup) pidGroup.style.display = pid ? '' : 'none';
}

export function wireFeeToggles() {
  ['feeNone', 'feeMud', 'feePid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateFeeGroups);
  });
  updateFeeGroups();
}

async function saveProfile() {
  const form = document.getElementById('profileForm');
  if (!form) return;
  await fetch(COMMUNITY_API, {
    method: 'PUT', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(toFormData(form)),
  });
}

async function saveFees() {
  const form = document.getElementById('feesForm');
  if (!form) return;
  const fd = new FormData(form);
  let feeTypes = fd.getAll('feeTypes');
  const payload = {
    HOA: numOrNull(fd.get('HOA')),
    tax: numOrNull(fd.get('tax')),
    realtorCommission: numOrNull(fd.get('realtorCommission')),
    feeTypes: feeTypes.length ? feeTypes : ['None'],
    mudFee: numOrNull(fd.get('mudFee')),
    pidFee: numOrNull(fd.get('pidFee')),
    earnestAmount: numOrNull(fd.get('earnestAmount'))
  };
  if (payload.feeTypes.includes('None')) {
    payload.feeTypes = ['None']; payload.mudFee = null; payload.pidFee = null;
  }
  await fetch(COMMUNITY_API, {
    method: 'PUT', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
  });
}

async function saveSchool() {
  const form = document.getElementById('schoolForm');
  if (!form) return;
  await fetch(COMMUNITY_API, {
    method: 'PUT', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(toFormData(form)),
  });
}

async function saveNotes() {
  const el = document.getElementById('notes');
  if (!el) return;
  await fetch(COMMUNITY_API, {
    method: 'PUT', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ notes: el.value }),
  });
}

export function wireFormAutosaves() {
  [['profileForm', saveProfile], ['feesForm', saveFees], ['schoolForm', saveSchool]].forEach(([id, fn]) => {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input, select, textarea')) fn().catch(console.error);
    });
  });
  const notes = document.getElementById('notes');
  if (notes) notes.addEventListener('blur', () => saveNotes().catch(console.error));
}
