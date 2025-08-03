// public/assets/js/update-competition/init.js
import { pros, cons, monthNames, latestMetrics, totalLots } from './data.js';
import * as DOM            from './dom.js';
import { renderMonthNav, bindMonthNav, bindSectionNav } from './nav.js';
import { loadMonth, loadQuickHomes, loadSales }         from './loaders.js';
import { initMetrics, saveMetrics }                     from './metrics.js';
import { updateRemainingLots, saveMonthly }             from './monthlyMetrics.js';
import { renderBadges, bindProsCons }                   from './prosCons.js';
import { populateTopPlans, bindTopPlanChanges }         from './plans.js';
import { initFloorPlansModal, loadFloorPlansList }      from './floorPlans.js';
import { initFloorPlanModal }                           from './modal.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) DATA + DOM already loaded by imports
  console.log('🛰 init.js bootstrapping…', DOM.monthNav);
  // 2) NAVIGATION
  renderMonthNav(DOM.monthNav);
  bindMonthNav(DOM.monthNav, m => {
    loadMonth(m); loadQuickHomes(m); loadSales(m);
  });
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
  initFloorPlansModal(DOM.modalEl, ()=> loadFloorPlansList(DOM.planListEl), data=> {/*save floorplan*/});
  initFloorPlanModal(DOM.openModal, DOM.modalEl, id=> { /*select plan*/ });

  const activeLink = DOM.monthNav.querySelector('a.nav-link.active');
    if (activeLink) activeLink.click();
});
