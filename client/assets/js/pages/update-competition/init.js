// public/assets/js/update-competition/init.js

import {
  pros,
  cons,
  latestMetrics,
  totalLots,
  competitionId,
  builderName,
  communityName,
  soldLots,
  quickMoveInLots
} from './data.js';
import * as DOM from './dom.js';
import {
  renderMonthNav,
  bindMonthNav,
  bindSectionNav
} from './nav.js';
import { initQuickHomes, loadMonth, loadQuickHomes, loadSales } from './loaders.js';
import { initMetrics, saveMetrics } from './metrics.js';
import { updateRemainingLots } from './monthlyMetrics.js';
import { renderBadges, bindProsCons } from './prosCons.js';
import { populateTopPlans } from './plans.js';
import { initFloorPlansModal, loadFloorPlansList } from './floorPlans.js';
import { initFloorPlanModal } from './modal.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { createTask as createTaskApi, fetchTasks as fetchTasksApi } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';
const resolveTaskTitle = () =>
  window.UPDATE_COMP_BOOT?.defaultTaskTitle ||
  (builderName && communityName
    ? `Follow up on ${builderName} ΓÇô ${communityName}`
    : 'Follow up on this competition');

const targetMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const TARGET_MONTH_KEY = `${targetMonthDate.getFullYear()}-${String(targetMonthDate.getMonth() + 1).padStart(2, '0')}`;

const RECURRING_TASKS = [
  {
    reason: 'competition-update-promotion',
    title: 'Update competition promotion',
    description: 'Review this competitorΓÇÖs current promotion and update the metrics tab.'
  },
  {
    reason: 'competition-update-top-plans',
    title: 'Refresh top 3 plans',
    description: 'Verify the Top 3 Plans for this competition are current.'
  },
  {
    reason: 'competition-update-sold-lots',
    title: 'Update sold lot counts',
    description: 'Confirm the sold lot totals for this competition.'
  },
  {
    reason: 'competition-update-qmi-lots',
    title: 'Update quick move-in lots',
    description: 'Review and refresh quick move-in inventory for this competition.'
  },
  {
    reason: 'competition-review-qmi',
    title: 'Review quick move-in homes',
    description: 'Verify the quick move-in table is accurate for this competition.'
  },
  {
    reason: 'competition-review-sold-homes',
    title: 'Review sold homes',
    description: 'Confirm the sold homes table reflects the latest information.'
  },
  {
    reason: 'competition-update-sales-summary',
    title: 'Update sales, cancels & closings',
    description: 'Refresh the sales summary numbers for this competition.'
  },
  {
    reason: 'competition-update-floor-plan-prices',
    title: 'Update floor plan base prices',
    description: 'Fill in the base price grid for the current monthΓÇÖs floor plans.'
  }
];

const resetFloorPlanForm = (fields) => {
  if (!fields) return;
  Object.values(fields).forEach((field) => {
    if (!field) return;
    if (field.tagName && field.tagName.toLowerCase() === 'select') {
      field.selectedIndex = 0;
    } else {
      field.value = '';
    }
  });
};





/**
 * Application entrypoint
 */
document.addEventListener('DOMContentLoaded', async () => {
  const taskPanelController = initTaskPanel({
    linkedModel: 'Competition',
    linkedId: competitionId,
    defaultTitleBuilder: resolveTaskTitle,
    defaultAssignmentTarget: 'contact'
  });

  ensureRecurringTasksForCompetition(competitionId)
    .then((created) => {
      if (created) {
        taskPanelController?.setContext({
          linkedModel: 'Competition',
          linkedId: competitionId,
          defaultTitleBuilder: resolveTaskTitle,
          assignmentTarget: 'contact'
        });
      }
    })
    .catch((err) => console.error('[update-competition] recurring task seed failed', err));

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
    'Nav months',
    [...DOM.monthNav.querySelectorAll('a.nav-link')].map(a => a.dataset.month)
  );
  bindMonthNav(DOM.monthNav, month => {
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
  });

  // initial load for first month pill
  const firstMonthLink = DOM.monthNav.querySelector('a.nav-link');
  if (firstMonthLink) {
    const month = firstMonthLink.dataset.month;
    loadMonth(month);
    loadQuickHomes(month);
    loadSales(month);
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

  if (DOM.soldInput)  DOM.soldInput.value  = soldLots ?? '';
  if (DOM.quickInput) DOM.quickInput.value = quickMoveInLots ?? '';

  // 4) Lot counter (persist as you type)
  if (DOM.lotCount) DOM.lotCount.value = totalLots;

  if (DOM.soldInput) {
    const syncRemaining = () => updateRemainingLots(totalLots, DOM.soldInput, DOM.remainingEl);
    DOM.soldInput.addEventListener('input', syncRemaining);
    DOM.soldInput.addEventListener('change', syncRemaining);
    DOM.soldInput.addEventListener('blur', syncRemaining);
  }

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
      if (res.ok) {
        resetFloorPlanForm(DOM.floorPlanFields);
        loadFloorPlansList(DOM.planListEl, DOM.floorPlanFields);
      } else {
        console.error('Floor plan save failed:', await res.text());
      }
    }
  );
  initFloorPlanModal(DOM.openPlanModal, DOM.modalEl, () => false);

  // 8) Ensure Metrics tab is shown initially
  const metricsLink = DOM.sectionNav.querySelector('a.nav-link[data-section="metrics"]');
  if (metricsLink) {
    DOM.sectionNav.querySelectorAll('a.nav-link').forEach(a => a.classList.remove('active'));
    metricsLink.click();
  }
});

function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

async function ensureRecurringTasksForCompetition(id) {
  if (!id || !TARGET_MONTH_KEY) return false;

  let existing = [];
  try {
    const res = await fetchTasksApi({
      linkedModel: 'Competition',
      linkedId: id,
      limit: 200
    });
    existing = Array.isArray(res?.tasks) ? res.tasks : [];
  } catch (err) {
    console.error('[update-competition] failed to load tasks for recurring check', err);
    return false;
  }

  const createdReasons = new Set(
    existing
      .filter((task) => {
        const reason = (task?.reason || '').toLowerCase();
        if (!reason) return false;
        const createdAt = task?.createdAt ? new Date(task.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        return (
          createdAt.getFullYear() === targetMonthDate.getFullYear() &&
          createdAt.getMonth() === targetMonthDate.getMonth()
        );
      })
      .map((task) => String(task.reason || '').toLowerCase())
  );

  let createdAny = false;

  for (const config of RECURRING_TASKS) {
    const reasonKey = `${config.reason}-${TARGET_MONTH_KEY}`.toLowerCase();
    if (createdReasons.has(reasonKey)) continue;

    try {
      const response = await createTaskApi({
        title: `${config.title} (${formatMonthLabel(TARGET_MONTH_KEY)})`,
        description: config.description,
        linkedModel: 'Competition',
        linkedId: id,
        type: 'Reminder',
        category: 'System',
        priority: 'Medium',
        status: 'Pending',
        autoCreated: true,
        reason: reasonKey
      });
      if (response?.task) {
        emit('tasks:external-upsert', response.task);
        createdAny = true;
      }
    } catch (err) {
      console.error('[update-competition] failed to create recurring competition task', err);
    }
  }

  return createdAny;
}
