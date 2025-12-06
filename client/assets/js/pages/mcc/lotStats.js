// client/assets/js/mcc/lotStats.js
import { LOT_STATS_API, PROFILE_API } from './context.js';


export function lotStats() {
  const lotCount  = document.getElementById('lotCount');
  const soldLots  = document.getElementById('soldLots');
  const remaining = document.getElementById('remainingLots');
  const qmiLots   = document.getElementById('quickMoveInLots');
  if (!lotCount || !soldLots || !remaining) return { load: async ()=>{} };

  soldLots.readOnly = true;
    if (qmiLots) qmiLots.readOnly = true;  // make it clearly auto-calculated

  async function load() {
    try {
      const res = await fetch(LOT_STATS_API);
      if (!res.ok) throw new Error(await res.text());
      const { total, sold } = await res.json();
      const t = Number.isFinite(total) ? total : 0;
      const s = Number.isFinite(sold)  ? sold  : 0;
      lotCount.value = t; soldLots.value = s; remaining.value = Math.max(0, t - s);

           // LIVE QMI COUNT (no month) — same logic as QMI table without the ?month filter
     if (qmiLots) {
       try {
         const q = await fetch(`${PROFILE_API}/qmi`);
         if (q.ok) {
           const data   = await q.json();
            const items  = Array.isArray(data) ? data
                          : (Array.isArray(data?.homes) ? data.homes : []);
            const count  = items.filter(x => {
              // must have a release/list/available date
              const hasRelease = !!(x.listDate || x.releaseDate || x.availableDate);
              // not sold or closed (prefer status/generalStatus from payload)
              const status = String(x.status || x.generalStatus || '').toLowerCase();
              const isSoldOrClosed = status === 'sold' || status === 'closed';
              return hasRelease && !isSoldOrClosed;
            }).length;
           qmiLots.value = String(count);
         }
       } catch (e) {
         // non-fatal; leave as-is
         console.debug('[lot-stats] live QMI count unavailable', e);
       }
     }
    } catch (e) {
      console.error('[mcc] lot-stats', e);
      const t = Number(lotCount.value || 0), s = Number(soldLots.value || 0);
      remaining.value = Math.max(0, t - s);
    }
  }

  return { load };
}
