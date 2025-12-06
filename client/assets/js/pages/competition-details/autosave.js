// assets/js/competition-details/autosave.js
import { $, $$ } from '../../core/dom.js';
import { debounce } from '../../core/async.js';
import { putCompetition } from './api.js';
import { collectFeeTypes } from './fees.js';

export function initAutosave(competitionId) {
  const save = debounce(async () => {
    const payload = buildPayload();
    if (!competitionId) return;
    try { await putCompetition(competitionId, payload); }
    catch (e) { console.error('Auto-save error:', e); }
  });

  // inputs + selects
  $$('input[type="text"], input[type="email"], input[type="number"], select')
    .forEach(el => el.addEventListener('input', save));

  // radios: garageType
  $$('input[name="garageType"]').forEach(el => el.addEventListener('change', save));

  // fees trigger save via fees.init calling onChange (we pass save from index)
  return save; // return so fees can call it
}

function buildPayload() {
  const data = {};
  $$('input[type="text"], input[type="email"], input[type="number"], select')
    .forEach(el => { if (el.name) data[el.name] = el.value; });

  data.feeTypes = collectFeeTypes();

  const g = $('input[name="garageType"]:checked');
  data.garageType = g ? g.value : null;

  return data;
}
