export const monthNav    = document.getElementById('monthNav');
export const sectionNav  = document.getElementById('sectionNav');
export const lotCount    = document.getElementById('lotCount');
export const metricsForm = document.getElementById('metricsForm');
export const soldInput   = document.getElementById('soldLots');
export const quickInput  = document.getElementById('quickMoveInLots');
export const prosList    = document.getElementById('prosList');
export const consList    = document.getElementById('consList');
export const newProInput = document.getElementById('newPro');
export const newConInput = document.getElementById('newCon');
export const addProBtn   = document.getElementById('addProBtn');
export const addConBtn   = document.getElementById('addConBtn');
export const planSelects = [
  document.getElementById('topPlan1'),
  document.getElementById('topPlan2'),
  document.getElementById('topPlan3'),
];
export const openModal   = document.getElementById('openPlanModal');
export const remainingEl = document.getElementById('remainingLots');

export const priceBody   = document.querySelector('#monthTable tbody');
export const quickBody   = document.querySelector('#quickHomesTable tbody');
export const soldBody    = document.querySelector('#soldHomesTable tbody');
export const salesBody   = document.querySelector('#salesTable tbody');

export const openPlanModal = document.getElementById('openPlanModal');
export const modalEl        = document.getElementById('floorPlanModal');
export const planListEl     = document.getElementById('floorPlanList');
export const floorPlanForm  = document.getElementById('floorPlanForm');
// the seven form fields
export const floorPlanFields = {
  id:     document.getElementById('fpId'),
  name:   document.getElementById('fpName'),
  sqft:   document.getElementById('fpSqft'),
  bed:    document.getElementById('fpBed'),
  bath:   document.getElementById('fpBath'),
  garage: document.getElementById('fpGarage'),
  story:  document.getElementById('fpStory'),
};