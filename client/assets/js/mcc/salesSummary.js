// client/assets/js/mcc/salesSummary.js
import { PROFILE_API } from './context.js';

export function salesSummary() {
  const table = document.getElementById('salesTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');
  const SALES_API = `${PROFILE_API}/sales-summary`;

  let currentMonth = null; let t = null;

  const ymLabel = (ym) => {
    if (!ym || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return '—';
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  };
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

  function buildRow(state) {
    const net = Math.max(0, num(state.sales) - num(state.cancels));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ymLabel(currentMonth)}</td>
      <td><input type="number" min="0" step="1" id="salesCount"    class="form-control form-control-sm" value="${state.sales ?? 0}"></td>
      <td><input type="number" min="0" step="1" id="salesCancels"  class="form-control form-control-sm" value="${state.cancels ?? 0}"></td>
      <td><input type="number" min="0" step="1" id="salesNet"      class="form-control form-control-sm" value="${net}" readonly></td>
      <td><input type="number" min="0" step="1" id="salesClosings" class="form-control form-control-sm" value="${state.closings ?? 0}"></td>
    `;
    return tr;
  }

  function wireInputs() {
    const salesEl    = tbody.querySelector('#salesCount');
    const cancelsEl  = tbody.querySelector('#salesCancels');
    const netEl      = tbody.querySelector('#salesNet');
    const closingsEl = tbody.querySelector('#salesClosings');

    const recompute = () => { netEl.value = Math.max(0, num(salesEl.value) - num(cancelsEl.value)); };

    const save = async () => {
      const payload = { month: currentMonth, sales: num(salesEl.value), cancels: num(cancelsEl.value), closings: num(closingsEl.value) };
      const r = await fetch(SALES_API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text());
    };

    const debouncedSave = () => { clearTimeout(t); t = setTimeout(() => save().catch(console.error), 400); };

    [salesEl, cancelsEl, closingsEl].forEach(el => {
      el.addEventListener('input', () => { recompute(); debouncedSave(); });
      el.addEventListener('blur', () => { recompute(); save().catch(console.error); });
    });
  }

  async function load(month) {
    if (!month) return;
    currentMonth = month;
    const r = await fetch(`${SALES_API}?month=${encodeURIComponent(month)}`);
    if (!r.ok) { console.error('Failed to load sales summary:', await r.text()); return; }
    const data = await r.json();
    tbody.innerHTML = ''; tbody.appendChild(buildRow({
      sales: data.sales ?? 0, cancels: data.cancels ?? 0, closings: data.closings ?? 0
    }));
    wireInputs();
  }

  return { load };
}
