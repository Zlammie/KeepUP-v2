// /assets/js/address-details/controls.js
import * as API from './api.js';
import { els, assignPrimaryLender } from './domCache.js';
import { debounce } from '../../core/async.js';
import {
  buildingClasses, buildingLabels,
  walkStatusClasses, walkStatusLabels,
  closingStatusClasses
} from './statusMaps.js';
import { splitDateTimeForInputs } from '../../core/datetime.js';
import { formatCurrency, parseCurrency } from '../../core/currency.js';
import { renderEarnestRows } from './render.js';
import { updateEarnestTasks } from './earnestTasks.js';

// --- helpers -------------------------------------------------------
const restyleSelect = (selectEl, classesMap, newVal) => {
  if (!selectEl) return;
  Object.values(classesMap).forEach(c => selectEl.classList.remove(c));
  if (classesMap[newVal]) selectEl.classList.add(classesMap[newVal]);
};

// Build a value without inventing a time.
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
      console.log('PUT', `/api/communities/${communityId}/lots/${lotId}`, { [key]: value });
      await API.putLot(communityId, lotId, { [key]: value });
      console.log('saved', key, value);
      setWalkTopBar(key, value, dateOnly);
    } catch (e) {
      console.error('save failed', key, value, e);
    }
  };

  dEl.addEventListener('change', save);
  tEl.addEventListener('change', save);
  dEl.addEventListener('blur', save);
  tEl.addEventListener('blur', save);

  // Clear just the time to persist date-only
  if (clr) {
    clr.addEventListener('click', async () => {
      if (!dEl.value) return;
      tEl.value = '';
      try {
        await API.putLot(communityId, lotId, { [key]: dEl.value }); // "YYYY-MM-DD"
        console.log('saved (date-only)', key, dEl.value);
        setWalkTopBar(key, dEl.value, true);
      } catch (e) {
        console.error('save failed (date-only)', key, dEl.value, e);
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

const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T00:00:00`);
    if (t.includes('T')) {
      const [datePart] = t.split('T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(`${datePart}T00:00:00`);
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
      const raw = e.target.value;
      const value = key === 'floorPlan' && raw === '' ? null : raw;
      await saveLotField(communityId, lotId, { [key]: value });
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

    inputEl.addEventListener('focus', () => {
      const numeric = parseCurrency(inputEl.value);
      inputEl.value = numeric == null ? '' : numeric.toString();
      if (typeof inputEl.select === 'function') {
        inputEl.select();
      }
    });

    inputEl.addEventListener('blur', async (e) => {
      await persistListPrice(e.target.value);
      const numeric = parseCurrency(e.target.value);
      inputEl.value = numeric == null ? '' : formatCurrency(numeric);
    });

    // ensure initial render is formatted
    inputEl.value = formatCurrency(inputEl.value) || inputEl.value;
  }

  // 4) Walk fields - support BOTH patterns:
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

  // 5b) Earnest money (table)
  const earnestBody = document.getElementById('earnestTableBody');
  const earnestTotalValue = document.getElementById('earnestTotalValue');
  const addEarnestRowBtn = document.getElementById('addEarnestRow');

  const collectEarnestEntries = () => {
    if (!earnestBody) return [];
    const rows = Array.from(earnestBody.querySelectorAll('.earnest-row'));
    return rows.map((row) => {
      const amtEl = row.querySelector('.earnest-amount');
      const dueEl = row.querySelector('.earnest-due');
      const colEl = row.querySelector('.earnest-collected');
      const amount = parseCurrency(amtEl?.value);
      const dueDate = dueEl?.value || null;
      const collectedDate = colEl?.value || null;
      const allBlank = amount == null && !dueDate && !collectedDate;
      return allBlank ? null : { amount: amount ?? null, dueDate, collectedDate };
    }).filter(Boolean);
  };

  const renderTotal = (entries) => {
    if (!earnestTotalValue) return;
    const total = entries.length ? entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : null;
    earnestTotalValue.textContent = total == null ? '' : (formatCurrency(total) || total.toString());
    return total;
  };

  const updateDueWarnings = (entries) => {
    if (!earnestBody) return;
    const rows = Array.from(earnestBody.querySelectorAll('.earnest-row'));
    const today = new Date();
    today.setHours(0,0,0,0);
    rows.forEach((row, idx) => {
      const dueInput = row.querySelector('.earnest-due');
      const collectedInput = row.querySelector('.earnest-collected');
      if (!dueInput) return;
      const entry = entries[idx];
      const hasAmount = entry && entry.amount != null && !Number.isNaN(Number(entry.amount));
      const missingDue = hasAmount && !entry?.dueDate && !entry?.collectedDate;
      const dueDate = parseLocalDate(entry?.dueDate);
      const collectedDate = parseLocalDate(entry?.collectedDate);
      const overdue = hasAmount && !collectedDate && dueDate && dueDate < today;
      dueInput.classList.toggle('earnest-missing-due', missingDue);
      if (collectedInput) {
        collectedInput.classList.toggle('earnest-overdue-collected', overdue);
      }
    });
  };

  const persistEarnest = debounce(async () => {
    const entries = collectEarnestEntries();
    const total = renderTotal(entries);
    updateDueWarnings(entries);
    updateEarnestTasks(entries);
    const payload = {
      earnestEntries: entries,
      earnestTotal: total ?? null,
      earnestAmount: entries[0]?.amount ?? null,
      earnestAdditionalAmount: entries[1]?.amount ?? null,
      earnestCollectedDate: entries[0]?.collectedDate ?? null
    };
    await saveLotField(communityId, lotId, payload);
  }, 250);

  if (earnestBody) {
    earnestBody.addEventListener('input', (e) => {
      if (!e.target.closest('.earnest-row')) return;
      if (e.target.classList.contains('earnest-amount')) {
        // live total update without formatting
        const entries = collectEarnestEntries();
        renderTotal(entries);
        updateDueWarnings(entries);
      }
    });
    earnestBody.addEventListener('blur', (e) => {
      if (!e.target.closest('.earnest-row')) return;
      if (e.target.classList.contains('earnest-amount')) {
        const numeric = parseCurrency(e.target.value);
        e.target.value = numeric == null ? '' : (formatCurrency(numeric) || numeric.toString());
      }
      persistEarnest();
    }, true);
    earnestBody.addEventListener('change', (e) => {
      if (!e.target.closest('.earnest-row')) return;
      const entries = collectEarnestEntries();
      updateDueWarnings(entries);
      persistEarnest();
    });
  }

  if (addEarnestRowBtn && earnestBody) {
    addEarnestRowBtn.addEventListener('click', () => {
      const entries = collectEarnestEntries();
      entries.push({ amount: null, dueDate: null, collectedDate: null });
      renderEarnestRows(entries);
      renderTotal(entries);
      updateDueWarnings(entries);
      updateEarnestTasks(entries);
    });
  }

  if (earnestBody) {
    earnestBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.earnest-delete');
      if (!btn) return;
      const row = btn.closest('.earnest-row');
      if (!row) return;
      if (!confirm('Delete this earnest entry?')) return;
      const idx = Number(row.dataset.earnestIndex || '0');
      const entries = collectEarnestEntries();
      if (idx >= 0 && idx < entries.length) {
        entries.splice(idx, 1);
      }
      renderEarnestRows(entries);
      renderTotal(entries);
      updateDueWarnings(entries);
      updateEarnestTasks(entries);
      alert('Earnest entry deleted.');
      persistEarnest();
    });
  }

  // 6) Closing status & closing datetime (saved to Contact.primary lender)
  const closingStatusSelect = els.closingStatusSelect;
  const closingDateInput = els.closingDateInput;
  const closingTimeInput = els.closingTimeInput;
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
    });
  }

  const syncClosingPreview = (raw) => {
    const { date, time } = splitDateTimeForInputs(raw);
    if (closingDateInput) closingDateInput.value = date || '';
    if (closingTimeInput) {
      closingTimeInput.value = time || '';
      closingTimeInput.classList.toggle('is-blank', !time);
    }
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
      closingTimeInput.classList.toggle('is-blank', !timePart);
    }

    const payload = timePart ? `${dateVal}T${timePart}` : dateVal;
    const updatedPrimary = await patchPrimaryLender({ closingDateTime: payload || null });
    const previewSource = updatedPrimary?.closingDateTime ?? payload;
    syncClosingPreview(previewSource || '');
  };

  if (closingDateInput) {
    closingDateInput.addEventListener('change', saveClosing);
    closingDateInput.addEventListener('blur', saveClosing);
  }
  if (closingTimeInput) {
    closingTimeInput.addEventListener('change', saveClosing);
    closingTimeInput.addEventListener('blur', saveClosing);
  }
};
