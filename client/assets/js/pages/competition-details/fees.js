// assets/js/competition-details/fees.js
import { $, $$ } from '../../core/dom.js';

export function initFees(onChange) {
  const feeNone = $('#feeNone');
  const feeMud  = $('#feeMud');
  const feePid  = $('#feePid');

  const mudGrp  = $('#mudFeeGroup');
  const pidGrp  = $('#pidFeeGroup');

  const mudFee  = $('#mudFee');
  const pidFee  = $('#pidFee');

  const show = (el) => { if (el) el.style.display = '';   };   // let CSS decide (block/flex/grid)
  const hide = (el) => { if (el) el.style.display = 'none'; };

  function sync(source) {
    if (!feeNone || !feeMud || !feePid) return;

    // Exclusivity: "None" vs MUD/PID
    if (source === 'none' && feeNone.checked) {
      feeMud.checked = false;
      feePid.checked = false;
    }
    if ((source === 'mud' && feeMud.checked) || (source === 'pid' && feePid.checked)) {
      feeNone.checked = false;
    }

    // Instant visibility
    feeMud.checked ? show(mudGrp) : hide(mudGrp);
    feePid.checked ? show(pidGrp) : hide(pidGrp);

    // Notify autosave (debounced) if provided
    onChange?.(['feeTypes','mudFee','pidFee']);
  }

  // Listeners
  feeNone?.addEventListener('change', () => sync('none'));
  feeMud ?.addEventListener('change', () => sync('mud'));
  feePid ?.addEventListener('change', () => sync('pid'));

  // Save when typing fee amounts too
  mudFee?.addEventListener('input', () => onChange?.(['mudFee']));
  pidFee?.addEventListener('input', () => onChange?.(['pidFee']));

  // Initial paint from server-rendered state
  sync();
}

/**
 * Used by autosave to serialize the current fee types into an array.
 * Keeps autosave.js unchanged.
 */
export function collectFeeTypes() {
  const out = [];
  if ($('#feeMud')?.checked)  out.push('MUD');
  if ($('#feePid')?.checked)  out.push('PID');
  if ($('#feeNone')?.checked) out.push('None');
  return out;
}
