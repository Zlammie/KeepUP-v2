// public/assets/js/update-competition/floorPlans.js
import { competitionId } from './data.js';

export function initFloorPlansModal(modalEl, loadFn, saveFn) {
  const bsModal = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('show.bs.modal', loadFn);
  modalEl.querySelector('form').addEventListener('submit', async e=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await saveFn(data);
    bsModal.hide();
  });
}

export async function loadFloorPlansList(listEl) {
  const plans = await fetch(`/api/competitions/${competitionId}/floorplans`).then(r=>r.json());
  // render into listEl…
}
