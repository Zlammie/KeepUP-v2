// /assets/js/address-details/controls.js
import * as API from './api.js';
import { els } from './domCache.js';
import { debounce } from './utils.js';
import {
  buildingClasses, buildingLabels,
  walkStatusClasses, walkStatusLabels,
  closingStatusClasses, closingStatusLabels
} from './statusMaps.js';
import { formatDateTime } from './utils.js';

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
    const deb = debounce(async (val) => {
      await saveLotField(communityId, lotId, { listPrice: (val ?? '').trim() });
    }, 350);
    els.listPriceInput.addEventListener('input', (e) => deb(e.target.value));
    els.listPriceInput.addEventListener('blur',  (e) => deb(e.target.value));
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
