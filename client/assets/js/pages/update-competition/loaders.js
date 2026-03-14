// public/assets/js/update-competition/loaders.js
const parseNumericValue = v => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};
const isNum = v => parseNumericValue(v) != null;
const numOrNull = v => parseNumericValue(v);
const formatWholeMoneyValue = v => {
  const num = parseNumericValue(v);
  return num == null
    ? ''
    : `$${Math.round(num).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const findPlan  = id => allFloorPlans.find(fp => fp._id === id);
const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getRecordMonthKey = (rec) => {
  if (!rec) return '';
  if (rec.status === 'SOLD') {
    return (rec.soldDate || '').slice(0, 7) || rec.month || (rec.listDate || '').slice(0, 7) || '';
  }
  return TARGET_MONTH_KEY || (rec.listDate || '').slice(0, 7) || rec.month || '';
};
const buildInventorySearchText = (rec) => {
  const planName = findPlan(rec.floorPlan)?.name || '';
  return [
    rec.address,
    rec.status,
    planName,
    rec.listDate,
    rec.soldDate
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
};
const formatMonth = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
};
const isFullDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// gate creates until required fields present
const canCreateQMI = p =>
  !!p.address?.trim() &&
  !!p.listDate &&
  !!p.floorPlan &&
  isNum(p.listPrice) &&
  isNum(p.sqft);

const STATUS_LABELS = [
  'Ready Now',
  'SOLD',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const renderStatusOptions = (selectedValue, fallback = 'Ready Now') => {
  const existing = STATUS_LABELS.includes(selectedValue) ? STATUS_LABELS : (selectedValue ? [selectedValue, ...STATUS_LABELS] : STATUS_LABELS);
  const deduped = [...new Set(existing)];
  const effective = selectedValue || fallback;
  return deduped
    .map((label) => `<option value="${label}"${label === effective ? ' selected' : ''}>${label}</option>`)
    .join('');
};

const renderFloorPlanOptions = (selectedValue) => {
  const selected = selectedValue ? String(selectedValue) : '';
  const options = [
    `<option value=""${selected ? '' : ' selected'}>Select floor plan</option>`
  ];
  options.push(
    ...allFloorPlans.map(
      (fp) =>
        `<option value="${fp._id}"${String(fp._id) === selected ? ' selected' : ''}>${fp.name}</option>`
    )
  );
  return options.join('');
};

import { competitionId } from './data.js';
import * as DOM from './dom.js';

// ## Module-scope state
let allQuickHomes = [];
let allFloorPlans = [];
const targetMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const TARGET_MONTH_KEY = `${targetMonthDate.getFullYear()}-${String(targetMonthDate.getMonth() + 1).padStart(2, '0')}`;
const QMI_HELPER_STORAGE_KEY = `competition-qmi-helper:${competitionId}`;
let pendingInventoryFocusId = null;
let inventoryFocusTimeoutId = null;

const readQmiHelperState = () => {
  try {
    const raw = window.localStorage.getItem(QMI_HELPER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeQmiHelperState = (state) => {
  try {
    window.localStorage.setItem(QMI_HELPER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; this helper is intentionally best-effort only.
  }
};

const wireMoneyInputs = (root, selector) => {
  root.querySelectorAll(selector).forEach((input) => {
    if (input.dataset.moneyWired === 'true') return;
    input.dataset.moneyWired = 'true';

    input.addEventListener('focus', () => {
      const raw = parseNumericValue(input.value);
      input.value = raw == null ? '' : String(Math.round(raw));
    });

    input.addEventListener('blur', () => {
      input.value = formatWholeMoneyValue(input.value);
    });
  });
};

/**
 * 0) Initialize data: fetch all Quick-Move-Ins and Floor Plans
 */
export async function initQuickHomes() {
  [allQuickHomes, allFloorPlans] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/quick-moveins`).then(r => r.json()),
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json())
  ]);
}

