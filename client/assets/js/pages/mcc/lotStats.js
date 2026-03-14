// client/assets/js/mcc/lotStats.js
import { LOT_STATS_API } from './context.js';

export function lotStats() {
  const lotCount = document.getElementById('lotCount');
  const soldLots = document.getElementById('soldLots');
  const remaining = document.getElementById('remainingLots');
  const qmiLots = document.getElementById('quickMoveInLots');
  if (!lotCount || !soldLots || !remaining) return { load: async () => {} };

  soldLots.readOnly = true;
  if (qmiLots) qmiLots.readOnly = true;

  async function load() {
    try {
      const res = await fetch(LOT_STATS_API);
      if (!res.ok) throw new Error(await res.text());

      const { total, sold, quickMoveInLots } = await res.json();
      const t = Number.isFinite(total) ? total : 0;
      const s = Number.isFinite(sold) ? sold : 0;
      const q = Number.isFinite(quickMoveInLots) ? quickMoveInLots : 0;

      lotCount.value = t;
      soldLots.value = s;
      remaining.value = Math.max(0, t - s);
      if (qmiLots) qmiLots.value = String(q);
    } catch (e) {
      console.error('[mcc] lot-stats', e);
      const t = Number(lotCount.value || 0);
      const s = Number(soldLots.value || 0);
      remaining.value = Math.max(0, t - s);
    }
  }

  return { load };
}
