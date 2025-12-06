// assets/js/competition-details/api.js
import { putJson, getJson } from '../../core/http.js';

export const fetchCompetition = (id) => getJson(`/api/competitions/${id}`);

export const fetchSalesSeries = (competitionId, year) =>
  getJson(`/api/competitions/${competitionId}/sales?year=${encodeURIComponent(year)}`);

export const fetchBasePricesByPlan = (competitionId, anchorMonth) => {
  const params = anchorMonth ? `?anchor=${encodeURIComponent(anchorMonth)}` : '';
  return getJson(`/api/competitions/${competitionId}/base-prices-by-plan${params}`);
};

export const fetchQuickMoveIns = (competitionId) =>
  getJson(`/api/competitions/${competitionId}/quick-moveins?includeDerived=1`);

export const fetchSoldsAll = async (competitionId) => {
  try {
    return await getJson(`/api/competitions/${competitionId}/solds?all=1`);
  } catch {
    try {
      return await getJson(`/api/competitions/${competitionId}/solds`);
    } catch {
      return [];
    }
  }
};

export const fetchPlans = (competitionId) =>
  getJson(`/api/competitions/${competitionId}/floorplans`).then((data) =>
    Array.isArray(data) ? data : []
  );

export const fetchPriceScatter = (competitionId, month) => {
  const url = month
    ? `/api/competitions/${competitionId}/price-scatter?month=${encodeURIComponent(month)}`
    : `/api/competitions/${competitionId}/price-scatter`;
  return getJson(url);
};

export const putCompetition = (id, payload) =>
  putJson(`/api/competitions/${id}`, payload);

export const putAmenities = (id, communityAmenities) =>
  putJson(`/api/competitions/${id}/amenities`, { communityAmenities });
