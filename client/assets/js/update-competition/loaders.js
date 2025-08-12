// public/assets/js/update-competition/loaders.js
const isNum = v => v !== '' && v != null && !Number.isNaN(Number(v));
const numOrNull = v => (isNum(v) ? Number(v) : null);
const findPlan  = id => allFloorPlans.find(fp => fp._id === id);
const formatMonth = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
};

// gate creates until required fields present
const canCreateQMI = p =>
  !!p.address?.trim() &&
  !!p.listDate &&
  !!p.floorPlan &&
  isNum(p.listPrice) &&
  isNum(p.sqft);

import { competitionId } from './data.js';
import * as DOM from './dom.js';

// ## Module-scope state
let allQuickHomes = [];
let allFloorPlans = [];

/**
 * 0) Initialize data: fetch all Quick-Move-Ins and Floor Plans
 */
export async function initQuickHomes() {
  [allQuickHomes, allFloorPlans] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/quick-moveins`).then(r => r.json()),
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json())
  ]);
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
          value="${existing ? existing.price : ''}"
          step="0.01"
        />
      </td>`;
    DOM.priceBody.appendChild(tr);
  });

  document.querySelectorAll('.price-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const fpId     = e.target.dataset.fp;
      const price    = parseFloat(e.target.value) || 0;
      const existing = prMap[fpId];
      const url      = existing
        ? `/api/competitions/${competitionId}/price-records/${existing._id}`
        : `/api/competitions/${competitionId}/price-records`;
      const method   = existing ? 'PUT' : 'POST';
      const body     = existing
        ? { price }
        : { floorPlanId: fpId, month: monthKey, price };

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      loadMonth(monthKey);
    });
  });
}

/**
 * 2) Quick-Move-Ins & Sold loader
 */
