// /assets/js/address-details/controls.js
import * as API from './api.js';
import { els, assignPrimaryLender } from './domCache.js';
import { debounce } from './utils.js';
import {
  buildingClasses, buildingLabels,
  walkStatusClasses, walkStatusLabels,
  closingStatusClasses, closingStatusLabels
} from './statusMaps.js';
import {
  splitDateTimeForInputs,
  formatClosingSummary,
  formatCurrency,
  parseCurrency
} from './utils.js';

// --- helpers -------------------------------------------------------
const restyleSelect = (selectEl, classesMap, newVal) => {
  if (!selectEl) return;
  Object.values(classesMap).forEach(c => selectEl.classList.remove(c));
  if (classesMap[newVal]) selectEl.classList.add(classesMap[newVal]);
};

// ✅ Build a value without inventing a time.
// If time is blank, we store just "YYYY-MM-DD"; otherwise "YYYY-MM-DDTHH:MM".
const buildWalkValue = (dateStr, timeStr) => {
  if (!dateStr) return { value: '', dateOnly: false };
  const ds = dateStr.trim(), ts = (timeStr || '').trim();
  return ts ? { value: `${ds}T${ts}`, dateOnly: false } : { value: ds, dateOnly: true };
};

const setWalkTopBar = (key, val, dateOnly) => {
  const map = { thirdParty:'thirdPartyStatusValue', firstWalk:'firstWalkStatusValue', finalSignOff:'finalSignOffStatusValue' };
  const el = document.getElementById(map[key]);
  if (!el) return;
  if (!val) { el.textContent = ''; return; }
  if (dateOnly) {
    const [y,m,d] = val.split('-').map(Number);
    el.textContent = new Date(y, m-1, d).toLocaleDateString();
  } else {
    el.textContent = new Date(val).toLocaleString([], { hour:'numeric', minute:'numeric' });
  }
};