export function searchInventoryHomes(query) {
  const term = normalizeText(query);
  if (!term) return [];

  return allQuickHomes
    .map((rec) => {
      const planName = findPlan(rec.floorPlan)?.name || '';
      const jumpMonth = getRecordMonthKey(rec);
      const isSold = rec.status === 'SOLD';
      const targetMonthLabel = jumpMonth ? formatMonth(jumpMonth) : '';

      return {
        id: rec._id,
        address: rec.address || 'Unnamed home',
        planName,
        status: rec.status || (isSold ? 'SOLD' : 'Ready Now'),
        isSold,
        jumpMonth,
        targetMonthLabel,
        jumpActionLabel: isSold
          ? (targetMonthLabel ? `Go to sold month: ${targetMonthLabel}` : 'Go to sold record')
          : 'Go to inventory row',
        searchText: buildInventorySearchText(rec)
      };
    })
    .filter((item) => item.id && item.searchText.includes(term))
    .sort((a, b) => {
      const aStarts = a.address.toLowerCase().startsWith(term) ? 0 : 1;
      const bStarts = b.address.toLowerCase().startsWith(term) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.isSold !== b.isSold) return a.isSold ? -1 : 1;
      return a.address.localeCompare(b.address);
    })
    .slice(0, 12);
}

export function focusInventoryRecord(recordId) {
  pendingInventoryFocusId = recordId ? String(recordId) : null;
}

/**
 * 1) Floor-Plan Pricing loader
 */
