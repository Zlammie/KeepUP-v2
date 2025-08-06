// public/assets/js/update-competition/loaders.js

import { competitionId, monthNames } from './data.js';
import * as DOM                        from './dom.js';

/**
 * 1) Floor-Plan Pricing loader
 *    Fetches all floor plans and price records for the given month,
 *    renders a table of name/sqft/bed/bath/garage/story + price input.
 */
export async function loadMonth(month) {
  // fetch both floorplans and price-records for this month
  const [fps, prs] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json()),
    fetch(`/api/competitions/${competitionId}/price-records?month=${month}`).then(r => r.json())
  ]);

  // map existing price-records by floorPlan id
  const prMap = {};
  prs.forEach(pr => prMap[pr.floorPlan] = pr);

  // clear & rebuild the price table body
  DOM.priceBody.innerHTML = '';
  fps.forEach(fp => {
    const existing = prMap[fp._id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fp.name}</td>
      <td>${fp.sqft || ''}</td>
      <td>${fp.bed   || ''}</td>
      <td>${fp.bath  || ''}</td>
      <td>${fp.garage|| ''}</td>
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

  // wire up blur on each price-input to save & reload
  document.querySelectorAll('.price-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const fpId  = e.target.dataset.fp;
      const price = parseFloat(e.target.value) || 0;
      const existing = prMap[fpId];

      const url    = existing
        ? `/api/competitions/${competitionId}/price-records/${existing._id}`
        : `/api/competitions/${competitionId}/price-records`;
      const method = existing ? 'PUT' : 'POST';
      const body   = existing
        ? { price }
        : { floorPlanId: fpId, month, price };

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // re-render this month after save
      loadMonth(month);
    });
  });
}

/**
 * 2) Quick-Move-Ins + Sold Homes loader
 *    - Inventory: homes listed by monthEnd and not sold before monthEnd
 *    - Sold-This-Month: homes whose soldDate is in [monthStart, monthEnd)
 */
