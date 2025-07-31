export function setupMetricsAutoSave(competitionId) {
  const form = document.getElementById('metricsForm');
  const fields = form.querySelectorAll('input[type="text"], textarea, select');
  let saveTimeout;

  const debounceSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(autoSaveMetrics, 800);
  };

  fields.forEach(input => input.addEventListener('input', debounceSave));

  const autoSaveMetrics = async () => {
    const payload = getMetricsPayload();
    try {
      const res = await fetch(`/api/competitions/${competitionId}/metrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      console.log('✔ Metrics auto-saved');
    } catch (err) {
      console.error('❌ Metrics save failed:', err);
    }
  };

  const getMetricsPayload = () => {
    const data = {};
    fields.forEach(field => {
      data[field.name] = field.value;
    });
    data.pros = [...document.querySelectorAll('#prosList .badge')].map(el => el.textContent);
    data.cons = [...document.querySelectorAll('#consList .badge')].map(el => el.textContent);
    return data;
  };
}
