// /assets/js/address-details/hydrate.js
import * as API from './api.js';
import { els } from './domCache.js';
import { formatDateTime, toLocalInputDateTime } from './utils.js';
import {
  renderTitleAndBasics,
  renderGeneralStatus,
  renderTopBar,
  renderRightColumn,
  setInitialFormValues
} from './render.js';

// Split an ISO/date value into local "YYYY-MM-DD" + "HH:MM"
const splitToLocalDateAndTime = (value) => {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

// Populate the 3 milestone inputs, supporting either split or single fields.
const hydrateWalkMilestone = (key, isoLike) => {
  // Split-field IDs
  const map = {
    thirdParty:   { date: 'thirdPartyDate',   time: 'thirdPartyTime',   single: 'thirdPartyInput',   statusEl: 'thirdPartyStatusValue' },
    firstWalk:    { date: 'firstWalkDate',    time: 'firstWalkTime',    single: 'firstWalkInput',    statusEl: 'firstWalkStatusValue' },
    finalSignOff: { date: 'finalSignOffDate', time: 'finalSignOffTime', single: 'finalSignOffInput', statusEl: 'finalSignOffStatusValue' },
  };
  const cfg = map[key];
  if (!cfg) return;

  const dEl = document.getElementById(cfg.date);
  const tEl = document.getElementById(cfg.time);
  const sEl = document.getElementById(cfg.single);
  const status = document.getElementById(cfg.statusEl);

  // Top-bar status text
  if (status) status.textContent = isoLike ? formatDateTime(isoLike) : '';

  // Prefer split fields if present
  if (dEl && tEl) {
    const { date, time } = splitToLocalDateAndTime(isoLike);
    dEl.value = date;
    tEl.value = time;
    return;
  }
  // Fallback to single datetime-local
  if (sEl) {
    sEl.value = isoLike ? toLocalInputDateTime(isoLike) : '';
  }
};

export const hydrateAll = async ({ communityId, lotId, lot, purchaserContact, realtor, primaryEntry }) => {
  // 1) Page title + basics
  renderTitleAndBasics(lot);

  // 2) Floor plans select list + set selected
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
      // support either stored as ObjectId or embedded object
      if (lot.floorPlan && lot.floorPlan._id) els.floorPlanSelect.value = lot.floorPlan._id;
      else if (lot.floorPlan) els.floorPlanSelect.value = lot.floorPlan;
    } catch (e) {
      console.warn('Floor plan fetch failed', e);
    }
  }

  // 3) Initial form values for general fields
  setInitialFormValues(lot, primaryEntry);

  // 4) Walk milestones (hydrate inputs + top bar date text)
  hydrateWalkMilestone('thirdParty',   lot.thirdParty || '');
  hydrateWalkMilestone('firstWalk',    lot.firstWalk || '');
  hydrateWalkMilestone('finalSignOff', lot.finalSignOff || '');

  // 5) Right column cards
  renderRightColumn(purchaserContact, realtor, primaryEntry);

  // 6) Status bars (building/walk/lender/closing)
  renderTopBar(lot, primaryEntry);
  renderGeneralStatus(lot, purchaserContact, primaryEntry);

  // 7) Closing block (select value + datetime input)
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  if (els.closingDateTimeInput && primaryEntry?.closingDateTime) {
    els.closingDateTimeInput.value = toLocalInputDateTime(primaryEntry.closingDateTime);
  }
};