// register a date+time pair + optional clear button
function registerWalkPair(key, dId, tId, clearId, communityId, lotId) {
  const dEl = document.getElementById(dId);
  const tEl = document.getElementById(tId);
  const clr = clearId ? document.getElementById(clearId) : null;
  if (!dEl || !tEl) return;

  const save = async () => {
    const { value, dateOnly } = buildWalkValue(dEl.value, tEl.value);
    if (!value) return; // no date yet
    try {
      console.log('PUT →', `/api/communities/${communityId}/lots/${lotId}`, { [key]: value });
      await API.putLot(communityId, lotId, { [key]: value });
      console.log('✅ saved', key, value);
      setWalkTopBar(key, value, dateOnly);
    } catch (e) {
      console.error('❌ save failed', key, value, e);
    }
  };

  dEl.addEventListener('change', save);
  tEl.addEventListener('change', save);
  dEl.addEventListener('blur', save);
  tEl.addEventListener('blur', save);

  // Clear just the time → persist date-only
  if (clr) {
    clr.addEventListener('click', async () => {
      if (!dEl.value) return;
      tEl.value = '';
      try {
        await API.putLot(communityId, lotId, { [key]: dEl.value }); // "YYYY-MM-DD"
        console.log('✅ saved (date-only)', key, dEl.value);
        setWalkTopBar(key, dEl.value, true);
      } catch (e) {
        console.error('❌ save failed (date-only)', key, dEl.value, e);
      }
    });
  }
}
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

  if (!communityId || !lotId) {
  const qs = new URLSearchParams(location.search);
  communityId = communityId || qs.get('communityId') || document.body?.dataset?.communityId || '';
  lotId      = lotId      || qs.get('lotId')      || document.body?.dataset?.lotId      || '';
}
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
      if (els.buildingStatusValue) {
        const label = buildingLabels[val] || val.replace(/-/g, ' ');
        const cls = buildingClasses[val] || '';
        els.buildingStatusValue.innerHTML = `<span class="status-badge ${cls}">${label}</span>`;
      }
    });
  }

  // 3) List price (debounced)
  if (els.listPriceInput) {
    const inputEl = els.listPriceInput;
    const persistListPrice = async (raw) => {
      const numeric = parseCurrency(raw);
      const payload = numeric == null ? { listPrice: null } : { listPrice: numeric };
      await saveLotField(communityId, lotId, payload);
    };
    const deb = debounce(persistListPrice, 350);

    inputEl.addEventListener('focus', () => {
      const numeric = parseCurrency(inputEl.value);
      inputEl.value = numeric == null ? '' : numeric.toString();
      if (typeof inputEl.select === 'function') {
        inputEl.select();
      }
    });

    inputEl.addEventListener('input', (e) => deb(e.target.value));

    inputEl.addEventListener('blur', async (e) => {
      await persistListPrice(e.target.value);
      const numeric = parseCurrency(e.target.value);
      inputEl.value = numeric == null ? '' : formatCurrency(numeric);
    });

    // ensure initial render is formatted
    inputEl.value = formatCurrency(inputEl.value) || inputEl.value;
  }

  // 4) Walk fields — support BOTH patterns:
  //    A) Split date+time pair (thirdPartyDate/thirdPartyTime, etc.)
  //    B) Single datetime-local (thirdPartyInput, etc.)
  registerWalkPair('thirdParty',   'thirdPartyDate',   'thirdPartyTime',   'thirdPartyTimeClear',   communityId, lotId);
  registerWalkPair('firstWalk',    'firstWalkDate',    'firstWalkTime',    'firstWalkTimeClear',    communityId, lotId);
  registerWalkPair('finalSignOff', 'finalSignOffDate', 'finalSignOffTime', 'finalSignOffTimeClear', communityId, lotId);



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
  const closingDateInput = els.closingDateInput;
  const closingTimeInput = els.closingTimeInput;
  const closingSummaryEl = els.closingSummaryValue;
  let currentPrimaryEntry = primaryEntry || null;
  if (!currentPrimaryEntry && Array.isArray(purchaserContact?.lenders)) {
    currentPrimaryEntry =
      purchaserContact.lenders.find((l) => l?.isPrimary) || purchaserContact.lenders[0] || null;
  }

  const patchPrimaryLender = async (payload = {}) => {
    if (!purchaserContact?._id || !currentPrimaryEntry?._id) {
      console.warn('No primary lender entry available; skipping closing update');
      return null;
    }
    try {
      const updated = await API.patchContactLender(purchaserContact._id, currentPrimaryEntry._id, payload);
      if (updated && updated._id) {
        currentPrimaryEntry = { ...currentPrimaryEntry, ...updated };
        assignPrimaryLender(currentPrimaryEntry);
        if (Array.isArray(purchaserContact.lenders)) {
          const idx = purchaserContact.lenders.findIndex((l) => String(l?._id) === String(updated._id));
          if (idx >= 0) {
            purchaserContact.lenders[idx] = { ...purchaserContact.lenders[idx], ...updated };
          }
        }
        return currentPrimaryEntry;
      }
      return null;
    } catch (e) {
      console.error('Failed to save lender info', e);
      return null;
    }
  };

  if (closingStatusSelect) {
    const tint = (v) => restyleSelect(closingStatusSelect, closingStatusClasses, v);
    tint(closingStatusSelect.value);

    closingStatusSelect.addEventListener('change', async (e) => {
      const v = e.target.value;
      tint(v);
      const updated = await patchPrimaryLender({ closingStatus: v });
      const effective = updated?.closingStatus || currentPrimaryEntry?.closingStatus || v;
      closingStatusSelect.value = effective;
      tint(effective);
      if (updated?.closingStatus) {
        currentPrimaryEntry = updated;
      }
      const badgeKey = closingStatusClasses[effective] ? effective : 'notLocked';
      els.closingStatusValue.innerHTML =
        `<span class="status-badge ${closingStatusClasses[badgeKey]}">${closingStatusLabels[badgeKey]}</span>`;
    });
  }

  const summaryPlaceholder = closingSummaryEl?.dataset?.placeholder || 'Not scheduled';
  const setClosingSummary = (date, time) => {
    if (!closingSummaryEl) return;
    if (!date) {
      closingSummaryEl.textContent = summaryPlaceholder;
      closingSummaryEl.classList.add('is-placeholder');
      return;
    }
    closingSummaryEl.textContent = formatClosingSummary({ date, time });
    closingSummaryEl.classList.remove('is-placeholder');
  };

  const refreshSummaryFromInputs = () => {
    if (!closingDateInput) return;
    const dateVal = closingDateInput.value?.trim() || '';
    const timeVal = closingTimeInput?.value?.trim() || '';
    if (closingTimeInput) {
      closingTimeInput.classList.toggle('is-blank', !timeVal);
    }
    setClosingSummary(dateVal, timeVal);
  };

  const syncClosingPreview = (raw) => {
    const { date, time } = splitDateTimeForInputs(raw);
    if (closingDateInput) closingDateInput.value = date;
    if (closingTimeInput) closingTimeInput.value = time;
    refreshSummaryFromInputs();
  };
  syncClosingPreview(currentPrimaryEntry?.closingDateTime || '');

  const saveClosing = async () => {
    if (!closingDateInput) return;
    const dateVal = closingDateInput.value?.trim();
    const timeVal = closingTimeInput?.value?.trim() || '';
    if (!dateVal) return;

    const timePart = timeVal ? timeVal.slice(0, 5) : '';
    if (closingTimeInput && timePart !== timeVal) {
      closingTimeInput.value = timePart;
    }

    const payload = timePart ? `${dateVal}T${timePart}` : dateVal;
    const updatedPrimary = await patchPrimaryLender({ closingDateTime: payload || null });
    const previewSource = updatedPrimary?.closingDateTime ?? payload;
    syncClosingPreview(previewSource || '');
  };

  if (closingDateInput) {
    closingDateInput.addEventListener('input', refreshSummaryFromInputs);
    closingDateInput.addEventListener('change', saveClosing);
    closingDateInput.addEventListener('blur', saveClosing);
  }
  if (closingTimeInput) {
    closingTimeInput.addEventListener('input', refreshSummaryFromInputs);
    closingTimeInput.addEventListener('change', saveClosing);
    closingTimeInput.addEventListener('blur', saveClosing);
  }
};
