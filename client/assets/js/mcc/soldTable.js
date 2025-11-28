// client/assets/js/mcc/soldTable.js
import { PROFILE_API } from './context.js';

export function soldTable() {
  const table = document.getElementById('soldHomesTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');
  const SOLD_GET_API = `${PROFILE_API}/sales`;

  const fmtMoney = (n) => {
    const num = Number(n);
    return Number.isFinite(num)
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(num)
      : '�?"';
  };
  const fmtDate = (d) => {
    if (!d) return '�?"';
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(d)) return d;
    const dt = new Date(d);
    return Number.isNaN(dt.getTime())
      ? String(d)
      : dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const safe = (s) => (s == null || s === '' ? '�?"' : s);

  function buildRow(h) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${safe(h.address)}</td>
      <td>${fmtDate(h.listDate)}</td>
      <td>${
        h.floorPlan
          ? `${safe(h.floorPlan.name)}${
              h.floorPlan.planNumber ? ` (${h.floorPlan.planNumber})` : ''
            }`
          : h.plan || '�?"'
      }</td>
      <td>${fmtMoney(h.listPrice)}</td>
      <td>${h.sqft ? Number(h.sqft).toLocaleString() : '�?"'}</td>
      <td>${fmtDate(h.soldDate)}</td>
      <td>${fmtMoney(h.soldPrice)}</td>
    `;
    return tr;
  }

  async function load(month) {
    if (!month) return;
    const res = await fetch(`${SOLD_GET_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) {
      console.error('Failed to load sold homes:', await res.text());
      return;
    }
    const data = await res.json();
    const sales = data.sales || data || [];
    tbody.innerHTML = '';
    sales.forEach((h) => tbody.appendChild(buildRow(h)));
  }

  return { load };
}
