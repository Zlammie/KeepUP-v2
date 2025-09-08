// /assets/js/address-details/controls.js
import * as API from './api.js';
import { els } from './domCache.js';
import { debounce } from './utils.js';
import {
  buildingClasses, walkStatusClasses, walkStatusLabels,
  closingStatusClasses, closingStatusLabels
} from './statusMaps.js';
import { formatDateTime } from './utils.js';

// --- helpers -------------------------------------------------------
const restyleSelect = (selectEl, classesMap, newVal) => {
  if (!selectEl) return;
  Object.values(classesMap).forEach(c => selectEl.classList.remove(c));
  if (classesMap[newVal]) selectEl.classList.add(classesMap[newVal]);
};

// create "YYYY-MM-DDTHH:MM" (local) from separate fields; if time missing, default noon
const combineLocalDateTime = (dateStr, timeStr) => {
  if (!dateStr) return ''; // don't save anything if no date yet
  const [y, m, d] = dateStr.split('-').map(Number);
  let hh = 12, mm = 0;
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
    [hh, mm] = timeStr.split(':').map(Number);
  }
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0); // local
  return dt.toISOString().slice(0, 16);
};

// set a status-bar value showing date-only (if time TBD) or date+time
const setWalkTopBar = (key, isoLike, dateHadNoTime) => {
  const pretty = isoLike
    ? (dateHadNoTime ? new Date(isoLike).toLocaleDateString() : formatDateTime(isoLike))
    : '';
  if (key === 'thirdParty')   els.thirdPartyStatusValue.textContent   = pretty;
  if (key === 'firstWalk')    els.firstWalkStatusValue.textContent    = pretty;
  if (key === 'finalSignOff') els.finalSignOffStatusValue.textContent = pretty;
};

// save lot field with error guard
const saveLotField = async (communityId, lotId, payload) => {
  try {
    await API.putLot(communityId, lotId, payload);
  } catch (e) {
    console.error('Auto-save failed', payload, e);
  }
};

