// /assets/js/address-details/hydrate.js
import * as API from './api.js';
import { els } from './domCache.js';
import { toLocalInputDateTime } from './utils.js';
import {
  renderTitleAndBasics,
  renderTopBar,
  renderRightColumn,
  setInitialFormValues
} from './render.js';

// Helpers
const pad = (n) => String(n).padStart(2, '0');
const splitToLocalDateAndTime = (value) => {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};
const isDateOnly = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isLocalDateTime = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
const isUTCISO = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(v);


// Populate one milestone (supports split date+time OR legacy single datetime-local)
// Return {date,time} for inputs without inventing time
const splitForInputs = (v) => {
  if (!v) return { date: '', time: '' };

  // --- Normalize to string ---
  let s = v;
  if (v instanceof Date) {
    s = v.toISOString();           // e.g., 2025-09-16T15:30:00.000Z
  } else if (typeof v === 'number') {
    s = new Date(v).toISOString(); // epoch ms → ISO
  } else if (typeof v !== 'string') {
    s = String(v);
  }

  // --- Existing branches, now against a string ---
  const isDateOnly      = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  const isLocalDateTime = (x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x);
  const isUTCISO        = (x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(x);

  if (isDateOnly(s)) return { date: s,              time: '' };
  if (isLocalDateTime(s)) return { date: s.slice(0,10), time: s.slice(11,16) };

  if (isUTCISO(s)) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (m && m[2] === '00' && m[3] === '00') return { date: m[1], time: '' }; // date-only legacy
    const d = new Date(s);
    const pad = (n) => String(n).padStart(2,'0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  // Fallback: take YYYY-MM-DD; try HH:MM if present
  return { date: s.slice(0,10), time: s.length >= 16 ? s.slice(11,16) : '' };
};

const applyGeneralSelectClass = (sel) => {
  if (!sel) return;
  const v = String(sel.value || '').toLowerCase().replace(/\s+/g, '-'); // "Coming Soon" → "coming-soon"
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

  // nothing stored → clear
  if (!storedVal) {
    dEl.value = '';
    tEl.value = '';
    if (status) status.textContent = '';
    return;
  }

  // split existing value, then force minutes-only time
const { date, time } = splitForInputs(storedVal);
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
    els.floorPlanSelect.innerHTML = '<option value="" disabled selected>— Select Floor Plan —</option>';
    try {
      const plans = await API.getFloorPlans();
      for (const p of plans) {
        const opt = document.createElement('option');
        opt.value = p._id;
        opt.textContent = `${p.planNumber} – ${p.name}`;
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

 // Manual General Status dropdown
const updateLotSafe = async (patch) => {
  try { return await API.updateLot(communityId, lotId, patch); }
  catch (e) {
    try { return await API.updateLot(lotId, patch); }
    catch (e2) { console.warn('[generalStatus] updateLot failed (both signatures)', e, e2); }
  }
};

// some backends accept different keys; try a tolerant patch
const generalPatch = (v) => ({
  generalStatus: v,       // our schema field
  general: v,             // alt key seen in some codebases
  statusGeneral: v        // another common variant
});

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


  // 8) Closing (keep this as datetime-local for now)
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  if (els.closingDateTimeInput && primaryEntry?.closingDateTime) {
    // uses utils.toLocalInputDateTime → ensure utils formats LOCAL, not UTC
    els.closingDateTimeInput.value = toLocalInputDateTime(primaryEntry.closingDateTime);
  }
};
['thirdPartyTime','firstWalkTime','finalSignOffTime'].forEach(id => {
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