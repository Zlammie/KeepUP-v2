// /assets/js/address-details/hydrate.js
import * as API from './api.js';
import { els } from './domCache.js';
import { splitDateTimeForInputs } from '../../core/datetime.js';
import {
  renderTitleAndBasics,
  renderTopBar,
  renderRightColumn,
  setInitialFormValues
} from './render.js';

const applyGeneralSelectClass = (sel) => {
  if (!sel) return;
  const v = String(sel.value || '').toLowerCase().replace(/\s+/g, '-'); // "Coming Soon" -> "coming-soon"
  const classes = [
    'gs--available','gs--spec','gs--sold','gs--closed',
    'gs--coming-soon','gs--model','gs--hold'
  ];
  sel.classList.remove(...classes);
  const match = classes.find(c => c.endsWith(v));
  if (match) sel.classList.add(match);
};

const hydrateWalkMilestone = (key, storedVal) => {
  const map = {
    thirdParty:   { date: 'thirdPartyDate',   time: 'thirdPartyTime',   statusEl: 'thirdPartyStatusValue' },
    firstWalk:    { date: 'firstWalkDate',    time: 'firstWalkTime',    statusEl: 'firstWalkStatusValue' },
    finalSignOff: { date: 'finalSignOffDate', time: 'finalSignOffTime', statusEl: 'finalSignOffStatusValue' },
  };
  const cfg = map[key];
  const dEl = document.getElementById(cfg.date);
  const tEl = document.getElementById(cfg.time);
  const status = document.getElementById(cfg.statusEl);
  if (!dEl || !tEl) return;

  // ensure minutes-only UI even if HTML wasn't updated
  try { if (tEl.step !== '60') tEl.step = '60'; } catch {}

  // nothing stored -> clear
  if (!storedVal) {
    dEl.value = '';
    tEl.value = '';
    if (status) status.textContent = '';
    return;
  }

  // split existing value, then force minutes-only time
  const { date, time } = splitDateTimeForInputs(storedVal);
  const minutesOnly = (time || '').slice(0, 5); // force "HH:MM"
  dEl.value = date || '';
  tEl.value = minutesOnly;                      // '' keeps time truly empty
  try { tEl.step = '60'; } catch {}             // minutes-only UI

  // Status text: MM/DD/YYYY or MM/DD/YYYY HH:MM
  if (status) {
    if (!minutesOnly) {
      const [y, m, d] = (date || '').split('-').map(Number);
      status.textContent = (isFinite(y) && isFinite(m) && isFinite(d))
        ? new Date(y, m - 1, d).toLocaleDateString(undefined, { year:'numeric', month:'2-digit', day:'2-digit' })
        : '';
    } else {
      const dt = new Date(`${date}T${minutesOnly}`);
      status.textContent = isNaN(dt) ? '' : dt.toLocaleString(undefined, {
        year:'numeric', month:'2-digit', day:'2-digit', hour:'numeric', minute:'2-digit'
      });
    }
  }
};

export const hydrateAll = async ({ communityId, lotId, lot, purchaserContact, realtor, primaryEntry }) => {
  // 1) Title & basics
  renderTitleAndBasics(lot);

  // 2) Floor plans
  if (els.floorPlanSelect) {
    els.floorPlanSelect.innerHTML = '<option value="" selected>-- No floor plan --</option>';
    try {
      const plans = await API.getFloorPlans(communityId);
      const list = Array.isArray(plans) ? plans : [];
      if (!list.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No linked floor plans';
        opt.disabled = true;
        els.floorPlanSelect.appendChild(opt);
      }
      for (const p of list) {
        const opt = document.createElement('option');
        opt.value = p._id;
        opt.textContent = `${p.planNumber} - ${p.name}`;
        els.floorPlanSelect.appendChild(opt);
      }
      // support either ObjectId or embedded object
      if (lot.floorPlan && lot.floorPlan._id) els.floorPlanSelect.value = lot.floorPlan._id;
      else if (lot.floorPlan) els.floorPlanSelect.value = lot.floorPlan;
    } catch (e) {
      console.warn('Floor plan fetch failed', e);
    }
  }

  // 3) Initial form values for general fields
  setInitialFormValues(lot, primaryEntry);

  // 4) Render the status bars first (uses raw lot values)
  renderTopBar(lot, primaryEntry);

  // 5) Then hydrate walk milestones and correct the top-bar labels when date-only
  hydrateWalkMilestone('thirdParty',   lot.thirdParty   || '');
  hydrateWalkMilestone('firstWalk',    lot.firstWalk    || '');
  hydrateWalkMilestone('finalSignOff', lot.finalSignOff || '');

  // 6) Right column cards
  renderRightColumn(purchaserContact, realtor, primaryEntry);

{
  const gSel = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (gSel) {
    // hydrate value from lot (keeps old fallbacks just in case)
    gSel.value = lot.generalStatus || lot.general || lot.statusGeneral || 'Available';
    applyGeneralSelectClass(gSel);  // color on load

    gSel.addEventListener('change', async (e) => {
      const v = e.target.value;
      applyGeneralSelectClass(gSel);  // recolor on change
      try {
        // Option A path (server expects PUT /api/communities/:communityId/lots/:lotId)
        await API.updateLot(communityId, lotId, { generalStatus: v });
        lot.generalStatus = v; // keep local model in sync
      } catch (err) {
        console.warn('[generalStatus] save failed:', err);
      }
    });
  } else {
    console.warn('[generalStatus] #generalStatusSelect not found in DOM');
  }
}


  // 8) Closing (split date + time inputs)
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  {
    const dateEl = els.closingDateInput;
    const timeEl = els.closingTimeInput;
    const { date, time } = splitDateTimeForInputs(primaryEntry?.closingDateTime || '');
    if (dateEl) dateEl.value = date || '';
    if (timeEl) {
      timeEl.value = time || '';
      try {
        timeEl.min = '00:00';
        timeEl.max = '23:59';
        timeEl.step = '60';
      } catch {}
      timeEl.classList.toggle('is-blank', !time);
    }
  }
};
['thirdPartyTime','firstWalkTime','finalSignOffTime','closingTimeInput'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.step = '60';
  el.min = '00:00';
  el.max = '23:59';
  const sync = () => el.classList.toggle('is-blank', !el.value);
  sync();
  el.addEventListener('input', sync);
  el.addEventListener('change', sync);
});


