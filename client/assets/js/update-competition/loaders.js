// public/assets/js/update-competition/loaders.js

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
  const sold = allQuickHomes.filter(r => r.status === 'SOLD');


  // Render Quick-Move-Ins table
  DOM.quickBody.innerHTML = '';
  unsold.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    tr.innerHTML = `
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
      <td><input type="number" class="form-control qmi-input" data-field="sqft" value="${rec.sqft}" /></td>
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
  </td>`;
DOM.quickBody.appendChild(addTr);

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
          ${allFloorPlans.map(fp =>
            `<option value="${fp._id}"${fp._id===rec.floorPlan?' selected':''}>${fp.name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" class="form-control sold-input" data-field="listPrice" step="0.01" value="${rec.listPrice}" /></td>
      <td><input type="number" class="form-control sold-input" data-field="sqft" value="${rec.sqft}" /></td>
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

  // Auto-save Quick-Move-Ins
  DOM.quickBody.querySelectorAll('.qmi-input').forEach(el => {
    el.addEventListener('change', async e => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      const payload = {};
      row.querySelectorAll('.qmi-input').forEach(inp => {
        payload[inp.dataset.field] = inp.value;
      });
      payload.listPrice = parseFloat(payload.listPrice) || 0;
      payload.sqft = parseFloat(payload.sqft) || 0;

      const url = id
        ? `/api/competitions/${competitionId}/quick-moveins/${id}`
        : `/api/competitions/${competitionId}/quick-moveins`;
      const method = id ? 'PUT' : 'POST';
     await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
     await initQuickHomes();
     loadQuickHomes(monthKey);
    });
  });

  // Auto-save Sold
  DOM.soldBody.querySelectorAll('.sold-input').forEach(el => {
    el.addEventListener('change', async e => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      const payload = {};
      row.querySelectorAll('.sold-input').forEach(inp => {
        payload[inp.dataset.field] = inp.value;
      });
      payload.listPrice = parseFloat(payload.listPrice) || 0;
      payload.sqft = parseFloat(payload.sqft) || 0;

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
  const r = recs[0] || {};

  DOM.salesBody.innerHTML = '';
  const tr = document.createElement('tr');
  tr.dataset.id    = r._id || '';
  tr.dataset.month = monthKey;
  tr.innerHTML = `
    <td>${r.month}</td>
    <td><input type="number" class="form-control sales-input" data-field="sales" value="${r.sales||''}" /></td>
    <td><input type="number" class="form-control sales-input" data-field="cancels" value="${r.cancels||''}" /></td>
    <td class="net-cell">${r.sales ? r.sales - r.cancels : ''}</td>
    <td><input type="number" class="form-control sales-input" data-field="closings" value="${r.closings||''}" /></td>`;
  DOM.salesBody.appendChild(tr);

  tr.querySelectorAll('.sales-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const row      = e.target.closest('tr');
      const id       = row.dataset.id;
      const sales    = parseInt(row.querySelector('[data-field="sales"]').value,   10) || 0;
      const cancels  = parseInt(row.querySelector('[data-field="cancels"]').value, 10) || 0;
      const closings = parseInt(row.querySelector('[data-field="closings"]').value,10) || 0;
      row.querySelector('.net-cell').textContent = sales - cancels;

      const payload = { sales, cancels, closings };
      let url     = `/api/competitions/${competitionId}/sales-records`;
      let method  = 'POST';
      if (id) { url += `/${id}`; method = 'PUT'; }
      else    { payload.month = monthKey; }
      await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    });
  });
}