// client/assets/js/mcc/topPlans.js
import { PROFILE_API, PLANS_API } from './context.js';

export function topPlans() {
  const $ = (s) => document.querySelector(s);
  const s1 = $('#topPlan1') || $('[name="topPlan1"]');
  const s2 = $('#topPlan2') || $('[name="topPlan2"]');
  const s3 = $('#topPlan3') || $('[name="topPlan3"]');
  const saveBtn = $('#saveTopPlansBtn') || $('[data-action="save-top-plans"]');

  if (!s1 || !s2 || !s3) {
    console.warn('[mcc:topPlans] selects missing; skipping');
    return { load: async () => {}, wire: () => {} };
  }

  let plans = [];
  let profile = null;

  const toProfile = (data) => (data && typeof data === 'object' && 'profile' in data ? data.profile : data) || {};

  const option = (v, label) => { const o=document.createElement('option'); o.value=v||''; o.textContent=label||''; return o; };
  const fillSelects = () => {
    [s1,s2,s3].forEach(sel => { sel.innerHTML=''; sel.appendChild(option('','— select —')); plans.forEach(p => sel.appendChild(option(p._id, p.name || p.planNumber || '(plan)'))); });
    const tp = profile?.topPlans || {};
    s1.value = tp.plan1?._id || tp.plan1 || '';
    s2.value = tp.plan2?._id || tp.plan2 || '';
    s3.value = tp.plan3?._id || tp.plan3 || '';
  };

  async function load() {
    // profile first (for existing selections)
    { const r = await fetch(PROFILE_API); if (!r.ok) throw new Error(await r.text()); profile = toProfile(await r.json()); }
    // then plans
    { const r = await fetch(PLANS_API);   if (!r.ok) throw new Error(await r.text()); plans = await r.json(); }
    fillSelects();
  }

  function wire() {
    const save = async () => {
      const body = {
        promotion: profile?.promotion || '',
        prosCons:  profile?.prosCons  || { pros: [], cons: [] },
        topPlans:  { plan1: s1.value || null, plan2: s2.value || null, plan3: s3.value || null },
      };
      const r = await fetch(PROFILE_API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      profile = toProfile(await r.json());
      fillSelects();
      console.debug('[mcc:topPlans] saved');
    };
    saveBtn?.addEventListener('click', () => save().catch(console.error));
    [s1,s2,s3].forEach(sel => sel.addEventListener('change', () => save().catch(console.error)));
  }

  return { load, wire };
}
