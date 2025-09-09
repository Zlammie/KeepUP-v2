// client/assets/js/my-community-competition/charts.js
import { clearGraph, mountInfo } from './ui.js';
import { graphMount } from './dom.js';
import { setCurrentChart } from './state.js';
import { fetchSalesSeries, fetchBasePriceSeries, fetchQmiSoldsPoints } from './api.js';

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
      { type: 'line', label: 'Net (Sales − Cancels)', data: series.net, borderWidth: 2, tension: 0.25 }
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

export async function drawQmiSoldsGraph(communityId) {
  clearGraph();
  const canvas = document.createElement('canvas');
  canvas.id = 'qmiSoldsChart';
  graphMount.appendChild(canvas);

  const res = await fetchQmiSoldsPoints(communityId);
  if (!res.ok) { mountInfo('Could not load QMI/SOLD data.'); return; }
  const { qmi, sold } = await res.json();

  const sortBySqft = (arr) => [...arr].sort((a, b) => a.x - b.x);
  const qmiSorted  = sortBySqft(qmi || []);
  const soldSorted = sortBySqft(sold || []);

  const ctx = canvas.getContext('2d');
  const data = {
    datasets: [
      { label: 'Quick Move-Ins', type: 'scatter', showLine: true, data: qmiSorted,  pointRadius: 4, tension: 0.25 },
      { label: 'SOLD',           type: 'scatter', showLine: true, data: soldSorted, pointRadius: 4, tension: 0.25 }
    ]
  };
  const options = {
    responsive: true, maintainAspectRatio: false, parsing: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          const sqft  = Number(d.x).toLocaleString();
          const price = d.y != null ? `$${Number(d.y).toLocaleString()}` : 'n/a';
          const plan  = d.plan ? ` – ${d.plan}` : '';
          const addr  = d.address ? `\n${d.address}` : '';
          return `${ctx.dataset.label}${plan}: ${price} @ ${sqft} sqft${addr}`;
        }
      } }
    },
    scales: {
      x: { title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
      y: { title: { display: true, text: 'Price ($)' }, ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
    }
  };
  setCurrentChart(new Chart(ctx, { data, options }));
}
