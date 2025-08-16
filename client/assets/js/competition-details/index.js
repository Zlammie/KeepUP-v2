// assets/js/competition-details/index.js
import { readBoot } from './boot.js';
import { initFees } from './fees.js';
import { initAutosave } from './autosave.js';
import { initAmenities } from './amenities.js';
import { hydrateLotStats } from './summary.js';
import { initToggles } from './toggles.js';

initToggles();
const boot = readBoot();
const competitionId = boot.id || null;

// 1) Autosave & Fees
const triggerSave = initAutosave(competitionId);
initFees(triggerSave);

// 2) Amenities
initAmenities(competitionId, Array.isArray(boot.amenities) ? boot.amenities : []);

// 3) Header summary (Sold / Remaining / QMI)
hydrateLotStats({
  totalLots: boot.totalLots ?? 0,
  monthlyMetrics: Array.isArray(boot.monthlyMetrics) ? boot.monthlyMetrics : []
});
