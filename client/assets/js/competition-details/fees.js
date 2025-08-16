// assets/js/competition-details/fees.js
import { $, $$ } from './util.js';

export function initFees(onChange) {
  const feeNone = $('#feeNone');
  const feeMud  = $('#feeMud');
  const feePid  = $('#feePid');
  const mudGrp  = $('#mudFeeGroup');
  const pidGrp  = $('#pidFeeGroup');

  function sync() {
    if (!feeNone || !feeMud || !feePid) return;

    if (feeNone.checked) {
      feeMud.checked = false; feePid.checked = false;
      if (mudGrp) mudGrp.style.display = 'none';
      if (pidGrp) pidGrp.style.display = 'none';
    } else {
      if (feeMud.checked || feePid.checked) feeNone.checked = false;
      if (mudGrp) mudGrp.style.display = feeMud.checked ? 'block' : 'none';
      if (pidGrp) pidGrp.style.display = feePid.checked ? 'block' : 'none';
    }
    onChange?.();
  }

  [feeNone, feeMud, feePid].forEach(cb => cb?.addEventListener('change', sync));
  sync(); // initial state
}

export function collectFeeTypes() {
  const types = [];
  if ($('#feeMud')?.checked)  types.push('MUD');
  if ($('#feePid')?.checked)  types.push('PID');
  if ($('#feeNone')?.checked) types.push('None');
  return types;
}
