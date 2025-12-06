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

/**
 * Fetch all floor plans and render them as clickable items.
 * @param {HTMLElement} listEl  container for the .list-group items
 * @param {object} fields       {id, name, sqft, bed, bath, garage, story} inputs to populate
*/
export async function loadFloorPlansList(listEl, fields) {
  const plans = await fetch(
    `/api/competitions/${competitionId}/floorplans`
  ).then(r => r.json());

  listEl.innerHTML = '';
  plans.forEach(fp => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = 'list-group-item list-group-item-action plan-option';
    item.dataset.planId = fp._id;
    item.textContent = fp.name;

    // when you click a plan, fill the form fields
    item.addEventListener('click', () => {
      fields.id.value     = fp._id;
      fields.name.value   = fp.name;
      fields.sqft.value   = fp.sqft || '';
      fields.bed.value    = fp.bed   || '';
      fields.bath.value   = fp.bath  || '';
      fields.garage.value = fp.garage|| '';
      fields.story.value  = fp.storyType || '';
    });

    listEl.appendChild(item);
  });
}