export function loadQuickHomes(monthKey) {
  const monthIdx = new Date(`${monthKey}-01`).getMonth();
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
    tr.innerHTML = `
     <td>
        <button type="button" class="btn btn-sm btn-outline-danger qmi-delete">Delete</button>
     </td>
      <td><input class="form-control qmi-input" data-field="address" value="${rec.address}" /></td>
      <td><input type="date" class="form-control qmi-input"  data-field="listDate" value="${(rec.listDate || '').slice(0,10)}" /></td>
      <td>
        <select class="form-select qmi-input" data-field="floorPlan">
          ${allFloorPlans.map(fp =>
            `<option value="${fp._id}"${fp._id===rec.floorPlan?' selected':''}>${fp.name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" class="form-control qmi-input" data-field="listPrice" step="0.01" value="${rec.listPrice}" /></td>
       <td><input type="number" class="form-control qmi-input" data-field="sqft"
                   value="${rec.sqft ?? (findPlan(rec.floorPlan)?.sqft ?? '')}" /></td>
      <td>
        <select class="form-select qmi-input" data-field="status">
          <option value="Ready Now"${rec.status==='Ready Now'?' selected':''}>Ready Now</option>
          <option value="SOLD"${rec.status==='SOLD'?' selected':''}>SOLD</option>
        </select>
      </td>`;
    DOM.quickBody.appendChild(tr);
  });

const addTr = document.createElement('tr');
// no addTr.dataset.id so POST on save
addTr.innerHTML = `
  <td>
    <button type="button" class="btn btn-sm btn-outline-secondary qmi-clear">Clear</button>
  </td>
  <td><input class="form-control qmi-input" data-field="address" value="" /></td>
  <td><input type="date" class="form-control qmi-input"  data-field="listDate" value="" /></td>
  <td>
    <select class="form-select qmi-input" data-field="floorPlan">
      ${allFloorPlans.map(fp =>
        `<option value="${fp._id}">${fp.name}</option>`
      ).join('')}
    </select>
  </td>
  <td><input type="number" class="form-control qmi-input" data-field="listPrice" step="0.01" value="" /></td>
  <td><input type="number" class="form-control qmi-input" data-field="sqft" value="" /></td>
  <td>
    <select class="form-select qmi-input" data-field="status">
      <option value="Ready Now" selected>Ready Now</option>
      <option value="SOLD">SOLD</option>
    </select>
  </td>
`;
DOM.quickBody.appendChild(addTr);

DOM.quickBody.querySelectorAll('.qmi-delete').forEach(btn => {
  btn.addEventListener('click', async e => {
    const row = e.target.closest('tr');
    const id  = row.dataset.id;
    if (!id) return; // only saved rows can be deleted
    if (!confirm('Delete this home?')) return;
    const resp = await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, { method: 'DELETE' });
    if (!resp.ok) { console.error('Delete failed', await resp.text()); return; }
    await initQuickHomes();
    loadQuickHomes(monthKey);
  });
});

// Clear button (no API call)
DOM.quickBody.querySelectorAll('.qmi-clear').forEach(btn => {
  btn.addEventListener('click', e => {
    const row = e.target.closest('tr');
    row.querySelectorAll('.qmi-input').forEach(inp => { inp.value = ''; });
  });
});

  // Render Sold table
  DOM.soldBody.innerHTML = '';
  sold.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    tr.innerHTML = `
    <td>
      <button type="button" class="btn btn-sm btn-outline-danger sold-delete">Delete</button>
     </td>
      <td><input class="form-control sold-input" data-field="address" value="${rec.address}" /></td>
      <td><input type="date" class="form-control sold-input" data-field="listDate" value="${(rec.listDate || '').slice(0,10)}" /></td>
      <td>
        <select class="form-select sold-input" data-field="floorPlan">
          ${allFloorPlans.map(fp =>
            `<option value="${fp._id}"${fp._id===rec.floorPlan?' selected':''}>${fp.name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" class="form-control sold-input" data-field="listPrice" step="0.01" value="${rec.listPrice}" /></td>
       <td><input class="form-control sold-input" type="number" data-field="sqft"
                   value="${rec.sqft ?? (findPlan(rec.floorPlan)?.sqft ?? '')}" /></td>
      <td>
        <select class="form-select sold-input" data-field="status">
          <option value="Ready Now">Ready Now</option>
          <option value="SOLD" selected>SOLD</option>
        </select>
      </td>
      <td><input type="date" class="form-control sold-input" data-field="soldDate" value="${(rec.soldDate || '').slice(0,10)}" /></td>
      <td>
        <input class="form-control sold-input" type="number" step="0.01"
              data-field="soldPrice" value="${rec.soldPrice ?? ''}" />
      </td>  
   `;
    DOM.soldBody.appendChild(tr);
  });

  DOM.soldBody.querySelectorAll('.sold-delete').forEach(btn => {
  btn.addEventListener('click', async e => {
    const row = e.target.closest('tr');
    const id  = row.dataset.id;
    if (!id) return;
    if (!confirm('Delete this sold home?')) return;
    await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, { method: 'DELETE' });
    await initQuickHomes();
    loadQuickHomes(monthKey);
  });
});



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
      payload.month = monthKey;
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



  // Auto-save Sold
  DOM.soldBody.querySelectorAll('.sold-input').forEach(el => {
    el.addEventListener('change', async e => {
        if (e.target.dataset.field === 'soldDate') {
      const v = e.target.value; // from <input type="date">
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return; // wait until full date
    }

      const row = e.target.closest('tr');
      const id = row.dataset.id;
      const payload = {};
      row.querySelectorAll('.sold-input').forEach(inp => {
        payload[inp.dataset.field] = inp.value;
      });
       if (e.target.dataset.field === 'floorPlan') {
          const plan = findPlan(e.target.value);
          const sq   = plan?.sqft ?? null;
          const sqftInput = row.querySelector('.sold-input[data-field="sqft"]');
          if (sqftInput) sqftInput.value = sq ?? '';
          payload.sqft = sq;
        }
      payload.listPrice = numOrNull(payload.listPrice);
      payload.sqft      = numOrNull(payload.sqft);
      payload.soldPrice = numOrNull(payload.soldPrice);

     await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, {
        method: 'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
        
      await initQuickHomes();   // <<< refresh cache so soldDate is present
      loadQuickHomes(monthKey); // <<< now re-render with fresh data
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
