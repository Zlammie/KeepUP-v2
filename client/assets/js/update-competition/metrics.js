// metrics.js
import { competitionId } from './data.js';

let timer;
export function initMetrics(formEl, initialData, saveFn) {
  // populate:
  Object.entries(initialData).forEach(([k,v])=>{
    if (formEl.elements[k]) formEl.elements[k].value = v;
  });
  // debounce & auto-save
 formEl.addEventListener('input', ()=>{
    clearTimeout(timer);
    timer = setTimeout(()=>{
      const payload = Object.fromEntries(
        [...formEl.elements].filter(el=>el.name).map(el=>[el.name,el.value])
      );
      saveFn(payload);
    }, 500);
  });
}

export async function saveMetrics(data) {
  // imported competitionId from data.js
  await fetch(`/api/competitions/${competitionId}/metrics`, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
}
