import { fmt } from './utils.js';

function deriveRemainingLots(c) {
  if (typeof c.remainingLots === 'number') return c.remainingLots;
  if (typeof c.totalLots === 'number' && typeof c.soldLots === 'number')
    return Math.max(c.totalLots - c.soldLots, 0);
  if (typeof c.totalLots === 'number') return c.totalLots;
  return 0;
}
function deriveQMI(c) {
  if (typeof c.qmi === 'number') return c.qmi;
  if (typeof c.quickMoveIns === 'number') return c.quickMoveIns;
  if (Array.isArray(c.monthlyMetrics) && c.monthlyMetrics.length) {
    const last = c.monthlyMetrics.at(-1);
    if (typeof last?.qmi === 'number') return last.qmi;
    if (typeof last?.inventory === 'number') return last.inventory;
  }
  return 0;
}
function deriveLotSize(c) {
  return c.lotSize ?? c.avgLotSize ?? '';
}

export function renderTable(comps) {
  if (!Array.isArray(comps) || !comps.length)
    return '<p>No competitions found.</p>';

  let html = `
  <div class="table-responsive">
    <table id="compsTable" class="table table-striped align-middle">
      <thead>
        <tr>
          <th class="actions-col">Actions</th>
          <th>Community</th>
          <th>Builder</th>
          <th>City</th>
          <th class="num">Remaining Lots</th>
          <th class="num">QMI</th>
          <th class="num">Lot Size</th>
          <th class="del-col text-end">Delete</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const c of comps) {
    const remaining = deriveRemainingLots(c);
    const qmi = deriveQMI(c);
    const lotSize = deriveLotSize(c);

    html += `
      <tr data-id="${c._id}">
        <td class="actions-col">
          <a href="/competition-details/${c._id}" class="btn btn-sm btn-primary">View</a>
        </td>
        <td>${c.communityName ?? ''}</td>
        <td>${c.builderName ?? ''}</td>
        <td>${c.city ?? ''}</td>
        <td class="num">${fmt(remaining)}</td>
        <td class="num">${fmt(qmi)}</td>
        <td class="num">${lotSize ?? ''}</td>
        <td class="del-col text-end">
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${c._id}" title="Delete competition">✕</button>
        </td>
      </tr>
    `;
  }
  html += `</tbody></table></div>`;
  return html;
}
