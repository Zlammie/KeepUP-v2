// metrics.js
import { competitionId } from './data.js';

let timer;
export function initMetrics(formEl, initialData, saveFn) {
  // Populate only fields marked for metrics
  formEl.querySelectorAll('[data-metrics]').forEach(input => {
    const k = input.name;
    if (k && initialData[k] != null) input.value = initialData[k];
  });

  formEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload = {};
      formEl.querySelectorAll('[data-metrics]').forEach(el => {
        if (el.name) payload[el.name] = el.value;
      });
      saveFn(payload);
    }, 500);
  });
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