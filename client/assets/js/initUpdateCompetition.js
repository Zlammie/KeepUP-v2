import { setupMetricsAutoSave } from './update-competition/metricsAutoSave.js';
import { setupMonthlyMetrics } from './update-competition/monthlyMetrics.js';
import { setupTopPlanDropdowns } from './update-competition/planDropdowns.js';
import { renderProsCons } from './update-competition/prosCons.js';

document.addEventListener('DOMContentLoaded', () => {
  const competitionId = document.getElementById('competitionId').value;
  const initialData = JSON.parse(document.getElementById('initialData').textContent);

  setupMetricsAutoSave(competitionId);
  setupMonthlyMetrics(competitionId, initialData.lotCount);
  setupTopPlanDropdowns(competitionId);
  renderProsCons(initialData.pros || [], initialData.cons || []);
});