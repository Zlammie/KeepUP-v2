// client/assets/js/mcc/boot.js

import { wireTabs } from './tabs.js';
import { monthTabs } from './monthTabs.js';
import { wireFeeToggles, wireFormAutosaves } from './forms.js';
import { metrics } from './metrics.js';
import { topPlans } from './topPlans.js';
import { lotStats } from './lotStats.js';
import { priceTable } from './priceTable.js';
import { qmiTable } from './qmiTable.js';
import { soldTable } from './soldTable.js';
import { salesSummary } from './salesSummary.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { createTask as createTaskApi, fetchTasks as fetchTasksApi } from '../contact-details/api.js';
import { emit } from '../contact-details/events.js';

const RECURRING_TASKS = [
  {
    reason: 'community-update-promotion',
    title: 'Update community promotion',
    description: 'Review current incentives and refresh the Promotion section for this community.'
  },
  {
    reason: 'community-update-top-plans',
    title: 'Update top 3 plans',
    description: 'Verify the Top 3 Plans selections reflect current priorities.'
  },
  {
    reason: 'community-verify-sold-lots',
    title: 'Verify sold lots',
    description: 'Confirm the sold lot counts are accurate for this community profile.'
  },
  {
    reason: 'community-verify-qmi-lots',
    title: 'Verify quick move-in lots',
    description: 'Review QMI homes to ensure availability and pricing are current.'
  },
  {
    reason: 'community-update-sales-cancels-closings',
    title: 'Update sales, cancels & closings',
    description: 'Refresh the Sales Summary section with the latest sales, cancels, and closing counts.'
  }
];


let taskPanelController = null;

document.addEventListener('DOMContentLoaded', () => {
  wireTabs('metrics');
  wireFeeToggles();
  wireFormAutosaves();

  const m = metrics();   m.wire();   m.load().catch(console.error);
  const tp = topPlans(); tp.wire();  tp.load().catch(console.error);

 
  

  lotStats().load().catch(console.error);

  const months = monthTabs();
  const price  = priceTable();
  const qmi    = qmiTable();
  const sold   = soldTable();
  const sum    = salesSummary();

  months.subscribe((ym) => {
    price.load(ym).catch(console.error);
    qmi.load(ym).catch(console.error);
    sold.load(ym).catch(console.error);
    sum.load(ym).catch(console.error);
  });
  months.init();

  // safety: if month not ready yet, nudge after paint
  setTimeout(() => {
    const ym = months.getSelectedMonth();
    if (ym) {
      price.load(ym).catch(console.error);
      qmi.load(ym).catch(console.error);
      sold.load(ym).catch(console.error);
      sum.load(ym).catch(console.error);
    }
  }, 0);

  const todoPanel = document.getElementById('todo-panel');
  const resolveDefaultTitle = () =>
    todoPanel?.dataset?.defaultTitle?.trim() ||
    window.MCC_BOOT?.defaultTaskTitle ||
    'Follow up on this community';
  const communityId =
    window.MCC_BOOT?.communityId ||
    document.body.dataset.communityId ||
    '';

  taskPanelController = initTaskPanel({
    linkedModel: 'Community',
    linkedId: communityId,
    defaultTitleBuilder: resolveDefaultTitle
  });

  ensureRecurringTasksForCommunity(communityId)
    .then((changesMade) => {
      if (changesMade) {
        taskPanelController?.setContext({
          linkedModel: 'Community',
          linkedId: communityId,
          defaultTitleBuilder: resolveDefaultTitle
        });
      }
    })
    .catch((err) =>
      console.error('[manage-my-community-competition] recurring task seed failed', err)
    );
});

async function ensureRecurringTasksForCommunity(communityId) {
  if (!communityId) return false;

  let existing = [];
  try {
    const response = await fetchTasksApi({
      linkedModel: 'Community',
      linkedId: communityId,
      limit: 200
    });
    existing =
      Array.isArray(response?.tasks) && response.tasks.length
        ? response.tasks
        : [];
  } catch (err) {
    console.error('[manage-my-community-competition] failed to fetch tasks for recurring seed', err);
    return;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const existingReasons = new Set(
    existing
      .filter((task) => {
        const reason = (task?.reason || '').toLowerCase();
        if (!reason) return false;
        const created = task?.createdAt ? new Date(task.createdAt) : null;
        if (!created || Number.isNaN(created.getTime())) return false;
        return created.getFullYear() === currentYear && created.getMonth() === currentMonth;
      })
      .map((task) => String(task.reason || '').toLowerCase())
  );

  let createdAny = false;

  for (const config of RECURRING_TASKS) {
    const reasonKey = config.reason.toLowerCase();
    if (existingReasons.has(reasonKey)) continue;

    try {
      const response = await createTaskApi({
        title: config.title,
        description: config.description,
        linkedModel: 'Community',
        linkedId: communityId,
        type: 'Reminder',
        category: 'System',
        priority: 'Medium',
        status: 'Pending',
        autoCreated: true,
        reason: config.reason
      });
      if (response?.task) {
        emit('tasks:external-upsert', response.task);
      }
      createdAny = true;
    } catch (err) {
      console.error(`[manage-my-community-competition] failed to create recurring task "${config.title}"`, err);
    }
  }

  return createdAny;
}
