// client/assets/js/mcc/metrics.js
import { PROFILE_API } from './context.js';

export function metrics() {
  // Flexible selectors (first matching element wins)
  const $ = (s) => document.querySelector(s);
  const promotion = $('#mPromotion') || $('#promotion') || $('[name="promotion"]');

  const prosList  = $('#prosList') || $('#pros') || $('ul[data-role="pros"]');
  const consList  = $('#consList') || $('#cons') || $('ul[data-role="cons"]');

  const newPro    = $('#newPro') || $('[data-input="new-pro"]');
  const newCon    = $('#newCon') || $('[data-input="new-con"]');

  const addProBtn = $('#addProBtn') || $('[data-action="add-pro"]');
  const addConBtn = $('#addConBtn') || $('[data-action="add-con"]');
  const saveBtn   = $('#saveMetricsBtn') || $('[data-action="save-metrics"]');

  if (!promotion || !prosList || !consList) {
    console.warn('[metrics] Missing required elements; skipping.');
    return { load: async () => {}, wire: () => {} };
  }

  let profile = null;

  // Support both API shapes: { community, profile } OR profile directly
  const toProfile = (data) => (data && typeof data === 'object' && 'profile' in data ? data.profile : data) || {};

  // Helpers
  const makeItem = (text) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.append(document.createTextNode(text));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-sm btn-outline-danger';
    del.textContent = 'Remove';
    del.addEventListener('click', () => { li.remove(); save().catch(console.error); });
    li.append(del);
    return li;
  };

  const readList = (ul) => {
  const items = Array.from(ul.querySelectorAll('li'));
   return items.map(li => {
     const raw = li.firstChild && li.firstChild.nodeType === Node.TEXT_NODE
       ? li.firstChild.nodeValue
       : (li.textContent || '');
     return raw.trim();
   }).filter(Boolean);
 };

  function render() {
    promotion.value = profile?.promotion || '';
    const pros = profile?.prosCons?.pros || [];
    const cons = profile?.prosCons?.cons || [];
    prosList.innerHTML = '';
    consList.innerHTML = '';
    pros.forEach(p => prosList.appendChild(makeItem(p)));
    cons.forEach(c => consList.appendChild(makeItem(c)));
  }

  async function load() {
    const r = await fetch(PROFILE_API);
    if (!r.ok) throw new Error(await r.text());
    profile = toProfile(await r.json());
    render();
    console.debug('[metrics] loaded', {
      promotion: !!profile.promotion,
      pros: (profile.prosCons?.pros || []).length,
      cons: (profile.prosCons?.cons || []).length
    });
  }

  // Save the whole metrics block (promo + pros/cons). Preserves existing topPlans.
  async function save() {
    const body = {
      promotion: promotion.value || '',
      prosCons: { pros: readList(prosList), cons: readList(consList) },
      topPlans: profile?.topPlans || { plan1: null, plan2: null, plan3: null }
    };
    const r = await fetch(PROFILE_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    const saved = await r.json();
     profile = (saved && typeof saved === 'object' && 'profile' in saved) ? saved.profile : saved;
    console.debug('[metrics] saved');
  }

  function wire() {
    addProBtn?.addEventListener('click', () => {
      const val = (newPro?.value || '').trim();
      if (!val) return;
      prosList.appendChild(makeItem(val));
      newPro.value = '';
      save().catch(console.error);
    });
    addConBtn?.addEventListener('click', () => {
      const val = (newCon?.value || '').trim();
      if (!val) return;
      consList.appendChild(makeItem(val));
      newCon.value = '';
      save().catch(console.error);
    });
      // Let Enter add items from the inputs
  newPro?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addProBtn?.click(); }
  });
  newCon?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addConBtn?.click(); }
  });
    // Debounced autosave for promo edits
    let t;
    promotion.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => save().catch(console.error), 500);
    });
    promotion.addEventListener('blur', () => save().catch(console.error));

    saveBtn?.addEventListener('click', () => save().catch(console.error));
  }

  return { load, wire };
}
