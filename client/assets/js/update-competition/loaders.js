// loaders.js
import { competitionId } from './data.js';

export async function loadMonth(month) {
  // Fire both requests in parallel and wait for both to resolve
  const [floorplans, priceRecords] = await Promise.all([
    fetch(`/api/competitions/${competitionId}/floorplans`)
      .then(res => {
        if (!res.ok) throw new Error(`Floorplans fetch failed: ${res.status}`);
        return res.json();
      }),
    fetch(`/api/competitions/${competitionId}/price-records?month=${month}`)
      .then(res => {
        if (!res.ok) throw new Error(`Price records fetch failed: ${res.status}`);
        return res.json();
      })
  ]);

  // Now you have your data in two variables:
  // - floorplans: array of floor plan objects
  // - priceRecords: array of price-record objects for the given month

  // TODO: render them into your #monthTable tbody (or wherever)
 
}

export async function loadQuickHomes(month) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/quick-moveins?month=${month}`
  ).then(r=>r.json());
  // …filter sold vs unsold, build rows, wire plan-change handlers…
}

export async function loadSales(month) {
  const recs = await fetch(
    `/api/competitions/${competitionId}/sales-records?month=${month}`
  ).then(r=>r.json());
  // …render sold homes table, wire blur ⏩ save handlers…
}