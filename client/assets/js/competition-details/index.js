// assets/js/competition-details/index.js
import { readBoot } from './boot.js';
import { initFees } from './fees.js';
import { initAutosave } from './autosave.js';
import { initAmenities } from './amenities.js';
import { hydrateLotStats } from './summary.js';
import { initToggles } from './toggles.js';
import { initTaskPanel } from '../contact-details/tasks.js';

initToggles();
const boot = readBoot();
const competitionId = boot.id || null;

// Task panel (right rail)
initTaskPanel({
  linkedModel: 'Competition',
  linkedId: competitionId,
  defaultTitle: `Follow up on ${boot.builderName || 'Competition'} \u2013 ${boot.communityName || ''}`
});

async function loadSalesSeries(year) {
  const y = year || new Date().getFullYear();
  const res = await fetch(`/api/competitions/${competitionId}/sales?year=${y}`);
  if (!res.ok) throw new Error(`Sales fetch failed: ${res.status}`);
  return res.json(); // { year, months: [{month:'YYYY-MM', sales, cancels, closings}, ...] }
}

//base price graph loader//
async function loadBasePricesByPlan(anchorMonth) {
  const params = anchorMonth ? `?anchor=${encodeURIComponent(anchorMonth)}` : '';
  const res = await fetch(`/api/competitions/${competitionId}/base-prices-by-plan${params}`);
  if (!res.ok) throw new Error(`Base prices by plan fetch failed: ${res.status}`);
  return res.json(); // { anchor:"YYYY-MM", prior:"YYYY-MM", plans:[{id,name,prior,anchor}, ...] }
}

//QMI / Sold Graph //
async function loadQMIAll() {
  // month omitted -> server returns all quick move-ins for this competition
  const res = await fetch(`/api/competitions/${competitionId}/quick-moveins?includeDerived=1`);
  if (!res.ok) throw new Error(`QMI fetch failed: ${res.status}`);
  return res.json(); // array of docs with { listPrice, soldPrice?, soldDate?, address, ... }
}

async function loadSoldsAll() {
  // Preferred: an "all" endpoint (fast)
  let res = await fetch(`/api/competitions/${competitionId}/solds?all=1`);
  if (res.ok) return res.json(); // expect an array of SOLD records
  // Fallback: try without all
  res = await fetch(`/api/competitions/${competitionId}/solds`);
  if (res.ok) return res.json();
  return [];
}

async function loadPlans() {
  const res = await fetch(`/api/competitions/${competitionId}/floorplans`);
  if (!res.ok) throw new Error(`Plans fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadPriceScatter(month) {
  const url = month
    ? `/api/competitions/${competitionId}/price-scatter?month=${encodeURIComponent(month)}`
    : `/api/competitions/${competitionId}/price-scatter`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price scatter fetch failed: ${res.status}`);
  return res.json(); // { months:[{value,label}], selectedMonth, datasets:[{points:[]}] }
}

let salesChart = null;
let priceSqftChart = null;
let cachedQmi = null;
let cachedSolds = null;
let cachedPlans = null;

// 1) Autosave & Fees
const triggerSave = initAutosave(competitionId);
initFees(triggerSave);

// 2) Amenities
initAmenities(competitionId, Array.isArray(boot.communityAmenities) ? boot.communityAmenities : []);

// 3) Header summary (Sold / Remaining / QMI)
hydrateLotStats({
  totalLots: boot.totalLots ?? 0,
  monthlyMetrics: Array.isArray(boot.monthlyMetrics) ? boot.monthlyMetrics : []
});

const totalLotsInput = document.querySelector('input#totalLots[name="totalLots"]');
const totalLotsStat  = document.getElementById('statTotalLots');

if (totalLotsInput && totalLotsStat) {
  totalLotsInput.addEventListener('input', () => {
    const n = Number(totalLotsInput.value);
    totalLotsStat.textContent = Number.isFinite(n) ? n : '—';
    // Recompute remaining with the latest number + existing monthly metrics
    hydrateLotStats({
      totalLots: Number.isFinite(n) ? n : 0,
      monthlyMetrics: Array.isArray(boot.monthlyMetrics) ? boot.monthlyMetrics : []
    });
  });
}


// Graphs 

// Graphs  (REPLACE from here to the end of file)

