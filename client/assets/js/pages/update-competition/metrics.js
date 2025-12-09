// metrics.js
import { competitionId } from './data.js';

let timer;
export function initMetrics(formEl, initialData, saveFn) {
  // Populate only fields marked for metrics
  formEl.querySelectorAll('[data-metrics]').forEach(input => {
    const k = input.name;
    if (k && initialData[k] != null) input.value = initialData[k];
  });

  const handleChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload = {};
      formEl.querySelectorAll('[data-metrics]').forEach(el => {
        if (el.name) payload[el.name] = el.value;
      });
      saveFn(payload);
    }, 500);
  };

  formEl.addEventListener('change', handleChange);
  formEl.addEventListener('blur', (e) => {
    if (e.target && e.target.matches('[data-metrics]')) handleChange();
  }, true);
}

export async function saveMetrics(data) {
  const res = await fetch(`/api/competitions/${competitionId}/metrics`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`metrics save failed: ${res.status} ${msg}`);
  }
}
