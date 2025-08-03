export const raw = JSON.parse(
  document.getElementById('competition-data').textContent
);

export const competitionId = document.body.dataset.competitionId;
export const { pros, cons, monthNames, latestMetrics, totalLots,topPlan1, topPlan2, topPlan3 } = raw;
export const now = new Date();