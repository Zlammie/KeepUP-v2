// assets/js/competition-details/summary.js
import { $ } from '../../core/dom.js';

function latestMetrics(monthlyMetrics) {
  if (!Array.isArray(monthlyMetrics) || monthlyMetrics.length === 0) return null;
  return [...monthlyMetrics]
    .filter(m => m && typeof m.month === 'string')
    .sort((a,b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))[0] || null;
}

export function hydrateLotStats({ totalLots, monthlyMetrics }) {
  const elTot  = $('#statTotalLots');
  const elSold = $('#statLotsSold');
  const elRem  = $('#statLotsRemaining');
  const elQmi  = $('#statQmiAvailable');

  // Prefer DOM value for total (if user just edited it), else boot value
  const totalFromDom = Number((elTot?.textContent || '').replace(/[^\d.-]/g,'')) || null;
  const total = totalFromDom ?? Number(totalLots ?? 0) ?? 0;

  const latest = latestMetrics(monthlyMetrics);
  const soldLots = Number(latest?.soldLots);
  const qmiAvail = Number(latest?.quickMoveInLots);

  const sold = Number.isFinite(soldLots) ? soldLots : null;
  const qmi  = Number.isFinite(qmiAvail) ? qmiAvail : null;
  const remaining = sold != null ? Math.max(total - sold, 0) : null;

  if (elSold) elSold.textContent = (sold ?? 'N/A');
  if (elRem)  elRem.textContent  = (remaining ?? 'N/A');
  if (elQmi)  elQmi.textContent  = (qmi ?? 'N/A');
}
