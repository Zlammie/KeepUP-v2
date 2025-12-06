export const raw = JSON.parse(
  document.getElementById('competition-data').textContent
);
console.log('💡 [data.js] raw →', raw);

export const competitionId = document.body.dataset.competitionId;
export const {
  pros,
  cons,
  monthNames,
  latestMetrics,
  totalLots,
  topPlan1,
  topPlan2,
  topPlan3,
  builderName,
  communityName
} = raw;
export const now = new Date();
export const initialTopPlans = [ topPlan1, topPlan2, topPlan3 ];
console.log('💡 [data.js] initialTopPlans →', initialTopPlans);
