// public/assets/js/update-competition/monthlyMetrics.js
import { competitionId } from './data.js';

export function updateRemainingLots(total, soldEl, remainingEl) {
  const sold = Number(soldEl.value || 0);
  remainingEl.value = total - sold;
}

export async function saveMonthly(data) {
  // normalize numbers
  const normalized = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === '' || v == null) normalized[k] = null;
    else if (!Number.isNaN(Number(v))) normalized[k] = Number(v);
    else normalized[k] = v;
  }

  const res = await fetch(`/api/competitions/${competitionId}/monthly-metrics`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(normalized)
  });
  if (!res.ok) throw new Error(`Monthly save failed: ${res.status}`);
}