export async function loadMonth(monthKey) {
  
  const [fps, prs] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json()),
    fetch(`/api/competitions/${competitionId}/price-records?month=${monthKey}`).then(r => r.json())
  ]);

  const prMap = {};
  prs.forEach(pr => { prMap[pr.floorPlan] = pr; });

  DOM.priceBody.innerHTML = '';
  fps.forEach(fp => {
    const existing = prMap[fp._id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fp.name}</td>
      <td>${fp.sqft || ''}</td>
      <td>${fp.bed || ''}</td>
      <td>${fp.bath || ''}</td>
      <td>${fp.garage || ''}</td>
      <td>${fp.storyType || ''}</td>
      <td>
        <input
          type="number"
          class="form-control price-input"
          data-fp="${fp._id}"
          data-price-id="${existing ? existing._id : ''}"
          value="${existing ? existing.price : ''}"
          step="0.01"
        />
      </td>`;
    DOM.priceBody.appendChild(tr);
  });

  const inputs = DOM.priceBody.querySelectorAll('.price-input');

  function reapplyPriceHighlight() {
    applyPriceHighlight(DOM.priceBody, monthKey === TARGET_MONTH_KEY);
  }

  inputs.forEach(input => {
    input.addEventListener('blur', async e => {
      const fpId = e.target.dataset.fp;
      const existingId = e.target.dataset.priceId;
      const raw = e.target.value;
      const hasValue = raw !== '' && raw != null;
      const price = hasValue ? Number(raw) : null;

      if (!hasValue) {
        reapplyPriceHighlight();
        return; // ignore empty fields; do not coerce to zero
      }
      if (!Number.isFinite(price)) {
        console.warn('Ignoring invalid price input', raw);
        reapplyPriceHighlight();
        return;
      }

      const url      = existingId
        ? `/api/competitions/${competitionId}/price-records/${existingId}`
        : `/api/competitions/${competitionId}/price-records`;
      const method   = existingId ? 'PUT' : 'POST';
      const body     = existingId
        ? { price }
        : { floorPlanId: fpId, month: monthKey, price };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        console.error('Price save failed', res.status, await res.text().catch(() => ''));
        reapplyPriceHighlight();
        return;
      }

      if (!existingId) {
        const saved = await res.json().catch(() => null);
        if (saved && saved._id) {
          e.target.dataset.priceId = saved._id;
        }
      }
      reapplyPriceHighlight();
    });
  });

  reapplyPriceHighlight();
}

/**
 * 2) Quick-Move-Ins & Sold loader
 */
export function loadQuickHomes(monthKey) {
  const monthIdx = new Date(`${monthKey}-01`).getMonth();
  const qmiHelperState = readQmiHelperState();
  // Filter unsold and sold for the given month
  const unsold = allQuickHomes.filter(r =>
  r.status !== 'SOLD' && (r.listDate || '').slice(0,7) <= monthKey
);
  const sold = allQuickHomes.filter(r =>
  r.status === 'SOLD' && (
    (r.soldDate && r.soldDate.slice(0, 7) === monthKey) ||
    (!r.soldDate && r.month === monthKey)
  )
);


  // Render Quick-Move-Ins table
  DOM.quickBody.innerHTML = '';
  unsold.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    const helperChecked = Boolean(rec._id && qmiHelperState[String(rec._id)]);
    tr.innerHTML = `
      <td class="qmi-helper-cell">
        <button
          type="button"
          class="qmi-helper-toggle${helperChecked ? ' is-checked' : ''}"
          data-helper-id="${rec._id || ''}"
          aria-pressed="${helperChecked ? 'true' : 'false'}"
          aria-label="${helperChecked ? 'Mark quick move-in as unchecked' : 'Mark quick move-in as checked'}"
          title="${helperChecked ? 'Checked' : 'Mark as checked'}"
        >
          <span aria-hidden="true">✓</span>
        </button>
      </td>
      <td><input class="form-control qmi-input" data-field="address" value="${rec.address}" /></td>
      <td><input type="date" class="form-control qmi-input"  data-field="listDate" value="${(rec.listDate || '').slice(0,10)}" /></td>
      <td>
        <select class="form-select qmi-input" data-field="floorPlan">
          ${renderFloorPlanOptions(rec.floorPlan)}
        </select>
      </td>
      <td><input type="text" inputmode="numeric" class="form-control qmi-input qmi-money-input" data-field="listPrice" value="${formatWholeMoneyValue(rec.listPrice)}" /></td>
       <td><input type="number" class="form-control qmi-input" data-field="sqft"
                   value="${rec.sqft ?? (findPlan(rec.floorPlan)?.sqft ?? '')}" /></td>
      <td>
        <select class="form-select qmi-input" data-field="status">
          ${renderStatusOptions(rec.status, 'Ready Now')}
        </select>
      </td>`;
    DOM.quickBody.appendChild(tr);
  });

const addTr = document.createElement('tr');
// no addTr.dataset.id so POST on save
addTr.innerHTML = `
  <td class="qmi-helper-cell qmi-helper-cell--placeholder"></td>
  <td><input class="form-control qmi-input" data-field="address" value="" /></td>
  <td><input type="date" class="form-control qmi-input"  data-field="listDate" value="" /></td>
  <td>
    <select class="form-select qmi-input" data-field="floorPlan">
      ${renderFloorPlanOptions(null)}
    </select>
  </td>
  <td><input type="text" inputmode="numeric" class="form-control qmi-input qmi-money-input" data-field="listPrice" value="" /></td>
  <td><input type="number" class="form-control qmi-input" data-field="sqft" value="" /></td>
  <td>
    <select class="form-select qmi-input" data-field="status">
      ${renderStatusOptions(null, 'Ready Now')}
    </select>
  </td>
`;
DOM.quickBody.appendChild(addTr);

const newPlanSel = addTr.querySelector('.qmi-input[data-field="floorPlan"]');
const newSqftInp = addTr.querySelector('.qmi-input[data-field="sqft"]');
if (newPlanSel && newSqftInp && !newSqftInp.value) {
  const plan = allFloorPlans.find(fp => fp._id === newPlanSel.value);
  if (plan?.sqft != null) newSqftInp.value = plan.sqft;
}

wireMoneyInputs(DOM.quickBody, '.qmi-money-input');

  // Render Sold table
  DOM.soldBody.innerHTML = '';
  sold.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    tr.innerHTML = `
      <td><input class="form-control sold-input" data-field="address" value="${rec.address}" /></td>
      <td><input type="date" class="form-control sold-input" data-field="listDate" value="${(rec.listDate || '').slice(0,10)}" /></td>
      <td>
        <select class="form-select sold-input" data-field="floorPlan">
          ${renderFloorPlanOptions(rec.floorPlan)}
        </select>
      </td>
      <td><input type="text" inputmode="numeric" class="form-control sold-input sold-money-input" data-field="listPrice" value="${formatWholeMoneyValue(rec.listPrice)}" /></td>
       <td><input class="form-control sold-input" type="number" data-field="sqft"
                   value="${rec.sqft ?? (findPlan(rec.floorPlan)?.sqft ?? '')}" /></td>
      <td><input type="date" class="form-control sold-input" data-field="soldDate" value="${(rec.soldDate || '').slice(0,10)}" /></td>
      <td>
        <input class="form-control sold-input sold-money-input" type="text" inputmode="numeric"
              data-field="soldPrice" value="${formatWholeMoneyValue(rec.soldPrice)}" />
      </td>  
      <td>
        <button type="button" class="btn btn-sm btn-outline-secondary sold-move-btn">Move to QMI</button>
      </td>
   `;
    DOM.soldBody.appendChild(tr);
  });

  wireMoneyInputs(DOM.soldBody, '.sold-money-input');
  applyPendingInventoryFocus();

  // Auto-save Quick-Move-Ins
DOM.quickBody.querySelectorAll('.qmi-input').forEach(el => {
  el.addEventListener('change', async e => {
    const row = e.target.closest('tr');
    const id  = row.dataset.id;



    // build payload from the row
    const payload = {};
    row.querySelectorAll('.qmi-input').forEach(inp => {
      payload[inp.dataset.field] = inp.value;
    });

    // if the plan changed, auto-fill sqft from the selected plan
    if (e.target.dataset.field === 'floorPlan') {
      const plan = allFloorPlans.find(fp => fp._id === e.target.value);
      const sq   = plan?.sqft ?? null;
      const sqftInput = row.querySelector('.qmi-input[data-field="sqft"]');
      if (sqftInput) sqftInput.value = sq ?? '';
      payload.sqft = sq;
    }

    // NEW: gate creation until required fields are present
    if (!id) {
      if (!canCreateQMI(payload)) {
        // do NOT POST yet—let the user finish the row
        return;
      }
      // defaults for a new record
      payload.month  = monthKey;
      if (!payload.status) payload.status = 'Ready Now';
    }

    // normalize numeric fields for the API
    payload.listPrice = numOrNull(payload.listPrice);
    payload.sqft      = numOrNull(payload.sqft);

    // keep your “pin to month when SOLD and no soldDate yet” if you added it
    if (payload.status === 'SOLD' && !payload.soldDate) {
      // When marking sold without a date, pin it to the prior month we track (current month - 1)
      payload.month = TARGET_MONTH_KEY;
    }

    const url    = id
      ? `/api/competitions/${competitionId}/quick-moveins/${id}`
      : `/api/competitions/${competitionId}/quick-moveins`;
    const method = id ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        console.error('QMI save failed', resp.status, await resp.text());
        return; // don't wipe the row on failure
      }
      await initQuickHomes();   // refresh cache so values stick
      loadQuickHomes(monthKey);
    } catch (err) {
      console.error('QMI save error', err);
    }
  });
});

  DOM.quickBody.querySelectorAll('.qmi-helper-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const helperId = btn.dataset.helperId;
      if (!helperId) return;

      const nextChecked = !btn.classList.contains('is-checked');
      btn.classList.toggle('is-checked', nextChecked);
      btn.setAttribute('aria-pressed', String(nextChecked));
      btn.setAttribute('aria-label', nextChecked ? 'Mark quick move-in as unchecked' : 'Mark quick move-in as checked');
      btn.setAttribute('title', nextChecked ? 'Checked' : 'Mark as checked');

      const nextState = readQmiHelperState();
      if (nextChecked) {
        nextState[helperId] = true;
      } else {
        delete nextState[helperId];
      }
      writeQmiHelperState(nextState);
    });
  });



  // Auto-save Sold (date uses BLUR; others use CHANGE)
DOM.soldBody.querySelectorAll('.sold-input').forEach(el => {
  const field = el.dataset.field;
  const evt   = field === 'soldDate' ? 'blur' : 'change';

  el.addEventListener(evt, async e => {
    const row = e.target.closest('tr');
    const id  = row.dataset.id;

    // Block saves from OTHER fields while soldDate is partially typed
    const sdInput = row.querySelector('.sold-input[data-field="soldDate"]');
    const sdVal   = sdInput ? sdInput.value : '';
    if (field !== 'soldDate' && sdVal && !isFullDate(sdVal)) {
      return; // wait until soldDate is complete or cleared
    }

    // If this is the soldDate field, only save on a FULL date (blur event)
    if (field === 'soldDate' && !isFullDate(e.target.value)) {
      return; // ignore partial/invalid
    }

    // Build payload; SKIP soldDate unless it's complete so we don't wipe it
    const payload = {};
    row.querySelectorAll('.sold-input').forEach(inp => {
      const f = inp.dataset.field;
      const v = inp.value;

      if (f === 'soldDate' && !isFullDate(v)) return; // skip incomplete/blank

      payload[f] = inp.classList.contains('sold-money-input')
        ? numOrNull(v)
        : (inp.type === 'number'
          ? (v === '' || v == null ? null : Number(v))
          : v);
    });

    const resp = await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      console.error('Sold save failed', resp.status, await resp.text());
      return;
    }

    await initQuickHomes();

    // If soldDate was set and belongs to another month, hop there so the row stays visible
    if (field === 'soldDate' && isFullDate(e.target.value)) {
      const newYM = e.target.value.slice(0, 7);
      if (newYM !== monthKey) {
        const link = document.querySelector(`[data-month="${newYM}"]`);
        if (link) { link.click(); return; }
      }
    }
    loadQuickHomes(monthKey);
  });
});

// Allow moving a sold home back to inventory
DOM.soldBody.querySelectorAll('.sold-move-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    const id  = row?.dataset.id;
    if (!id) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Moving...';

    try {
      const resp = await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Ready Now',
          soldDate: null,
          soldPrice: null,
          month: monthKey
        })
      });
      if (!resp.ok) {
        console.error('Move to QMI failed', resp.status, await resp.text());
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      await initQuickHomes();
      loadQuickHomes(monthKey);
    } catch (err) {
      console.error('Move to QMI error', err);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
});
}
  

/**
 * 3) Sales Records loader
 */
export async function loadSales(monthKey) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/sales-records?month=${monthKey}`
  ).then(r => r.json());

  // pick the exact record for the selected month (or none)
  const r = recs.find(x => x.month === monthKey) || {};
  const monthLabel = formatMonth(monthKey);

  DOM.salesBody.innerHTML = '';
  const tr = document.createElement('tr');
  tr.dataset.id = r._id || '';
  tr.dataset.month = monthKey;
  tr.innerHTML = `
    <td>${monthLabel}</td>
    <td><input type="number" class="form-control sales-input" data-field="sales"    value="${r.sales ?? ''}" /></td>
    <td><input type="number" class="form-control sales-input" data-field="cancels"  value="${r.cancels ?? ''}" /></td>
    <td class="net-cell">${(r.sales ?? '') !== '' && (r.cancels ?? '') !== '' ? (Number(r.sales) - Number(r.cancels)) : ''}</td>
    <td><input type="number" class="form-control sales-input" data-field="closings" value="${r.closings ?? ''}" /></td>
  `;
  DOM.salesBody.appendChild(tr);
  applySalesHighlight(tr, monthKey === TARGET_MONTH_KEY);

  // keep your existing blur/change handler; ensure new creates set month
  tr.querySelectorAll('.sales-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;

      const sales   = Number(row.querySelector('[data-field="sales"]').value || 0);
      const cancels = Number(row.querySelector('[data-field="cancels"]').value || 0);
      const closings= Number(row.querySelector('[data-field="closings"]').value || 0);
      row.querySelector('.net-cell').textContent = sales - cancels;

      const payload = { sales, cancels, closings };
      let url   = `/api/competitions/${competitionId}/sales-records`;
      let method = 'POST';
      if (id) { url += `/${id}`; method = 'PUT'; }
      else { payload.month = monthKey; } // <-- important for new records

      await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    });
  });
}

