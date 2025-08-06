// public/assets/js/update-competition/monthlyMetrics.js
export function updateRemainingLots(total, soldEl, remainingEl) {
  const sold = Number(soldEl.value || 0);
  remainingEl.value = total - sold;
}

export async function saveMonthly(data) {
  await fetch(`/api/competitions/${competitionId}/monthly-metrics`, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
}