// --- main attachment ------------------------------------------------
export const attachAllControls = ({ communityId, lotId, lot, purchaserContact, primaryEntry }) => {
  // 1) Generic lot-field autosave (blur/change)
  const generic = [
    { el: els.floorPlanSelect,          key: 'floorPlan',               event: 'change' },
    { el: els.elevationInput,           key: 'elevation',               event: 'blur'   },
    { el: els.releaseDateInput,         key: 'releaseDate',             event: 'blur'   },
    { el: els.expectedCompletionInput,  key: 'expectedCompletionDate',  event: 'blur'   },
    { el: els.closeMonthInput,          key: 'closeMonth',              event: 'blur'   },
    { el: els.walkStatusSelect,         key: 'walkStatus',              event: 'change' },
  ];
  generic.forEach(({ el, key, event }) => {
    if (!el) return;
    el.addEventListener(event, async (e) => {
      await saveLotField(communityId, lotId, { [key]: e.target.value });
    });
  });

  // 2) Building status: restyle + save + badge
  if (els.buildingStatusSelect) {
    const sel = els.buildingStatusSelect;
    restyleSelect(sel, buildingClasses, sel.value);
    sel.addEventListener('change', async (e) => {
      const val = e.target.value;
      restyleSelect(sel, buildingClasses, val);
      await saveLotField(communityId, lotId, { status: val });
      // (badge is already handled in renderTopBar on initial load, but we update here too)
      // You can import a label map here if you want to rewrite innerHTML badge.
    });
  }

  // 3) List price (debounced)
  if (els.listPriceInput) {
    const deb = debounce(async (val) => {
      await saveLotField(communityId, lotId, { listPrice: (val ?? '').trim() });
    }, 350);
    els.listPriceInput.addEventListener('input', (e) => deb(e.target.value));
    els.listPriceInput.addEventListener('blur',  (e) => deb(e.target.value));
  }

  // 4) Walk fields — support BOTH patterns:
  //    A) Split date+time pair (thirdPartyDate/thirdPartyTime, etc.)
  //    B) Single datetime-local (thirdPartyInput, etc.)
  const pairs = [
    { key:'thirdParty',   dId:'thirdPartyDate',   tId:'thirdPartyTime',   single:'thirdPartyInput'   },
    { key:'firstWalk',    dId:'firstWalkDate',    tId:'firstWalkTime',    single:'firstWalkInput'    },
    { key:'finalSignOff', dId:'finalSignOffDate', tId:'finalSignOffTime', single:'finalSignOffInput' },
  ];

  pairs.forEach(({ key, dId, tId, single }) => {
    const dEl = document.getElementById(dId);
    const tEl = document.getElementById(tId);
    const singleEl = document.getElementById(single);

    // A) If you have split fields (preferred)
    if (dEl && tEl) {
      const handler = async () => {
        const dateVal = dEl.value?.trim() || '';
        const timeVal = tEl.value?.trim() || '';
        const isoLike = combineLocalDateTime(dateVal, timeVal); // '' if no date yet
        if (!isoLike) return; // user hasn't picked a date yet
        await saveLotField(communityId, lotId, { [key]: isoLike });
        setWalkTopBar(key, isoLike, !timeVal);
      };
      dEl.addEventListener('change', handler);
      tEl.addEventListener('change', handler);
      dEl.addEventListener('blur', handler);
      tEl.addEventListener('blur', handler);
      return; // done
    }

    // B) Fallback to single datetime-local input
    if (singleEl) {
      const handler = async (e) => {
        const val = e.target.value?.trim() || '';
        if (!val) return; // nothing to save
        await saveLotField(communityId, lotId, { [key]: val });
        // For single field, we don’t know if user omitted time; show full
        setWalkTopBar(key, val, false);
      };
      singleEl.addEventListener('change', handler);
      singleEl.addEventListener('blur', handler);
    }
  });

  // 5) Walk status (tint + badge already updated here on change)
  if (els.walkStatusSelect) {
    const sel = els.walkStatusSelect;
    const tint = (v) => { restyleSelect(sel, walkStatusClasses, v); };
    tint(sel.value);
    sel.addEventListener('change', async (e) => {
      const v = e.target.value;
      tint(v);
      await saveLotField(communityId, lotId, { walkStatus: v });
      els.walkStatusValue.innerHTML =
        `<span class="status-badge ${walkStatusClasses[v]}">${walkStatusLabels[v]}</span>`;
    });
  }

  // 6) Closing status & closing datetime (saved to Contact.primary lender)
  const closingStatusSelect = els.closingStatusSelect;
  const closingDateInput = els.closingDateTimeInput;

  const updatePrimaryLenderAndSave = async (mutator) => {
    if (!purchaserContact?.lenders?.length) return;
    const updated = purchaserContact.lenders.map(l => l.isPrimary ? mutator({ ...l }) : l);
    try {
      await API.putContact(purchaserContact._id, { lenders: updated });
    } catch (e) {
      console.error('Failed to save lender info', e);
    }
  };

  if (closingStatusSelect) {
    const tint = (v) => restyleSelect(closingStatusSelect, closingStatusClasses, v);
    tint(closingStatusSelect.value);

    closingStatusSelect.addEventListener('change', async (e) => {
      const v = e.target.value;
      tint(v);
      await updatePrimaryLenderAndSave(l => (l.closingStatus = v, l));
      els.closingStatusValue.innerHTML =
        `<span class="status-badge ${closingStatusClasses[v]}">${closingStatusLabels[v]}</span>`;
    });
  }

  if (closingDateInput) {
    closingDateInput.addEventListener('blur', async (e) => {
      const dt = e.target.value?.trim() || '';
      if (!dt) return;
      await updatePrimaryLenderAndSave(l => (l.closingDateTime = dt, l));
      // also reflect in the top bar
      els.closingDateValue.textContent = formatDateTime(dt);
    });
  }
};
