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



let currentMonth = null;

async function hydrateMonthlyUI(month) {
  try {
    const res = await fetch(`/api/competitions/${competitionId}/monthly?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw res;
    const m = await res.json();
    if (DOM.soldInput)  DOM.soldInput.value  = m?.soldLots ?? '';
    if (DOM.quickInput) DOM.quickInput.value = m?.quickMoveInLots ?? '';
  } catch (e) {
    if (e && e.text) {
      try { console.warn('monthly error body →', await e.text()); } catch {}
    }
    if (DOM.soldInput)  DOM.soldInput.value  = '';
    if (DOM.quickInput) DOM.quickInput.value = '';
    console.warn('hydrateMonthlyUI fallback', e.status || e);
  }
  updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);
}

/**
 * Application entrypoint
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Back to details (CSP-safe: no inline script)
  const back = document.getElementById('backToDetailsBtn');
  if (back) {
    back.addEventListener('click', () => {
      window.location.href = `/competition-details/${competitionId}`;
    });
  }

  // 0) Preload all Quick-Move-Ins & Floor Plans
  await initQuickHomes();

  // 1) Month nav
  renderMonthNav(DOM.monthNav);
  console.log(
    'Nav months →',
    [...DOM.monthNav.querySelectorAll('a.nav-link')].map(a => a.dataset.month)
  );
  bindMonthNav(DOM.monthNav, month => {
    currentMonth = month;
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
    hydrateMonthlyUI(month);
  });

  // initial load for first month pill
  const firstMonthLink = DOM.monthNav.querySelector('a.nav-link');
  if (firstMonthLink) {
    const month = firstMonthLink.dataset.month;
    currentMonth = month;
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
    hydrateMonthlyUI(month);
  }

  // 2) Section tabs
  bindSectionNav(DOM.sectionNav);
  DOM.sectionNav.addEventListener('click', e => {
    const link = e.target.closest('a.nav-link');
    if (!link) return;
    const activeMonth = DOM.monthNav.querySelector('a.nav-link.active')?.dataset.month;
    if (!activeMonth) return;
    switch (link.dataset.section) {
      case 'price':      loadMonth(activeMonth); break;
      case 'inventory':  loadQuickHomes(activeMonth); loadSales(activeMonth); break;
    }
  });

  // 3) Metrics form
  initMetrics(DOM.metricsForm, latestMetrics, saveMetrics);

  // 4) Monthly lots counter (persist as you type)
  DOM.lotCount.value = totalLots;

  DOM.soldInput.addEventListener('input', () => {
    updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);
  });
  const persistSold = () => currentMonth && saveMonthly({ month: currentMonth, soldLots: DOM.soldInput.value });
  DOM.soldInput.addEventListener('input',  persistSold);
  DOM.soldInput.addEventListener('change', persistSold);
  DOM.soldInput.addEventListener('blur',   persistSold);

  const persistQMI = () => currentMonth && saveMonthly({ month: currentMonth, quickMoveInLots: DOM.quickInput.value });
  DOM.quickInput.addEventListener('input',  persistQMI);
  DOM.quickInput.addEventListener('change', persistQMI);
  DOM.quickInput.addEventListener('blur',   persistQMI);

  updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);

  // 5) Pros/Cons
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

  // 6) Top-3 plans
  populateTopPlans();

  // 7) Floor-plans modal
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
  initFloorPlanModal(DOM.openPlanModal, DOM.modalEl, () => {});

  // 8) Ensure Metrics tab is shown initially
  const metricsLink = DOM.sectionNav.querySelector('a.nav-link[data-section="metrics"]');
  if (metricsLink) {
    DOM.sectionNav.querySelectorAll('a.nav-link').forEach(a => a.classList.remove('active'));
    metricsLink.click();
  }
});