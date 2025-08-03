// loaders.js
import { competitionId } from './data.js';
import * as DOM from './dom.js';

// ───────── define loader functions ─────────
export async function loadMonth(month) {
  const [fps, prs] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/floorplans`).then(r=>r.json()),
    fetch(`/api/competitions/${competitionId}/price-records?month=${month}`).then(r=>r.json())
  ]);
  const prMap = {};
  prs.forEach(pr => prMap[pr.floorPlan] = pr);

  DOM.priceBody.innerHTML = '';
  fps.forEach(fp => {
    const ex = prMap[fp._id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fp.name}</td><td>${fp.sqft||''}</td>
      <td>${fp.bed||''}</td><td>${fp.bath||''}</td>
      <td>${fp.garage||''}</td><td>${fp.storyType}</td>
      <td>
        <input type="number" class="form-control price-input"
               data-fp="${fp._id}"
               value="${ex? ex.price : ''}" step="0.01" />
      </td>`;
    DOM.priceBody.appendChild(tr);
  });

  document.querySelectorAll('.price-input').forEach(input => {
    input.addEventListener('blur', async e => {
      const fpId  = e.target.dataset.fp;
      const price = parseFloat(e.target.value) || 0;
      const existing = prMap[fpId];
      const url    = existing
        ? `/api/competitions/${competitionId}/price-records/${existing._id}`
        : `/api/competitions/${competitionId}/price-records`;
      const method = existing ? 'PUT' : 'POST';
      const body   = existing ? { price } : { floorPlanId: fpId, month, price };

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

export async function loadQuickHomes(month) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/quick-moveins?month=${month}`
  ).then(r=>r.json());
  // …filter sold vs unsold, build rows, wire plan-change handlers…
}

export async function loadSales(month) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/sales-records?month=${month}`
  ).then(r=>r.json());
  // …render sold homes table, wire blur ⏩ save handlers…
}