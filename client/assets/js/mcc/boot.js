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
});