const BOOT = JSON.parse(document.getElementById('__COMPETITION_DATA__').textContent || '{}');
const graphMount = document.getElementById('graphMount');
const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');

function setBusy(isBusy) { if (graphMount) graphMount.setAttribute('aria-busy', isBusy ? 'true' : 'false'); }
function mount(html) { if (graphMount) graphMount.innerHTML = html; }
function asMonthLabel(m) { return m?.month ?? m?.label ?? m?.name ?? '—'; }
function getSalesNumber(m) { return m?.soldHomes ?? m?.sales ?? m?.totalSales ?? 0; }
function getQmiNumber(m) { return m?.qmi ?? m?.quickMoveIns ?? m?.inventory ?? 0; }
function getAvgSqft(m) { return m?.avgSqft ?? m?.averageSqft ?? null; }
function getBasePrice(m) { return m?.avgBasePrice ?? m?.basePrice ?? m?.averageBase ?? null; }

// Everything below is namespaced to avoid duplicate identifiers.
const Graphs = (() => {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTH_NAME_TO_INDEX = {
    january:0,february:1,march:2,april:3,may:4,june:5,
    july:6,august:7,september:8,october:9,november:10,december:11
  };

  // Accepts 0–11, 1–12, "Jan", "January", or date-like strings.
  function parseMonthIndex(m) {
    if (m == null) return null;
    if (typeof m === "number") {
      if (m >= 0 && m <= 11) return m;
      if (m >= 1 && m <= 12) return m - 1;
    }
    const s = String(m).trim();
    const shortIdx = MONTHS.findIndex(n => n.toLowerCase() === s.slice(0,3).toLowerCase());
    if (shortIdx !== -1) return shortIdx;
    const longIdx = MONTH_NAME_TO_INDEX[s.toLowerCase()];
    if (longIdx != null) return longIdx;
    const d = new Date(s);
    if (!isNaN(d)) return d.getMonth();
    return null;
  }

  function detectYear(rec) {
    if (rec.year != null) return Number(rec.year);
    for (const c of [rec.date, rec.period, rec.month]) {
      if (!c) continue;
      const d = new Date(String(c));
      if (!isNaN(d)) return d.getFullYear();
    }
    return null;
  }

  function pickYearFromMetrics(metrics) {
    const yrs = metrics.map(detectYear).filter(v => v != null);
    return yrs.length ? Math.max(...yrs) : new Date().getFullYear();
  }

  function autoGetNumber(rec, want) {
    const targetWords = want === 'sales' ? ['sale','sold'] : ['cancel'];
    for (const [k,v] of Object.entries(rec)) {
      const lk = k.toLowerCase();
      if (typeof v !== 'number') continue;
      if (targetWords.some(w => lk === w || lk === w + 's' || lk.includes(w))) return v;
    }
    const common = want === 'sales'
      ? ['sales','soldHomes','sold','salesCount','totalSales']
      : ['cancels','cancellations','cancelCount','cancellationCount','totalCancels'];
    for (const name of common) {
      if (rec[name] != null && !isNaN(Number(rec[name]))) return Number(rec[name]);
    }
    return 0;
  }

 function getMonthIndex(rec) {
  // Try a wider set of field names in priority order
  const fields = [
    'monthIdx','monthIndex','monthNumber','monthNum',
    'month_name','monthName','month','period','date'
  ];
  for (const f of fields) {
    if (rec[f] == null) continue;
    const idx = parseMonthIndex(rec[f]);
    if (idx != null) return idx;
  }
  return null;
}

async function renderSales() {
  // pull the series from the server
  const { year, months } = await loadSalesSeries();

  const labels  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const sales   = Array(12).fill(0);
  const cancels = Array(12).fill(0);

  for (const r of months) {
    // r.month is 'YYYY-MM'
    const m = r.month.split('-')[1];
    const idx = Math.max(0, Math.min(11, Number(m) - 1));
    sales[idx]   = Number(r.sales)   || 0;
    cancels[idx] = Number(r.cancels) || 0;
  }
  const net = sales.map((s, i) => s - cancels[i]);

  graphMount.innerHTML = `<canvas id="salesChartCanvas" height="360"></canvas>`;
  const ctx = document.getElementById('salesChartCanvas').getContext('2d');

  if (salesChart) { try { salesChart.destroy(); } catch {} salesChart = null; }

  // Chart.js must already be included in competition-details.ejs
  salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Sales',   data: sales },
        { label: 'Cancels', data: cancels },
        { label: 'Net',     data: net }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: { display: true, text: `Sales (${year})` },
        legend: { position: 'top' },
        tooltip: { enabled: true }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { stacked: false }
      }
    }
  });
}

