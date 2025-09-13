// public/assets/js/update-competition/monthlyMetrics.js
import { competitionId } from './data.js'; // ✅ needed!

export function updateRemainingLots(total, soldEl, remainingEl) {
  const sold = Number(soldEl.value || 0);
  remainingEl.value = total - sold;
}

export async function saveMonthly(data) {
  // Normalize numeric-ish fields to numbers; keep empty as null
  const normalized = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === '' || v == null) normalized[k] = null;
    else if (!Number.isNaN(Number(v)) && /^\s*-?\d+(\.\d+)?\s*$/.test(String(v))) {
      normalized[k] = Number(v);
    } else {
      normalized[k] = v;
    }
  }

  const res = await fetch(`/api/competitions/${competitionId}/monthly-metrics`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized)
  });
  if (!res.ok) {
    // surface errors so you see them in the console
    const text = await res.text().catch(() => '');
    throw new Error(`Monthly save failed (${res.status}): ${text}`);
  }
}
