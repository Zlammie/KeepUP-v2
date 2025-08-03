// public/assets/js/update-competition/init.js
import {
  pros,
  cons,
  monthNames,
  latestMetrics,
  totalLots,
  competitionId
} from './data.js';
import * as DOM from './dom.js';
import {
  renderMonthNav,
  bindMonthNav,
  bindSectionNav
} from './nav.js';
import { loadMonth, loadQuickHomes, loadSales } from './loaders.js';
import { initMetrics, saveMetrics } from './metrics.js';
import { updateRemainingLots, saveMonthly } from './monthlyMetrics.js';
import { renderBadges, bindProsCons } from './prosCons.js';
import { populateTopPlans, bindTopPlanChanges } from './plans.js';
import { initFloorPlansModal, loadFloorPlansList } from './floorPlans.js';
import { initFloorPlanModal } from './modal.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) build & wire your month-pill nav
  renderMonthNav(DOM.monthNav);
  bindMonthNav(DOM.monthNav, month => {
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
  });

  // 2) wire your section tabs
  bindSectionNav(DOM.sectionNav);

  // 3) METRICS FORM
  initMetrics(DOM.metricsForm, latestMetrics, saveMetrics);

  // 4) MONTHLY LOTS COUNTER
  DOM.soldInput .addEventListener('input', ()=> updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl));
  DOM.quickInput.addEventListener('change', ()=> saveMonthly({ quickMoveInLots: DOM.quickInput.value }));
  updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);

  // 5) PROS/CONS
  renderBadges(DOM.prosList, pros);
  renderBadges(DOM.consList, cons);
  bindProsCons(
  DOM.addProBtn,
  DOM.newProInput,
  DOM.prosList,
  // TODO: call your API to add a new “pro”
  newProText => {
    console.log('Add pro:', newProText);
    // e.g. fetch(`/api/competitions/${competitionId}/pros`, { … })
  }
);
  bindProsCons(
  DOM.addConBtn,
  DOM.newConInput,
  DOM.consList,
  newConText => {
    console.log('Add con:', newConText);
    // e.g. fetch(`/api/competitions/${competitionId}/cons`, { … })
  }
);

  // 6) TOP-3 PLANS
  populateTopPlans(DOM.planSelects);
  bindTopPlanChanges(
  DOM.planSelects,
  changedData => {
    console.log('Top-plan change:', changedData);
    
    fetch(`/api/competitions/${competitionId}`, {
      method: 'PUT',
       headers: {'Content-Type':'application/json'},
      body: JSON.stringify(changedData)
    });
  }
);

  // 7) FLOOR-PLANS MODAL

  // A) bootstrap + form-submit wiring + reload list
  initFloorPlansModal(
    DOM.modalEl,
    () => loadFloorPlansList(DOM.planListEl, DOM.floorPlanFields),
    async data => {
      // POST or PUT depending on whether `data.id` exists
      const isEdit = Boolean(data.id);
      const url    = isEdit
        ? `/api/competitions/${competitionId}/floorplans/${data.id}`
        : `/api/competitions/${competitionId}/floorplans`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
         method,
         headers: {'Content-Type':'application/json'},
         body: JSON.stringify(data)
      });
      if (res.ok) {
        // refresh list so you can immediately pick the new/updated plan
        loadFloorPlansList(DOM.planListEl, DOM.floorPlanFields);
      } else {
        console.error('Floor plan save failed:', await res.text());
      }
    }
  );

  // B) open modal & populate form fields when you click a plan
  initFloorPlanModal(
    DOM.openPlanModal,
    DOM.modalEl,
    planId => {
      // once you click an item, the loadFloorPlansList click‐handler has
      // already populated the fields, so you don’t need to do anything else
      // here—but if you wanted to fetch extras you could:
      // fetch(`/api/competitions/${competitionId}/floorplans/${planId}`)
      //   .then(r=>r.json()).then(fp=>{ /* fill DOM.floorPlanFields */ });
    }
);
  const active = DOM.monthNav.querySelector('a.nav-link.active');
  if (active) active.click();
});

