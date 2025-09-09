// /assets/js/address-details/hydrate.js
import * as API from './api.js';
import { els } from './domCache.js';
import { toLocalInputDateTime } from './utils.js';
import {
  renderTitleAndBasics,
  renderGeneralStatus,
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

  // Case 1: we stored a plain date string → time is truly blank
  if (isDateOnly(v)) return { date: v, time: '' };

  // Case 2: we stored a local "YYYY-MM-DDTHH:MM"
  if (isLocalDateTime(v)) return { date: v.slice(0,10), time: v.slice(11,16) };

  // Case 3: historical data saved as real Date → ISO with Z
  // Treat midnight Z as a date-only original; otherwise convert to local.
  if (isUTCISO(v)) {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (m && m[2] === '00' && m[3] === '00') {
      return { date: m[1], time: '' }; // date-only legacy
    }
    const d = new Date(v);
    const pad = (n) => String(n).padStart(2,'0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  // Fallback: assume first 10 are date, leave time blank
  return { date: v.slice(0,10), time: '' };
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

  if (!storedVal) {
    dEl.value = ''; tEl.value = '';
    if (status) status.textContent = '';
    return;
  }

  const { date, time } = splitForInputs(storedVal);
  dEl.value = date;
  tEl.value = time; // '' keeps time truly empty

  // Status text: date-only vs date+time
  if (status) {
    if (!time) {
      const [y, m, d] = date.split('-').map(Number);
      status.textContent = new Date(y, m - 1, d).toLocaleDateString();
    } else {
      status.textContent = new Date(`${date}T${time}`).toLocaleString([], { hour: 'numeric', minute: 'numeric' });
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

  // 7) General status summary
  renderGeneralStatus(lot, purchaserContact, primaryEntry);

  // 8) Closing (keep this as datetime-local for now)
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  if (els.closingDateTimeInput && primaryEntry?.closingDateTime) {
    // uses utils.toLocalInputDateTime → ensure utils formats LOCAL, not UTC
    els.closingDateTimeInput.value = toLocalInputDateTime(primaryEntry.closingDateTime);
  }
};
