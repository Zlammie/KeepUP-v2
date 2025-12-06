// public/assets/js/update-competition/plans.js
import { competitionId, initialTopPlans } from './data.js';
import { planSelects }                  from './dom.js';

/**
 * Load all floorplans once, then render & wire the Top-3 selects.
 */
export async function populateTopPlans() {
  const plans = await fetch(
    `/api/competitions/${competitionId}/floorplans`
  ).then(r => r.json());
console.log('💡 [plans.js] fetched plans →', plans);
  // Helper: only include unchosen plans (+ keep current sel)
function renderOptions(exclude = [], idx) {
  const current = planSelects[idx].value;
  return plans
    // keep the currently-selected _id, or drop any ids already chosen
    .filter(fp => fp._id === current || !exclude.includes(fp._id))
    // use _id for value, but display the plan’s name
    .map(fp => `<option value="${fp._id}">${fp.name}</option>`)
    .join('');
}

  // Initial render
 planSelects.forEach((sel, idx) => {
  const others = initialTopPlans
    .map((id, i) => i === idx ? null : id)   // null out this index
    .filter(Boolean);                         // then drop falsy
  sel.innerHTML = `<option value="">${idx+1}. Select Plan</option>`
                + renderOptions(others, idx);
  if (initialTopPlans[idx]) sel.value = initialTopPlans[idx];
});
  // Re-render dropdowns whenever one changes
  function updateDropdowns() {
    const chosen = planSelects.map(s => s.value).filter(Boolean);
    planSelects.forEach((sel, idx) => {
      const prev = sel.value;
      sel.innerHTML = `<option value="">${idx+1}. Select Plan</option>`
                    + renderOptions(chosen.filter((_, i) => i !== idx), idx);
      sel.value = prev;
    });
  }

  // Wire change → re-render + trigger metrics autosave
  planSelects.forEach(sel => {
    sel.addEventListener('change', () => {
      updateDropdowns();
      // bubble an input event so your metrics auto-save picks it up
      sel.closest('form').dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}
