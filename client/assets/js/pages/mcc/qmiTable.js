// client/assets/js/mcc/qmiTable.js
import { PROFILE_API, communityId } from './context.js';

export function qmiTable() {
  const table = document.getElementById('quickHomesTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');

  const QMI_GET_API = `${PROFILE_API}/qmi`; // GET ?month=YYYY-MM

  const fmtMoney = (n) => {
    const num = Number(n);
    return Number.isFinite(num)
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(num)
      : 'N/A';
  };
  const fmtDate = (d) => {
    if (!d) return 'N/A';
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime())
      ? 'N/A'
      : dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const safe = (s) => (s == null || s === '' ? 'N/A' : s);
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const addressCell = (home) => {
    const label = safe(home.address);
    if (!home?.lotId || !communityId) return esc(label);
    const href = `/address-details?communityId=${encodeURIComponent(communityId)}&lotId=${encodeURIComponent(home.lotId)}`;
    return `<a href="${href}" class="inventory-address-link">${esc(label)}</a>`;
  };

  function buildRow(h) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${addressCell(h)}</td>
      <td>${fmtDate(h.listDate)}</td>
      <td>${
        h.floorPlan
          ? `${safe(h.floorPlan.name)}${
              h.floorPlan.planNumber ? ` (${h.floorPlan.planNumber})` : ''
            }`
          : h.plan || 'N/A'
      }</td>
      <td>${fmtMoney(h.listPrice)}</td>
      <td>${h.sqft ? Number(h.sqft).toLocaleString() : 'N/A'}</td>
      <td>${fmtDate(h.expectedCompletionDate)}</td>
    `;
    return tr;
  }

  async function load(month) {
    if (!month) return;
    const res = await fetch(`${QMI_GET_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) {
      console.error('Failed to load QMI:', await res.text());
      return;
    }
    const data = await res.json();
    const homes = data.homes || data || []; // compat with both shapes
    tbody.innerHTML = '';
    homes.forEach((h) => tbody.appendChild(buildRow(h)));
  }

  return { load };
}
