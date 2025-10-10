// client/assets/js/my-community-competition/charts.js
import { clearGraph, mountInfo } from './ui.js';
import { graphMount } from './dom.js';
import { setCurrentChart } from './state.js';
import { fetchSalesSeries, fetchBasePriceSeries, fetchQmiSolds } from './api.js';

export async function drawSalesGraph(communityId) {
  clearGraph();
  const canvas = document.createElement('canvas');
  canvas.id = 'salesChart';
  graphMount.appendChild(canvas);

  const res = await fetchSalesSeries(communityId);
  if (!res.ok) { mountInfo('Could not load sales data.'); return; }
  const { labels, series } = await res.json();

  const ctx = canvas.getContext('2d');
  const data = {
    labels,
    datasets: [
      { type: 'bar',  label: 'Sales',   data: series.sales,   borderWidth: 1 },
      { type: 'bar',  label: 'Cancels', data: series.cancels, borderWidth: 1 },
      { type: 'bar',  label: 'Closings',data: series.closings,borderWidth: 1 },
      { type: 'line', label: 'Net (Sales - Cancels)', data: series.net, borderWidth: 2, tension: 0.25 }
    ]
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales: { y: { beginAtZero: true, title: { display: true, text: 'Count' } },
              x: { title: { display: true, text: 'Month' } } }
  };
  setCurrentChart(new Chart(ctx, { data, options }));
}

export async function drawBasePriceGraph(communityId) {
  clearGraph();
  const canvas = document.createElement('canvas');
  canvas.id = 'basePriceChart';
  graphMount.appendChild(canvas);

  const res = await fetchBasePriceSeries(communityId);
  if (!res.ok) { mountInfo('Could not load base price data.'); return; }
  const { labels, datasets } = await res.json();

  const ctx = canvas.getContext('2d');
  const chartData = {
    labels,
    datasets: datasets.map(d => ({
      label: d.label,
      data: d.data,
      type: 'line',
      borderWidth: 2,
      tension: 0.25,
      spanGaps: true
    }))
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false, callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y;
          if (v == null) return `${ctx.dataset.label}: n/a`;
          return `${ctx.dataset.label}: $${Number(v).toLocaleString()}`;
        }
      }}
    },
    scales: {
      y: { beginAtZero: false, title: { display: true, text: 'Base Price ($)' },
           ticks: { callback: v => `$${Number(v).toLocaleString()}` } },
      x: { title: { display: true, text: 'Month' } }
    }
  };
  setCurrentChart(new Chart(ctx, { data: chartData, options }));
}

export async function drawQmiSoldsGraph(communityId, opts = {}) {
  clearGraph();
  const canvas = document.createElement('canvas');
  canvas.id = 'qmiSoldsChart';
  graphMount.appendChild(canvas);

  let payload = opts?.data || null;

  if (!payload) {
    const res = await fetchQmiSolds(communityId);
    if (!res.ok) { mountInfo('Could not load QMI/SOLD data.'); return; }
    payload = await res.json();
  }

  const qmiPointsRaw = Array.isArray(payload?.qmi) ? payload.qmi : [];
  const soldPointsRaw = Array.isArray(payload?.sold) ? payload.sold : [];

  const toPoint = (item, priceKey, fallbackPriceKey) => {
    const sqft = Number(item?.x ?? item?.sqft);
    const price = Number(
      item?.y ??
      item?.[priceKey] ??
      (fallbackPriceKey ? item?.[fallbackPriceKey] : undefined)
    );
    if (!Number.isFinite(sqft) || !Number.isFinite(price)) return null;
    return {
      x: sqft,
      y: price,
      plan: item?.plan?.name || '',
      planNumber: item?.plan?.planNumber || '',
      address: item?.address || '',
      month: item?.month || null
    };
  };

  const qmiPoints = qmiPointsRaw
    .map(item => toPoint(item, 'listPrice'))
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  const soldPoints = soldPointsRaw
    .map(item => toPoint(item, 'soldPrice', 'listPrice'))
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  if (!qmiPoints.length && !soldPoints.length) {
    mountInfo('No QMI or SOLD data available for recent months.');
    return;
  }

  const ctx = canvas.getContext('2d');
  const currencyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const sqftFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const data = {
    datasets: [
      { label: 'Quick Move-Ins', type: 'scatter', showLine: true, data: qmiPoints,  pointRadius: 4, tension: 0.25 },
      { label: 'Sold / Closed',  type: 'scatter', showLine: true, data: soldPoints, pointRadius: 4, tension: 0.25 }
    ]
  };
  const options = {
    responsive: true, maintainAspectRatio: false, parsing: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          const sqft  = sqftFmt.format(Number(d.x));
          const price = Number.isFinite(Number(d.y)) ? currencyFmt.format(Number(d.y)) : 'n/a';
          const planLabel = d.plan ? `${d.plan}${d.planNumber ? ` (#${d.planNumber})` : ''}` : '';
          const planPart  = planLabel ? ` - ${planLabel}` : '';
          const addr  = d.address ? `\n${d.address}` : '';
          const monthPart = d.month ? `\nMonth: ${d.month}` : '';
          return `${ctx.dataset.label}${planPart}: ${price} @ ${sqft} sqft${addr}${monthPart}`;
        }
      } }
    },
    scales: {
      x: { title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
      y: { title: { display: true, text: 'Price ($)' }, ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
    }
  };
  setCurrentChart(new Chart(ctx, { data, options }));
  return payload;
}
