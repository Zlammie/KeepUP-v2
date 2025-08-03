// public/assets/js/update-competition/monthlyMetrics.js
export function updateRemainingLots(total, soldEl, remainingEl) {
  remainingEl.textContent = total - Number(soldEl.value || 0);
}

export async function saveMonthly(data) {
  await fetch(`/api/competitions/${competitionId}/monthly-metrics`, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
}