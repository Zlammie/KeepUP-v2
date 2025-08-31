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

let currentCharts = [];

function destroyCharts() {
  currentCharts.forEach(ch => ch?.destroy?.());
  currentCharts = [];
}

function dollars(v) { return v == null ? 'n/a' : `$${Number(v).toLocaleString()}`; }
function commify(v) { return Number(v).toLocaleString(); }

// --- initial: load communities into selector
(async function init() {
  try {
    const list = await fetch('/api/communities/select-options').then(r=>r.json());
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

async function refreshAll() {
  const id = dd.value;
  if (!id) return;

  const months = Number(monthsEl.value || 12);

  destroyCharts();
  // linked builders (+ basic profile)
  const { profile } = await fetch(`/api/my-community-competition/${id}`).then(r=>r.json());
  renderLinked(profile?.linkedCompetitions || []);

  // lot counts
  const stats = await fetch(`/api/communities/${id}/lot-stats`).then(r=>r.json());
  lcTotal.textContent = stats.total ?? '—';
  lcSold.textContent  = stats.sold ?? '—';
  lcRem.textContent   = stats.remaining ?? '—';
  lcQmi.textContent   = stats.quickMoveInLots ?? '—';

  // QMI/Sold scatter (x = sqft, y = price)
  await drawQmiSolds(id);

  // Sales pie (12 mo window based on "months" selector)
  await drawSalesPie(id, months);

  // Base price comparison (line) + build table
  await drawBasePrice(id, months);
}

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

async function drawQmiSolds(communityId) {
  const res = await fetch(`/api/communities/${communityId}/qmi-solds-scatter`).then(r=>r.json());
  const qmi  = (res.qmi  || []).sort((a,b)=>a.x-b.x);
  const sold = (res.sold || []).sort((a,b)=>a.x-b.x);

  const ctx = qmiSoldsCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    data: {
      datasets: [
        { label: 'Quick Move-Ins', type: 'scatter', data: qmi,  pointRadius: 4, showLine: true, tension: 0.25 },
        { label: 'SOLD',           type: 'scatter', data: sold, pointRadius: 4, showLine: true, tension: 0.25 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          const sqft = commify(d.x);
          const price = dollars(d.y);       // y is price
          const plan = d.plan ? ` – ${d.plan}` : '';
          const addr = d.address ? `\n${d.address}` : '';
          return `${ctx.dataset.label}${plan}: ${price} @ ${sqft} sqft${addr}`;
        }
      }}},
      scales: {
        x: { title: { display: true, text: 'Square Feet' }, ticks: { callback: v => commify(v) } },
        y: { title: { display: true, text: 'Price ($)' },   ticks: { callback: v => `$${commify(v)}` } }
      }
    }
  });
  currentCharts.push(chart);
}

async function drawSalesPie(communityId, months) {
  const res = await fetch(`/api/community-profiles/${communityId}/sales?months=${months}`).then(r=>r.json());
  const s = res.series || { sales:[], cancels:[], closings:[] };
  const totalSales   = (s.sales   || []).reduce((a,b)=>a+(+b||0),0);
  const totalCancels = (s.cancels || []).reduce((a,b)=>a+(+b||0),0);
  const totalClose   = (s.closings|| []).reduce((a,b)=>a+(+b||0),0);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Sales', 'Cancels', 'Closings'],
      datasets: [{ data: [totalSales, totalCancels, totalClose] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
  currentCharts.push(chart);
}

async function drawBasePrice(communityId, months) {
  const res = await fetch(`/api/community-profiles/${communityId}/base-prices?months=${months}`).then(r=>r.json());
  const { labels, datasets } = res;

  // line chart
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
  // header
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
