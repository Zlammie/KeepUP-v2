// client/assets/js/mcc/priceTable.js
import { PROFILE_API, PLANS_API } from './context.js';
import { createTask as createTaskApi, fetchTasks as fetchTasksApi } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const targetMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const TARGET_MONTH_KEY = `${targetMonthDate.getFullYear()}-${String(targetMonthDate.getMonth() + 1).padStart(2, '0')}`;
const BASE_PRICE_REASON_PREFIX = 'community-add-base-prices';
const COMMUNITY_ID =
  typeof window !== 'undefined'
    ? window?.MCC_BOOT?.communityId || document.body?.dataset?.communityId || ''
    : '';

export function priceTable() {
  const table = document.getElementById('monthTable');
  if (!table) return { load: async () => {} };
  const tbody = table.querySelector('tbody');
  const PRICES_API = `${PROFILE_API}/prices`;

  let currentMonth = null;
  let priceMap = {}; let t = null;

  const sqftVal = (plan) => {
    const raw =
      plan?.specs?.squareFeet ??
      plan?.squareFeet ??
      plan?.specs?.sqft ??
      plan?.sqft;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Infinity; // push unknown sqft to the bottom
  };

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
          refreshPriceWarnings();
        }, 400);
        refreshPriceWarnings();
      });
      input.addEventListener('blur', async () => {
        clearTimeout(t);
        try { priceMap = await putPrice(currentMonth, input.dataset.plan, (input.value === '' ? null : Number(input.value))); }
        catch(e){ console.error('save price', e); }
        refreshPriceWarnings();
      });
      refreshPriceWarnings();
    });
  }

  function refreshPriceWarnings() {
    const isTarget = currentMonth === TARGET_MONTH_KEY;
    tbody
      .querySelectorAll('input.plan-price-input')
      .forEach((input) => {
        const hasValue = input.value !== '' && !Number.isNaN(Number(input.value));
        input.classList.toggle('plan-price-input--warning', isTarget && !hasValue);
      });
  }

  async function load(month) {
    if (!month) return;
    currentMonth = month;
    const [plans, prices] = await Promise.all([ fetchPlans(), fetchPrices(month) ]);
    priceMap = prices || {};
    tbody.innerHTML = '';
    plans
      .slice()
      .sort((a, b) => sqftVal(a) - sqftVal(b))
      .forEach((p) => tbody.appendChild(buildRow(p)));
    wireInputs();
    refreshPriceWarnings();
    if (month === TARGET_MONTH_KEY) ensureBasePriceTask(month).catch((err) =>
      console.error('[mcc] failed to ensure base price task', err)
    );
  }

  return { load };
}

function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

async function ensureBasePriceTask(monthKey) {
  if (!COMMUNITY_ID || monthKey !== TARGET_MONTH_KEY) return;
  const reason = `${BASE_PRICE_REASON_PREFIX}-${monthKey}`.toLowerCase();

  let tasks = [];
  try {
    const response = await fetchTasksApi({
      linkedModel: 'Community',
      linkedId: COMMUNITY_ID,
      limit: 200
    });
    tasks = Array.isArray(response?.tasks) ? response.tasks : [];
  } catch (err) {
    console.error('[mcc] unable to read tasks for base price reminder', err);
    return;
  }

  const alreadyExists = tasks.some(
    (task) => String(task?.reason || '').trim().toLowerCase() === reason
  );
  if (alreadyExists) return;

  try {
    const response = await createTaskApi({
      title: `Add floor plan base prices for ${formatMonthLabel(monthKey)}`,
      description: 'Update the base prices for this community’s floor plans in Manage My Community Competition.',
      linkedModel: 'Community',
      linkedId: COMMUNITY_ID,
      type: 'Reminder',
      category: 'System',
      priority: 'Medium',
      status: 'Pending',
      autoCreated: true,
      reason
    });
    if (response?.task) emit('tasks:external-upsert', response.task);
  } catch (err) {
    console.error('[mcc] failed to create base price reminder task', err);
  }
}
