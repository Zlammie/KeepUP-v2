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
import { initQuickHomes, loadMonth, loadQuickHomes, loadSales } from './loaders.js';
import { initMetrics, saveMetrics } from './metrics.js';
import { updateRemainingLots, saveMonthly } from './monthlyMetrics.js';
import { renderBadges, bindProsCons } from './prosCons.js';
import { populateTopPlans } from './plans.js';
import { initFloorPlansModal, loadFloorPlansList } from './floorPlans.js';
import { initFloorPlanModal } from './modal.js';

/**
 * Application entrypoint
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 0) Preload all Quick-Move-Ins & Floor Plans
  await initQuickHomes();

  // 1) build & wire your month-pill nav
  renderMonthNav(DOM.monthNav);
  console.log(
  'Nav months →',
  [...DOM.monthNav.querySelectorAll('a.nav-link')].map(a => a.dataset.month)
);
  bindMonthNav(DOM.monthNav, month => {
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
  });

    // ——— initial load for first month pill ———
  const firstMonthLink = DOM.monthNav.querySelector('a.nav-link');
  if (firstMonthLink) {
    const month = firstMonthLink.dataset.month;
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
  }

  // 2) wire your section tabs
  bindSectionNav(DOM.sectionNav);

  // When switching between sections, reload data for the active month
  DOM.sectionNav.addEventListener('click', e => {
    const link = e.target.closest('a.nav-link');
    if (!link) return;
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
      // metrics section loads from existing latestMetrics
    }
  });

  // 3) METRICS FORM
  initMetrics(DOM.metricsForm, latestMetrics, saveMetrics);

  // 4) MONTHLY LOTS COUNTER
  DOM.lotCount.value = totalLots;
  DOM.soldInput.addEventListener('input', () =>
    updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl)
  );
  DOM.quickInput.addEventListener('change', () =>
    saveMonthly({ quickMoveInLots: DOM.quickInput.value })
  );
  updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);

  // 5) PROS/CONS
  renderBadges(DOM.prosList, pros);
  renderBadges(DOM.consList, cons);

  bindProsCons(DOM.addProBtn, DOM.newProInput, DOM.prosList, async updatedPros => {
    await saveMetrics({ pros: updatedPros });
    renderBadges(DOM.prosList, updatedPros);
  });

  bindProsCons(DOM.addConBtn, DOM.newConInput, DOM.consList, async updatedCons => {
    await saveMetrics({ cons: updatedCons });
    renderBadges(DOM.consList, updatedCons);
  });

  // 6) TOP-3 PLANS
  populateTopPlans();

  // 7) FLOOR-PLANS MODAL
  initFloorPlansModal(
    DOM.modalEl,
    () => loadFloorPlansList(DOM.planListEl, DOM.floorPlanFields),
    async data => {
      const isEdit = Boolean(data.id);
      const url    = isEdit
        ? `/api/competitions/${competitionId}/floorplans/${data.id}`
        : `/api/competitions/${competitionId}/floorplans`;
      const method = isEdit ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) loadFloorPlansList(DOM.planListEl, DOM.floorPlanFields);
      else console.error('Floor plan save failed:', await res.text());
    }
  );
  initFloorPlanModal(
    DOM.openPlanModal,
    DOM.modalEl,
    planId => {
      /* no-op: fields already populated by list click handler */
    }
  );

  // 8) Trigger initial UI state


});