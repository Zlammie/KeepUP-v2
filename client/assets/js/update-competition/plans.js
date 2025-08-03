import { competitionId } from './data.js';

export async function populateTopPlans(selectEls) {
  const plans = await fetch(`/api/competitions/${competitionId}/floorplans`).then(r=>r.json());
  selectEls.forEach((sel,i)=>{
    sel.innerHTML = plans.map(p=>`<option value="${p._id}"${p._id===initialData[`topPlan${i+1}`]?' selected':''}>${p.name}</option>`).join('');
  });
}

export function bindTopPlanChanges(selectEls, saveFn) {
  selectEls.forEach((sel,i)=>{
    sel.addEventListener('change', ()=>{
      saveFn({ [`topPlan${i+1}`]: sel.value });
    });
  });
}