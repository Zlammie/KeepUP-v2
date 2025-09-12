// /client/assets/js/competition-dashboard/index.js
const body = document.body;
const preId = body.dataset.communityId || '';

const dd = document.getElementById('dashCommunity');
const monthsEl = document.getElementById('dashMonths');
const refreshBtn = document.getElementById('dashRefresh');

const linkedWrap = document.getElementById('dashLinkedBuilders');

const qmiSoldsCanvas = document.getElementById('qmiSoldsChart');
const salesPieCanvas = document.getElementById('salesPieChart');
const baseCanvas     = document.getElementById('basePriceChart');
const baseChartWrap  = document.getElementById('baseChartWrap');
const baseTableWrap  = document.getElementById('baseTableWrap');
const baseTable      = document.getElementById('baseTable');
const toggleBaseMode = document.getElementById('toggleBaseMode');

const lcTotal = document.getElementById('lcTotal');
const lcSold  = document.getElementById('lcSold');
const lcRem   = document.getElementById('lcRemaining');
const lcQmi   = document.getElementById('lcQmi');

const salesWindowEl = document.getElementById('dashSalesWindow');

let currentCharts = [];

// ---------- helpers ----------
function destroyCharts() {
  currentCharts.forEach(ch => ch?.destroy?.());
  currentCharts = [];
}
function dollars(v) { return v == null ? 'n/a' : `$${Number(v).toLocaleString()}`; }
function commify(v) { return Number(v).toLocaleString(); }

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status} for ${url}\n${text.slice(0, 400)}`);
  }
  return r.json();
}

// ---------- init ----------
(async function init() {
  try {
    const list = await getJSON('/api/communities/select-options');
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name || c._id;
      dd.appendChild(opt);
    });
    if (preId && list.find(x => x._id === preId)) {
      dd.value = preId;
      await refreshAll();
    }
  } catch (e) {
    console.error('Init failed:', e);
  }
})();

dd.addEventListener('change', refreshAll);
refreshBtn.addEventListener('click', refreshAll);

toggleBaseMode.addEventListener('click', () => {
  const tableMode = !baseTableWrap.classList.contains('d-none');
  if (tableMode) {
    baseTableWrap.classList.add('d-none');
    baseChartWrap.classList.remove('d-none');
    toggleBaseMode.textContent = 'Table';
  } else {
    baseChartWrap.classList.add('d-none');
    baseTableWrap.classList.remove('d-none');
    toggleBaseMode.textContent = 'Chart';
  }
});

// ---------- charts ----------
async function drawQmiSoldsMulti(communityIds) {
  if (!Array.isArray(communityIds)) communityIds = [communityIds].filter(Boolean);
  const url = `/api/communities/multi/qmi-solds-scatter?ids=${communityIds.join(',')}`;
  const res = await getJSON(url);
  if (!Array.isArray(res)) {
    console.warn('Unexpected payload from multi qmi/solds:', res);
    return;
  }

  const datasets = res.flatMap(entry => ([
    { label: `${entry.name} – Quick Move-Ins`, type: 'scatter',
      data: (entry.qmi || []).sort((a,b)=>a.x-b.x), pointRadius: 3, showLine: true, tension: 0.25 },
    { label: `${entry.name} – SOLD`, type: 'scatter',
      data: (entry.sold|| []).sort((a,b)=>a.x-b.x), pointRadius: 3, showLine: true, tension: 0.25 }
  ]));

  const ctx = qmiSoldsCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          const sqft = Number(d.x).toLocaleString();
          const price = `$${Number(d.y).toLocaleString()}`;
          const plan  = d.plan ? ` – ${d.plan}` : '';
          const addr  = d.address ? `\n${d.address}` : '';
          return `${ctx.dataset.label}${plan}: ${price} @ ${sqft} sqft${addr}`;
        }
      }}},
      scales: {
        x: { title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
        y: { title: { display: true, text: 'Price ($)' },   ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
      }
    }
  });
  currentCharts.push(chart);
}

async function drawSalesPie(communityId, months) {
  const res = await getJSON(`/api/community-profiles/${communityId}/sales?months=${months}`);
  const s = res.series || { sales:[], cancels:[], closings:[] };
  const totalSales   = (s.sales   || []).reduce((a,b)=>a+(+b||0),0);
  const totalCancels = (s.cancels || []).reduce((a,b)=>a+(+b||0),0);
  const totalClose   = (s.closings|| []).reduce((a,b)=>a+(+b||0),0);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: { labels: ['Sales', 'Cancels', 'Closings'], datasets: [{ data: [totalSales, totalCancels, totalClose] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
  currentCharts.push(chart);
}

  async function drawSalesTotalsPie(communityOrCompetitionIds, windowKey) {
  if (!Array.isArray(communityOrCompetitionIds)) communityOrCompetitionIds = [communityOrCompetitionIds].filter(Boolean);
  const idsParam = communityOrCompetitionIds.join(',');
  const { labels, data } = await getJSON(`/api/competitions/multi/sales-totals?ids=${idsParam}&window=${encodeURIComponent(windowKey)}`);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ label: 'Sales', data }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
  currentCharts.push(chart);
}
async function drawBasePrice(communityId, months) {
  let res;
  // 1) Try the path your dashboard originally used
  try {
    res = await getJSON(`/api/community-profiles/${communityId}/base-prices?months=${months}`);
  } catch (e1) {
    console.warn('fallback to /api/community-competition-profiles/... base-prices:', e1.message);
    // 2) Fallback: some installs use this namespace
    try {
      res = await getJSON(`/api/community-competition-profiles/${communityId}/base-prices?months=${months}`);
    } catch (e2) {
      console.error('base-prices failed on both paths:', e2.message);
      // Show an informative empty state
      baseTable.innerHTML = `<thead><tr><th>Plan</th><th>${months} mo</th></tr></thead>
        <tbody><tr><td colspan="2" class="text-muted">No base price data found.</td></tr></tbody>`;
      return;
    }
  }

  const labels = Array.isArray(res?.labels) ? res.labels : [];
  const datasets = Array.isArray(res?.datasets) ? res.datasets : [];

  if (!labels.length || !datasets.length) {
    console.warn('Base price payload had no labels/datasets:', res);
    baseTable.innerHTML = `<thead><tr><th>Plan</th><th>${months} mo</th></tr></thead>
      <tbody><tr><td colspan="2" class="text-muted">No base price data found.</td></tr></tbody>`;
    return;
  }


  // ---- Line chart (unchanged) ----
  const ctx = baseCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    data: {
      labels,
      datasets: (datasets||[]).map(d => ({
        label: d.label, data: d.data, type: 'line', borderWidth: 2, tension: 0.25, spanGaps: true
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${dollars(ctx.parsed.y)}`
      }}},
      scales: {
        y: { title: { display: true, text: 'Base Price ($)' }, ticks: { callback: v => `$${commify(v)}` } },
        x: { title: { display: true, text: 'Month' } }
      }
    }
  });
  currentCharts.push(chart);

  // table view
  baseTable.innerHTML = '';
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  hrow.innerHTML = `<th>Plan</th>${labels.map(l=>`<th>${l}</th>`).join('')}`;
  thead.appendChild(hrow);
  baseTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  (datasets||[]).forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.label}</td>` + d.data.map(v => `<td>${v==null?'—':dollars(v)}</td>`).join('');
    tbody.appendChild(tr);
  });
  baseTable.appendChild(tbody);
}

// ---------- UI ----------
function renderLinked(list) {
  linkedWrap.innerHTML = '';
  if (!list.length) {
    linkedWrap.innerHTML = '<span class="text-muted">No builders linked.</span>';
    return;
  }
  list.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'badge rounded-pill text-bg-secondary';
    chip.textContent = c.name || c.builder || 'Builder';
    linkedWrap.appendChild(chip);
  });
}

// ---------- main refresh ----------
async function refreshAll() {
  const id = dd.value;
  if (!id) return;
  const months = Number(monthsEl.value || 12);

  destroyCharts();

  // 1) profile + linked chips
  const { profile } = await getJSON(`/api/my-community-competition/${id}`);
  renderLinked(profile?.linkedCompetitions || []);

  // 2) build id list for multi-scatter
  const linkedIds = Array.isArray(profile?.linkedCompetitions) ? profile.linkedCompetitions.map(c => c._id) : [];
  const allIds = [...new Set([id, ...linkedIds].filter(Boolean))];

  // 3) scatter (multi)
  await drawQmiSoldsMulti(allIds);

  // 4) lot counts (single)
  const stats = await getJSON(`/api/communities/${id}/lot-stats`);
  lcTotal.textContent = stats.total ?? '—';
  lcSold.textContent  = stats.sold ?? '—';
  lcRem.textContent   = stats.remaining ?? '—';
  lcQmi.textContent   = stats.quickMoveInLots ?? '—';

  // 5) pie + base price (single)
  const salesWindow = (salesWindowEl?.value) || '90d';
await drawSalesTotalsPie(allIds, salesWindow);  // multi-community totals pie
await drawBasePrice(id, months);
}
