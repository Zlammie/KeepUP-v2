export async function setupTopPlanDropdowns(competitionId) {
  const fps = await fetch(`/api/competitions/${competitionId}/floorplans`).then(r => r.json());
  const selects = ['topPlan1', 'topPlan2', 'topPlan3'].map(id => document.getElementById(id));

  const existing = {
    topPlan1: document.getElementById('topPlan1').dataset.selected,
    topPlan2: document.getElementById('topPlan2').dataset.selected,
    topPlan3: document.getElementById('topPlan3').dataset.selected,
  };

  const renderOptions = (exclude = []) =>
    fps.filter(fp => !exclude.includes(fp.name)).map(fp =>
      `<option value="${fp.name}">${fp.name}</option>`).join('');

  const updateDropdowns = () => {
    const selected = selects.map(sel => sel.value).filter(Boolean);
    selects.forEach((sel, idx) => {
      const current = sel.value;
      sel.innerHTML = `<option value="">${idx + 1}. Select Plan</option>` +
        renderOptions(selected.filter((_, i) => i !== idx));
      sel.value = current;
    });
  };

  selects.forEach((sel, idx) => {
    sel.innerHTML = `<option value="">${idx + 1}. Select Plan</option>` + renderOptions();
    const key = `topPlan${idx + 1}`;
    if (existing[key]) sel.value = existing[key];
    sel.addEventListener('change', updateDropdowns);
  });

  updateDropdowns();
}