let baseChart = null;

async function renderBase() {
  try {
    // If you want to force a particular report month, pass it here, e.g. "2025-08"
    const { prior, anchor, plans } = await loadBasePricesByPlan();

    // x-axis labels: [priorMonthShort, anchorMonthShort]
    const toShort = (ym) => {
      const n = Number(ym.split('-')[1]);
      return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][n - 1];
    };
    const labels = [toShort(prior), toShort(anchor)];

    // Datasets: one per plan
    const datasets = plans.map(p => ({
      label: p.name,
      data: [Number(p.prior) || 0, Number(p.anchor) || 0],
      fill: false,
      tension: 0.25
      // (no explicit colors; Chart.js will pick distinct ones)
    }));

    graphMount.innerHTML = `<canvas id="baseChartCanvas" height="360"></canvas>`;
    const ctx = document.getElementById('baseChartCanvas').getContext('2d');

    if (baseChart) { try { baseChart.destroy(); } catch {} baseChart = null; }

    baseChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Base Price by Plan — ${labels[0]} vs ${labels[1]}`
          },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: $${(Number(c.raw)||0).toLocaleString()}`
            }
          },
          legend: { position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: { callback: (v) => `$${Number(v).toLocaleString()}` }
          }
        }
      }
    });
  } catch (err) {
    console.error(err);
    mount('<p class="graph-empty">Could not load per-plan base prices.</p>');
  }
}

//SOLD & QMI Graph //
let qmiSoldChart = null;

function getNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function shortDate(v) { const d = new Date(String(v)); return isNaN(d) ? '' : d.toLocaleDateString(); }
function priceFmt(v)  { return `$${getNumber(v).toLocaleString()}`; }
function getSqft(r) {
  // adjust depending on schema: try direct field first
  return Number(r.sqft ?? r.squareFeet ?? r.livingArea ?? 0);
}