function applyPriceHighlight(container, active) {
  if (!container) return;
  container.querySelectorAll('input.price-input').forEach((input) => {
    const hasPrice = isNum(input.value);
    const shouldHighlight = active && !hasPrice;
    input.classList.toggle('plan-price-input--warning', shouldHighlight);
  });
}

function applySalesHighlight(row, active) {
  if (!row) return;
  row
    .querySelectorAll('.sales-input')
    .forEach((input) => {
      const shouldHighlight = active && !isNum(input.value);
      input.classList.toggle('sales-summary-input--warning', shouldHighlight);
    });
}

function applyPendingInventoryFocus() {
  if (!pendingInventoryFocusId) return;

  const targetRow = DOM.quickBody.querySelector(`tr[data-id="${pendingInventoryFocusId}"]`)
    || DOM.soldBody.querySelector(`tr[data-id="${pendingInventoryFocusId}"]`);

  if (!targetRow) return;

  if (inventoryFocusTimeoutId) {
    window.clearTimeout(inventoryFocusTimeoutId);
    inventoryFocusTimeoutId = null;
  }

  DOM.quickBody.querySelectorAll('.inventory-row--target').forEach((row) => {
    row.classList.remove('inventory-row--target');
  });
  DOM.soldBody.querySelectorAll('.inventory-row--target').forEach((row) => {
    row.classList.remove('inventory-row--target');
  });

  targetRow.classList.add('inventory-row--target');
  targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  pendingInventoryFocusId = null;

  inventoryFocusTimeoutId = window.setTimeout(() => {
    targetRow.classList.remove('inventory-row--target');
    inventoryFocusTimeoutId = null;
  }, 2200);
}
