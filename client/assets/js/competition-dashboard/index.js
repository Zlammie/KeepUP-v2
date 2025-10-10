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
const baseMonthEl    = document.getElementById('baseMonth');
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
function friendlyMonthLabel(value) {
  if (!value) return '';
  const str = String(value).trim();

  const parts = str.split('-');
  if (parts.length >= 2) {
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 0 && month < 12) {
      const d = new Date(year, month, 1);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      }
    }
  }

  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  }

  return str;
}

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
      const id = c._id || c.id;
      if (!id) return;

      const name = c.name || c.communityName || '';
      const builder = c.builder || c.builderName || '';
      const labelBase = name || c.label || String(id);
      const label = c.label || (builder ? `${builder} - ${labelBase}` : labelBase);

      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
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

if (baseMonthEl) {
  baseMonthEl.addEventListener('change', () => {
    const id = dd.value;
    if (id) drawBasePrice(id).catch(console.error);
  });
}

// ---------- charts ----------
async function drawQmiSoldsMulti(communityIds) {
  if (!Array.isArray(communityIds)) communityIds = [communityIds].filter(Boolean);
  if (!communityIds.length) return;

  const idParam = communityIds.map(id => encodeURIComponent(id)).join(',');
  const url = `/api/communities/multi/qmi-solds-scatter?ids=${idParam}`;
  const res = await getJSON(url);
  if (!Array.isArray(res)) {
    console.warn('Unexpected payload from multi qmi/solds:', res);
    return;
  }

  const planText = (plan) => {
    if (!plan) return '';
    if (typeof plan === 'string') return plan;
    const name = plan?.name ? String(plan.name).trim() : '';
    const num = plan?.planNumber ? String(plan.planNumber).trim() : '';
    if (name && num) return `${name} (#${num})`;
    return name || num;
  };

  const toPoint = (item, primaryKey, secondaryKey) => {
    if (!item) return null;
    const sqft = Number(item.x ?? item.sqft);
    const priceCandidate = item.y ?? item[primaryKey] ?? (secondaryKey ? item[secondaryKey] : undefined);
    const price = Number(priceCandidate);
    if (!Number.isFinite(sqft) || !Number.isFinite(price)) return null;
    return {
      x: sqft,
      y: price,
      plan: planText(item.plan),
      address: item.address || '',
      month: item.month || null
    };
  };

  const datasets = [];

  res.forEach(entry => {
    const baseLabel = entry.name || entry.id || 'Community';

    const qmiPoints = (entry.qmi || [])
      .map(item => toPoint(item, 'listPrice', 'soldPrice'))
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (qmiPoints.length) {
      datasets.push({
        label: `${baseLabel} - Quick Move-Ins`,
        type: 'scatter',
        data: qmiPoints,
        pointRadius: 3,
        showLine: true,
        tension: 0.25
      });
    }

    const soldPoints = (entry.sold || [])
      .map(item => toPoint(item, 'soldPrice', 'listPrice'))
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (soldPoints.length) {
      datasets.push({
        label: `${baseLabel} - SOLD`,
        type: 'scatter',
        data: soldPoints,
        pointRadius: 3,
        showLine: true,
        tension: 0.25
      });
    }
  });

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
          const plan  = d.plan ? ` - ${d.plan}` : '';
          const addr  = d.address ? `\n${d.address}` : '';
          const month = d.month ? `\nMonth: ${d.month}` : '';
          return `${ctx.dataset.label}${plan}: ${price} @ ${sqft} sqft${addr}${month}`;
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
  if (!communityOrCompetitionIds.length) return;

  const idsParam = communityOrCompetitionIds.map(id => encodeURIComponent(id)).join(',');
  const { labels = [], data = [], breakdown = [] } = await getJSON(`/api/competitions/multi/sales-totals?ids=${idsParam}&window=${encodeURIComponent(windowKey)}`);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        label: 'Net Sales',
        data,
        meta: breakdown
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed) || 0;
              const meta = ctx.dataset.meta?.[ctx.dataIndex] || {};
              const sales = meta?.totals?.sales ?? 0;
              const cancels = meta?.totals?.cancels ?? 0;
              const closings = meta?.totals?.closings ?? 0;
              const parts = [
                `${ctx.label || 'Community'}: ${value}`,
                `Sales: ${sales}`,
                `Cancels: ${cancels}`,
                `Closings: ${closings}`
              ];
              return parts.join(' | ');
            }
          }
        },
        legend: { position: 'top' }
      }
    }
  });
  currentCharts.push(chart);
}

function syncBaseMonthOptions(options, selectedValue) {
  if (!baseMonthEl) return selectedValue || (options[0]?.value ?? '');
  baseMonthEl.innerHTML = '';
  if (!options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No months available';
    baseMonthEl.appendChild(opt);
    baseMonthEl.disabled = true;
    return '';
  }

  options.forEach(({ value, label }) => {
    if ([...baseMonthEl.options].some(opt => opt.value === value)) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label || value;
    baseMonthEl.appendChild(opt);
  });

  const target = (selectedValue && options.some(o => o.value === selectedValue))
    ? selectedValue
    : options[0].value;
  baseMonthEl.value = target;
  baseMonthEl.disabled = false;
  return target;
}

