// client/assets/js/mcc/qmiTable.js
import { PROFILE_API } from './context.js';

export function qmiTable() {
  const table = document.getElementById('quickHomesTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');

  const QMI_GET_API = `${PROFILE_API}/qmi`; // GET ?month=YYYY-MM
  const QMI_PUT_API = `${PROFILE_API}/qmi`; // PUT { month, excludeLotId }

  let currentMonth = null;

  const fmtMoney = (n) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = (d instanceof Date) ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? '—' :
      dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const safe = (s) => (s == null || s === '' ? '—' : s);

  async function exclude(lotId) {
    if (!currentMonth) return;
    const res = await fetch(QMI_PUT_API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ month: currentMonth, excludeLotId: lotId }) });
    if (!res.ok) throw new Error(await res.text());
  }

  function buildRow(h) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width:42px"><button type="button" class="btn btn-sm btn-outline-danger qmi-del" data-id="${h.lotId || ''}">✕</button></td>
      <td>${safe(h.address)}</td>
      <td>${fmtDate(h.listDate)}</td>
      <td>${h.floorPlan ? `${safe(h.floorPlan.name)}${h.floorPlan.planNumber ? ` (${h.floorPlan.planNumber})` : ''}` : (h.plan || '—')}</td>
      <td>${fmtMoney(h.listPrice)}</td>
      <td>${h.sqft ? Number(h.sqft).toLocaleString() : '—'}</td>
      <td>${safe(h.status)}</td>
    `;
    return tr;
  }

  async function load(month) {
    if (!month) return;
    currentMonth = month;
    const res = await fetch(`${QMI_GET_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) { console.error('Failed to load QMI:', await res.text()); return; }
    const data = await res.json();
    const homes = data.homes || data || []; // compat with both shapes
    tbody.innerHTML = '';
    homes.forEach(h => tbody.appendChild(buildRow(h)));
    tbody.querySelectorAll('.qmi-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lotId = btn.getAttribute('data-id'); if (!lotId) return;
        try { await exclude(lotId); btn.closest('tr')?.remove(); }
        catch (e) { console.error('Exclude failed', e); alert('Failed to remove from this month.'); }
      });
    });
  }

  return { load };
}