async function renderQmi() {
  try {
    const all = await loadQMIAll();

    // Split records from a single collection:
    // - QMI points use LIST price
    // - Sold points use SOLD price
    const qmiPts = [];
    const soldPts = [];

    (Array.isArray(all) ? all : []).forEach((r) => {
      const sqft = getSqft(r);
      if (!sqft) return; // skip if we don’t have sqft

      const hasSold   = r.soldDate || (r.status && String(r.status).toLowerCase().includes('sold')) || r.soldPrice;
      const addr      = r.address || r.planName || r.floorPlanName || r._id || '';
      const listPrice = getNumber(r.listPrice);
      const soldPrice = getNumber(r.soldPrice);

      if (hasSold && soldPrice > 0) {
        soldPts.push({
          x: sqft, y: soldPrice,
          meta: { address: addr, when: r.soldDate || r.updatedAt || r.createdAt }
        });
      } else if (listPrice > 0) {
        qmiPts.push({
          x: sqft, y: listPrice,
          meta: { address: addr, when: r.listDate || r.updatedAt || r.createdAt }
        });
      }
    });

    // Mount the canvas
    graphMount.innerHTML = `<canvas id="qmiSoldCanvas" height="380"></canvas>`;
    const ctx = document.getElementById('qmiSoldCanvas').getContext('2d');

    if (qmiSoldChart) { try { qmiSoldChart.destroy(); } catch {} qmiSoldChart = null; }

    qmiSoldChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'QMI (List Price)',
            data: qmiPts,
            parsing: false,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Solds (Sold Price)',
            data: soldPts,
            parsing: false,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'QMI vs Solds — All Records' },
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                const price = priceFmt(p?.y);
                const addr  = p?.meta?.address ? ` – ${p.meta.address}` : '';
                const dt    = p?.meta?.when ? ` (${shortDate(p.meta.when)})` : '';
                return `${ctx.dataset.label}: ${price}${addr}${dt}`;
              }
            }
          }
        },
        // Keep X as a simple index so we don't need the time adapter yet
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Index (all records)' },
            ticks: { precision: 0 }
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'Price' },
            ticks: { callback: v => `$${Number(v).toLocaleString()}` }
          }
        }
      }
    });
  } catch (err) {
    console.error(err);
    mount('<p class="graph-empty">Could not load QMI/Sold data.</p>');
  }
}


  const fmtCurrency = (n) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';

  function monthKeyOf(dateLike) {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(ym) {
    const [y, m] = String(ym).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  async function renderSqft() {
    try {
      const scatter = await loadPriceScatter();
      const months = Array.isArray(scatter?.months) ? scatter.months : [];
      const datasets = Array.isArray(scatter?.datasets) ? scatter.datasets : [];
      const selectedMonth = scatter?.selectedMonth || (months[0]?.value ?? null);

      if (!months.length || !datasets.length) {
        mount('<p class="graph-empty">No price-per-sqft data yet.</p>');
        return;
      }

      const monthOptions = months.slice();
      if (monthOptions.length > 1) {
        monthOptions.unshift({ value: 'All', label: 'All months' });
      }
      const effectiveSelected = selectedMonth || (monthOptions[0]?.value ?? null);

      const optionsHtml = monthOptions
        .map((m) => `<option value="${m.value}"${m.value === effectiveSelected ? ' selected' : ''}>${m.label || monthLabel(m.value)}</option>`)
        .join('');

      mount(`
        <div class="graph-controls">
          <label class="graph-filter">
            <span>Month:</span>
            <select id="priceSqftMonth" class="graph-select">${optionsHtml}</select>
          </label>
        </div>
        <div class="graph-card">
          <canvas id="priceSqftCanvas" height="360"></canvas>
        </div>
      `);

      const select = graphMount.querySelector('#priceSqftMonth');
      const ctx = graphMount.querySelector('#priceSqftCanvas')?.getContext('2d');
      if (!ctx) {
        mount('<p class="graph-empty">Unable to mount price-per-sqft chart.</p>');
        return;
      }

      const renderMonth = (ym) => {
        const pts = datasets
          .flatMap((ds) => Array.isArray(ds.points) ? ds.points : [])
          .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
          .filter((p) => !ym || ym === 'All' || p.month === ym)
          .sort((a, b) => a.x - b.x);

        if (!pts.length) {
          mount('<p class="graph-empty">No price-per-sqft data for that month.</p>');
          return;
        }

        if (priceSqftChart) {
          try { priceSqftChart.destroy(); } catch {}
          priceSqftChart = null;
        }

        priceSqftChart = new Chart(ctx, {
          type: 'line',
          data: {
            datasets: [
              {
                label: monthLabel(ym),
                data: pts,
                parsing: false,
                showLine: true,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const raw = ctx.raw || {};
                    const name = raw.label ? `${raw.label}: ` : '';
                    return `${name}${fmtCurrency(raw.y)} @ ${raw.x?.toLocaleString()} sqft`;
                  }
                }
              },
              legend: { display: false },
              title: { display: true, text: 'Price vs Sqft (Floor Plans)' }
            },
            scales: {
              x: { title: { display: true, text: 'Sqft' } },
              y: {
                title: { display: true, text: 'Price' },
                ticks: { callback: (v) => fmtCurrency(v) }
              }
            }
          }
        });
      };

      renderMonth(defaultMonth);
      select?.addEventListener('change', (e) => renderMonth(e.target.value));
    } catch (err) {
      console.error('Render price per sqft failed', err);
      mount('<p class="graph-empty">Unable to load price-per-sqft data.</p>');
    }
  }

  // New render using price-scatter endpoint (competition-scoped)
  async function renderSqftNew() {
    try {
      const scatter = await loadPriceScatter();
      const months = Array.isArray(scatter?.months) ? scatter.months : [];
      const selectedMonth = scatter?.selectedMonth || (months[0]?.value ?? null);

      if (!months.length) {
        mount('<p class="graph-empty">No price-per-sqft data yet.</p>');
        return;
      }

      const monthOptions = months.slice();
      if (monthOptions.length > 1) {
        monthOptions.unshift({ value: 'All', label: 'All months' });
      }
      const effectiveSelected = selectedMonth || (monthOptions[0]?.value ?? null);

      const optionsHtml = monthOptions
        .map((m) => `<option value="${m.value}"${m.value === effectiveSelected ? ' selected' : ''}>${m.label || monthLabel(m.value)}</option>`)
        .join('');

      mount(`
        <div class="graph-controls">
          <label class="graph-filter">
            <span>Month:</span>
            <select id="priceSqftMonth" class="graph-select">${optionsHtml}</select>
          </label>
        </div>
        <div class="graph-card">
          <canvas id="priceSqftCanvas" height="360"></canvas>
          <p id="priceSqftEmpty" class="graph-empty" style="display:none;">No price-per-sqft data for that month.</p>
        </div>
      `);

      const select = graphMount.querySelector('#priceSqftMonth');
      const canvas = graphMount.querySelector('#priceSqftCanvas');
      const emptyEl = graphMount.querySelector('#priceSqftEmpty');
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvas) {
        mount('<p class="graph-empty">Unable to mount price-per-sqft chart.</p>');
        return;
      }

      const draw = (scatterData, ym) => {
        const dsArr = Array.isArray(scatterData?.datasets) ? scatterData.datasets : [];
        const pts = dsArr
          .flatMap((ds) => Array.isArray(ds.points) ? ds.points : [])
          .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
          .filter((p) => !ym || ym === 'All' || p.month === ym)
          .sort((a, b) => a.x - b.x);

        if (!pts.length) {
          if (priceSqftChart) {
            try { priceSqftChart.destroy(); } catch {}
            priceSqftChart = null;
          }
          if (canvas) canvas.style.display = 'none';
          if (emptyEl) {
            emptyEl.textContent = 'No price-per-sqft data for that month.';
            emptyEl.style.display = 'block';
          }
          return;
        }

        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';

        if (priceSqftChart) {
          try { priceSqftChart.destroy(); } catch {}
          priceSqftChart = null;
        }

        priceSqftChart = new Chart(ctx, {
          type: 'line',
          data: {
            datasets: [
              {
                label: monthLabel(ym),
                data: pts,
                parsing: false,
                showLine: true,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const raw = ctx.raw || {};
                    const name = raw.label ? `${raw.label}: ` : '';
                    return `${name}${fmtCurrency(raw.y)} @ ${raw.x?.toLocaleString()} sqft`;
                  }
                }
              },
              legend: { display: false },
              title: { display: true, text: 'Price vs Sqft (Floor Plans)' }
            },
            scales: {
              x: { title: { display: true, text: 'Sqft' } },
              y: {
                title: { display: true, text: 'Price' },
                ticks: { callback: (v) => fmtCurrency(v) }
              }
            }
          }
        });
      };

      draw(scatter, effectiveSelected);
      select?.addEventListener('change', async (e) => {
        const ym = e.target.value;
        try {
          const next = await loadPriceScatter(ym);
          draw(next, ym);
        } catch (err) {
          console.error('Price scatter reload failed', err);
          draw(scatter, ym);
        }
      });
    } catch (err) {
      console.error('Render price per sqft failed', err);
      mount('<p class="graph-empty">Unable to load price-per-sqft data.</p>');
    }
  }

  return { renderSales, renderSqft: renderSqftNew, renderBase, renderQmi };
})();

// Controller
async function render(kind) {
  setBusy(true);
  try {
    switch (kind) {
      case 'sales': await Graphs.renderSales(); break;
      case 'sqft':  await Graphs.renderSqft();  break;
      case 'base':  await Graphs.renderBase();  break;
      case 'qmi':   await Graphs.renderQmi();   break;
      default:      await Graphs.renderSales(); break;
    }
  } finally { setBusy(false); }
}

function handleTabClick(e) {
  const btn = e.currentTarget;
  const kind = btn.dataset.tab;
  tabButtons.forEach(b => {
    b.classList.toggle('is-active', b === btn);
    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
  });
  render(kind);
}

if (tabButtons.length && graphMount) {
  tabButtons.forEach(b => b.addEventListener('click', handleTabClick));
  console.log('monthlyMetrics sample →', (BOOT.monthlyMetrics || []).slice(0,5));
  console.log("monthlyMetrics full →", JSON.stringify(BOOT.monthlyMetrics, null, 2));
  render('sales'); // initial paint
}