function renderBaseTable(datasets) {
  if (!baseTable) return;
  baseTable.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Community / Builder', 'Plan', 'Sq Ft', 'Base Price'].forEach(title => {
    const th = document.createElement('th');
    th.textContent = title;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  baseTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rows = [];

  (datasets || []).forEach(ds => {
    const label = ds?.label || 'Community';
    const points = Array.isArray(ds?.points) ? ds.points.slice() : [];
    points
      .filter(pt => Number.isFinite(pt?.sqft ?? pt?.x) && Number.isFinite(pt?.price ?? pt?.y))
      .sort((a, b) => (a.sqft ?? a.x ?? 0) - (b.sqft ?? b.x ?? 0))
      .forEach(pt => {
        const sqft = Number(pt.sqft ?? pt.x ?? 0);
        const price = Number(pt.price ?? pt.y ?? 0);
        const planName = pt.planName || '';
        const planNumber = pt.planNumber ? ` (#${pt.planNumber})` : '';
        rows.push({
          label,
          plan: planName ? `${planName}${planNumber}` : (pt.planNumber || 'Plan'),
          sqft,
          price
        });
      });
  });

  rows.sort((a, b) => a.label.localeCompare(b.label) || (a.sqft - b.sqft));

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'text-muted';
    td.textContent = 'No base price data available for the selected month.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const tdLabel = document.createElement('td');
      tdLabel.textContent = row.label;
      tr.appendChild(tdLabel);

      const tdPlan = document.createElement('td');
      tdPlan.textContent = row.plan;
      tr.appendChild(tdPlan);

      const tdSqft = document.createElement('td');
      tdSqft.textContent = commify(row.sqft || 0);
      tr.appendChild(tdSqft);

      const tdPrice = document.createElement('td');
      tdPrice.textContent = dollars(row.price);
      tr.appendChild(tdPrice);

      tbody.appendChild(tr);
    });
  }

  baseTable.appendChild(tbody);
}

async function drawBasePrice(communityId) {
  if (!baseCanvas) return;

  const params = new URLSearchParams();
  if (baseMonthEl?.value) params.set('month', baseMonthEl.value);
  const query = params.toString();

  const res = await getJSON(`/api/community-profiles/${communityId}/base-price-scatter${query ? `?${query}` : ''}`);
  const rawMonths = Array.isArray(res?.months) ? res.months : [];
  const monthOptions = rawMonths
    .map(m => (typeof m === 'string'
      ? { value: m, label: friendlyMonthLabel(m) }
      : { value: m?.value, label: m?.label || friendlyMonthLabel(m?.value || '') }))
    .filter(m => m.value);

  const selectedMonth = syncBaseMonthOptions(monthOptions, res?.selectedMonth);
  const datasets = Array.isArray(res?.datasets) ? res.datasets : [];
  renderBaseTable(datasets);

  const showNoData = (message) => {
    if (!baseChartWrap) return;
    let msg = baseChartWrap.querySelector('.no-data-message');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'no-data-message text-muted text-center py-5';
      msg.style.whiteSpace = 'pre-line';
      baseChartWrap.appendChild(msg);
    }
    msg.textContent = message;
    if (baseCanvas) baseCanvas.classList.add('invisible');
  };

  const hideNoData = () => {
    if (!baseChartWrap) return;
    const msg = baseChartWrap.querySelector('.no-data-message');
    if (msg) msg.remove();
    if (baseCanvas) baseCanvas.classList.remove('invisible');
  };

  const existing = Chart.getChart(baseCanvas);
  if (existing) {
    existing.destroy();
    currentCharts = currentCharts.filter(ch => ch !== existing);
  }

  const ctx = baseCanvas.getContext('2d');
  ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);

  const chartDatasets = datasets
    .map(ds => {
      const points = Array.isArray(ds?.points) ? ds.points
        .filter(pt => Number.isFinite(pt?.x) && Number.isFinite(pt?.y))
        .sort((a, b) => a.x - b.x)
        : [];
      if (!points.length) return null;
      return {
        label: ds.label || 'Community',
        data: points,
        type: 'line',
        showLine: true,
        spanGaps: false,
        borderWidth: 2,
        tension: 0.15,
        pointRadius: 4
      };
    })
    .filter(Boolean);

  if (!chartDatasets.length) {
    showNoData('No base price data available for the selected month.');
    return;
  }

  hideNoData();

  const chart = new Chart(ctx, {
    data: { datasets: chartDatasets },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            title: () => friendlyMonthLabel(selectedMonth || ''),
            label: (tooltipCtx) => {
              const d = tooltipCtx.raw || {};
              const sqft = Number(d.x ?? d.sqft ?? 0).toLocaleString();
              const price = `$${Number(d.y ?? d.price ?? 0).toLocaleString()}`;
              const planName = d.planName || '';
              const planNumber = d.planNumber ? ` (#${d.planNumber})` : '';
              const planPart = planName ? ` - ${planName}${planNumber}` : '';
              return `${tooltipCtx.dataset.label}${planPart}: ${price} @ ${sqft} sqft`;
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
        y: { title: { display: true, text: 'Base Price ($)' }, ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
      }
    }
  });
  currentCharts.push(chart);
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
  if (baseMonthEl) {
    baseMonthEl.innerHTML = '';
    baseMonthEl.disabled = true;
  }

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
  try {
    await drawBasePrice(id);
  } catch (err) {
    console.error('Base price load failed:', err);
  }
}
