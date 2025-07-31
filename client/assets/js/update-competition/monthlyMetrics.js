export function setupMonthlyMetrics(competitionId, lotCount) {
  const soldInput = document.getElementById('soldLots');
  const qmiInput = document.getElementById('quickMoveInLots');
  const remainInput = document.getElementById('remainingLots');

  const updateRemaining = () => {
    const sold = parseInt(soldInput.value) || 0;
    remainInput.value = lotCount - sold;
  };

  soldInput.addEventListener('input', () => {
    updateRemaining();
    saveMonthly();
  });

  qmiInput.addEventListener('input', saveMonthly);

  const saveMonthly = async () => {
    const payload = {
      soldLots: parseInt(soldInput.value) || 0,
      quickMoveInLots: parseInt(qmiInput.value) || 0
    };
    const res = await fetch(`/api/competitions/${competitionId}/monthly-metrics`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.error('❌ Monthly metrics failed');
  };
}