export async function loadQuickHomes(month) {
  // fetch floorplans + ALL quick-movein records
  const [fps, recs] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json()),
    fetch(`/api/competitions/${competitionId}/quick-moveins`).then(r => r.json())
  ]);

  // compute month boundaries
  const [year, mon] = month.split('-').map(Number);
  const monthStart  = new Date(year, mon - 1, 1);
  const monthEnd    = new Date(year, mon,    1);

  // inventory = listed before monthEnd AND (not sold OR sold at/after monthEnd)
  const inventory = recs.filter(r => {
    const listD = new Date(r.listDate);
    if (listD >= monthEnd) return false;
    if (r.soldDate) {
      const soldD = new Date(r.soldDate);
      if (soldD < monthEnd) return false;
    }
    return true;
  });

  // sold-this-month = soldDate in [monthStart, monthEnd)
  const soldThisMonth = recs.filter(r => {
    if (!r.soldDate) return false;
    const soldD = new Date(r.soldDate);
    return soldD >= monthStart && soldD < monthEnd;
  });

  // common status dropdown
  const statusOpts = [
    '<option value="Ready Now">Ready Now</option>',
    '<option value="SOLD">SOLD</option>',
    ...monthNames.map(m => `<option value="${m}">${m}</option>`)
  ].join('');

  // ---- render Inventory table ----
  DOM.quickBody.innerHTML = '';
  inventory.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    tr.innerHTML = `
      <td><input class="form-control qmi-input" data-field="address" value="${rec.address}" /></td>
      <td><input type="date" class="form-control qmi-input" data-field="listDate"
                 value="${rec.listDate.slice(0,10)}" required /></td>
      <td>
        <select class="form-select qmi-input" data-field="floorPlanId">
          ${fps.map(fp =>
            `<option value="${fp._id}" ${fp._id===rec.floorPlan?'selected':''}>${fp.name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" step="0.01" class="form-control qmi-input" data-field="listPrice" value="${rec.listPrice}" /></td>
      <td><input type="number"        class="form-control qmi-input" data-field="sqft"      value="${rec.sqft}" /></td>
      <td>
        <select class="form-control qmi-input" data-field="status">
          ${statusOpts.replace(`value="${rec.status}"`, `value="${rec.status}" selected`)}
        </select>
      </td>`;
    DOM.quickBody.appendChild(tr);
  });

  // blank “new” row
  {
    const fpOpts = fps.map(fp => `<option value="${fp._id}">${fp.name}</option>`).join('');
    const newTr  = document.createElement('tr');
    newTr.dataset.id = '';
    newTr.innerHTML = `
      <td><input class="form-control qmi-input" data-field="address" placeholder="New address" required /></td>
      <td><input type="date" class="form-control qmi-input" data-field="listDate" required /></td>
      <td>
        <select class="form-control qmi-input" data-field="floorPlanId">
          <option value="">Select…</option>${fpOpts}
        </select>
      </td>
      <td><input type="number" step="0.01" class="form-control qmi-input" data-field="listPrice" /></td>
      <td><input type="number"        class="form-control qmi-input" data-field="sqft"      /></td>
      <td>
        <select class="form-control qmi-input" data-field="status">
          <option value="">Select…</option>${statusOpts}
        </select>
      </td>`;
    DOM.quickBody.appendChild(newTr);
  }

  // wire inventory inputs for save & reload
  DOM.quickBody.querySelectorAll('.qmi-input').forEach(el => {
    el.addEventListener('change', async e => {
      const row     = e.target.closest('tr');
      const id      = row.dataset.id;
      const payload = { month };
      row.querySelectorAll('.qmi-input').forEach(inp => {
        const v = inp.value, f = inp.dataset.field;
        payload[f] = (f==='listPrice'||f==='sqft') ? parseFloat(v)||0 : v;
      });
      if (!payload.address || !payload.floorPlanId || !payload.status || !payload.listDate) return;
      const url    = id
        ? `/api/competitions/${competitionId}/quick-moveins/${id}`
        : `/api/competitions/${competitionId}/quick-moveins`;
      const method = id ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      loadQuickHomes(month);
    });
  });

  // ---- render Sold-This-Month table ----
  DOM.soldBody.innerHTML = '';
  soldThisMonth.forEach(rec => {
    const tr = document.createElement('tr');
    tr.dataset.id = rec._id;
    tr.innerHTML = `
      <td><input class="form-control sold-input" data-field="address"  value="${rec.address}" /></td>
      <td>
        <select class="form-control sold-input" data-field="floorPlanId">
          ${fps.map(fp =>
            `<option value="${fp._id}" ${fp._id===rec.floorPlan?'selected':''}>${fp.name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" class="form-control sold-input" data-field="listPrice" value="${rec.listPrice}" /></td>
      <td><input type="number" class="form-control sold-input" data-field="sqft"      value="${rec.sqft}"      /></td>
      <td>
        <select class="form-control sold-input" data-field="status">
          ${statusOpts.replace(`value="${rec.status}"`, `value="${rec.status}" selected`)}
        </select>
      </td>
      <td><input type="date" class="form-control sold-input" data-field="listDate" value="${(rec.listDate||'').slice(0,10)}" /></td>
      <td><input type="date" class="form-control sold-input" data-field="soldDate"  value="${(rec.soldDate||'').slice(0,10)}" /></td>`;
    DOM.soldBody.appendChild(tr);
  });

  // wire sold-row inputs for save
  DOM.soldBody.querySelectorAll('.sold-input').forEach(el => {
    el.addEventListener('change', async e => {
      const row     = e.target.closest('tr');
      const id      = row.dataset.id;
      const payload = {};
      row.querySelectorAll('.sold-input').forEach(inp => {
        const v = inp.value, f = inp.dataset.field;
        payload[f] = (f==='listPrice'||f==='sqft') ? parseFloat(v)||0 : v;
      });
      await fetch(`/api/competitions/${competitionId}/quick-moveins/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    });
  });
}

/**
 * 3) Sales Records loader
 *    Fetch the single record for this month, render sales/cancels/closings.
 */
export async function loadSales(month) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/sales-records?month=${month}`
  ).then(r => r.json());
  const r = recs[0] || {};

  DOM.salesBody.innerHTML = '';
  const tr = document.createElement('tr');
  tr.dataset.id    = r._id || '';
  tr.dataset.month = month;
  const mIndex = parseInt(month.split('-')[1], 10) - 1;
  tr.innerHTML = `
    <td>${monthNames[mIndex]}</td>
    <td><input type="number" class="form-control sales-input" data-field="sales"   value="${r.sales||''}"   /></td>
    <td><input type="number" class="form-control sales-input" data-field="cancels" value="${r.cancels||''}" /></td>
    <td class="net-cell">${r.sales ? r.sales - r.cancels : ''}</td>
    <td><input type="number" class="form-control sales-input" data-field="closings" value="${r.closings||''}" /></td>`;
  DOM.salesBody.appendChild(tr);

  tr.querySelectorAll('.sales-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const row     = e.target.closest('tr');
      const id      = row.dataset.id;
      const sales   = parseInt(row.querySelector('[data-field="sales"]').value)   || 0;
      const cancels = parseInt(row.querySelector('[data-field="cancels"]').value) || 0;
      const closings= parseInt(row.querySelector('[data-field="closings"]').value)|| 0;
      row.querySelector('.net-cell').textContent = sales - cancels;

      const payload = { sales, cancels, closings };
      let url    = `/api/competitions/${competitionId}/sales-records`;
      let method = 'POST';
      if (id) {
        url    += `/${id}`;
        method  = 'PUT';
      } else {
        payload.month = month;
      }
      await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    });
  });
}
