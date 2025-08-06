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
import { populateTopPlans } from './plans.js';
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

DOM.sectionNav.addEventListener('click', e => {
  const link = e.target.closest('a.nav-link');
  if (!link) return;

  // ── YOU MUST ADD THIS LINE ──
  const activeMonth = DOM.monthNav.querySelector('a.nav-link.active')?.dataset.month;
  if (!activeMonth) return;

  switch (link.dataset.section) {
    case 'price':
      loadMonth(activeMonth);
      break;
    case 'inventory':
      loadQuickHomes(activeMonth);
      loadSales(activeMonth);
      break;
    // case 'metrics': nothing to load
  }
});


  // 3) METRICS FORM
  initMetrics(DOM.metricsForm, latestMetrics, saveMetrics);



  // 4) MONTHLY LOTS COUNTER
  // a) fill the Lot Count input from the DB
DOM.lotCount.value = totalLots;

// b) recalc remaining when sold changes
DOM.soldInput.addEventListener('input', () =>
  updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl)
);

// c) save quick‐move‐in lots when changed
DOM.quickInput.addEventListener('change', () =>
  saveMonthly({ quickMoveInLots: DOM.quickInput.value })
);

// d) initial remaining calculation
updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);

  // 5) PROS/CONS
renderBadges(DOM.prosList, pros);
renderBadges(DOM.consList, cons);

bindProsCons(
  DOM.addProBtn,
  DOM.newProInput,
  DOM.prosList,
  async updatedPros => {
    // 1) persist to server
    await saveMetrics({ pros: updatedPros });
    // 2) re-render immediately
    renderBadges(DOM.prosList, updatedPros);
  }
);

bindProsCons(
  DOM.addConBtn,
  DOM.newConInput,
  DOM.consList,
  async updatedCons => {
    await saveMetrics({ cons: updatedCons });
    renderBadges(DOM.consList, updatedCons);
  }
);

  // 6) TOP-3 PLANS
  populateTopPlans();

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

  const initMonthLink   = DOM.monthNav.querySelector('a.nav-link.active');
  if (initMonthLink) initMonthLink.click();

  const initSectionLink = DOM.sectionNav.querySelector('a.nav-link.active');
  if (initSectionLink) initSectionLink.click();

});
