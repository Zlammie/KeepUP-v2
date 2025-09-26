// client/assets/js/mcc/qmiLiveCount.js
import { PROFILE_API } from './context.js';

export function qmiLiveCount() {
  // Prefer badge, then previous month badge, then existing input as fallback
  const target =
    document.getElementById('qmiLiveCount') ||
    document.getElementById('qmiMonthCount') ||
    document.getElementById('quickMoveInLots');

  const btnRefresh = document.getElementById('qmiLiveRefresh');

  async function load() {
    try {
      // No ?month => current snapshot of not-sold inventory (same logic the QMI table uses without month)
      const r = await fetch(`${PROFILE_API}/qmi`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const count = Array.isArray(data) ? data.length
                  : (Array.isArray(data?.homes) ? data.homes.length : 0);

      if (!target) return;
      if ('value' in target) {
        target.value = String(count);
        try { target.readOnly = true; } catch {}
      } else {
        target.textContent = String(count);
      }
    } catch (e) {
      console.error('[qmiLiveCount] load failed:', e);
      if (target && !('value' in target)) target.textContent = '—';
    }
  }

  function wire() {
    btnRefresh?.addEventListener('click', () => load().catch(console.error));
  }

  return { load, wire };
}
