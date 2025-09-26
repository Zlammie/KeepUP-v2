// client/assets/js/mcc/priceTable.js
import { PROFILE_API, PLANS_API } from './context.js';

export function priceTable() {
  const table = document.getElementById('monthTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');
  const PRICES_API = `${PROFILE_API}/prices`;

  let currentMonth = null;
  let priceMap = {}; let t = null;

  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString() : (n ?? '—'));
  const safe = (s) => (s == null || s === '' ? '—' : s);

  const fetchPlans  = async () => { const r = await fetch(PLANS_API);  if(!r.ok) throw new Error(await r.text()); return r.json(); };
  const fetchPrices = async (m)   => { const r = await fetch(`${PRICES_API}?month=${encodeURIComponent(m)}`); if(!r.ok) throw new Error(await r.text()); const d=await r.json(); return d.prices||{}; };
  const putPrice    = async (m,p,v)=> { const r = await fetch(PRICES_API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:m,plan:p,price:v})}); if(!r.ok) throw new Error(await r.text()); const d=await r.json(); return d.prices||{}; };

  function buildRow(plan) {
    const sq=plan?.specs?.squareFeet, beds=plan?.specs?.beds, baths=plan?.specs?.baths, garage=plan?.specs?.garage;
    const price = priceMap[plan._id] ?? '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${safe(plan?.name)}${plan?.planNumber ? ` (${plan.planNumber})` : ''}</td>
      <td>${fmt(sq)}</td><td>${fmt(beds)}</td><td>${fmt(baths)}</td><td>${fmt(garage)}</td>
      <td>—</td>
      <td><input type="number" min="0" step="1000" class="form-control form-control-sm plan-price-input" data-plan="${plan._id}" value="${price}"></td>
    `;
    return tr;
  }

  function wireInputs() {
    tbody.querySelectorAll('input.plan-price-input').forEach(input => {
      input.addEventListener('input', () => {
        const planId = input.dataset.plan;
        const v = input.value === '' ? undefined : Number(input.value) || 0;
        priceMap[planId] = v;
        clearTimeout(t); t = setTimeout(async () => {
          try { priceMap = await putPrice(currentMonth, planId, input.value === '' ? null : Number(input.value)); }
          catch(e){ console.error('save price', e); }
        }, 400);
      });
      input.addEventListener('blur', async () => {
        clearTimeout(t);
        try { priceMap = await putPrice(currentMonth, input.dataset.plan, (input.value === '' ? null : Number(input.value))); }
        catch(e){ console.error('save price', e); }
      });
    });
  }

  async function load(month) {
    if (!month) return;
    currentMonth = month;
    const [plans, prices] = await Promise.all([ fetchPlans(), fetchPrices(month) ]);
    priceMap = prices || {};
    tbody.innerHTML = ''; plans.forEach(p => tbody.appendChild(buildRow(p)));
    wireInputs();
  }

  return { load };
}
