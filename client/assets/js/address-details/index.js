// /assets/js/address-details/index.js
import * as API from './api.js';
import { $, assignLot, assignPurchaser, assignRealtor, assignPrimaryLender, ctx } from './domCache.js';
import { hydrateAll } from './hydrate.js';
import { attachAllControls } from './controls.js';
import { initTaskPanel } from '../contact-details/tasks.js';
import { initListPriceAutomation } from './listPriceTask.js';
import { initReleaseDateAutomation } from './releaseDateTask.js';
import { initReleaseStatusAutomation } from './releaseStatusTask.js';
import { initPurchaserStatusAutomation } from './purchaserStatusTask.js';
import { initFloorPlanAutomation } from './floorPlanTask.js';
import { initElevationAutomation } from './elevationTask.js';
import { initExpectedCompletionAutomation } from './expectedCompletionTask.js';
import { initClosingDateAutomation } from './closingDateTask.js';
import { initClosingTimeAutomation } from './closingTimeTask.js';
import { initClosingStatusAutomation } from './closingStatusTask.js';
import { initWalkTasksAutomation } from './walkTasks.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const communityId = params.get('communityId');
  const lotId = params.get('lotId');

  if (!communityId || !lotId) {
    console.error('Missing communityId or lotId in URL');
    $('#lotTitle').textContent = 'Error: missing URL parameters';
    return;
  }

  try {
    const lot = await API.getLot(communityId, lotId);
    assignLot(lot);

    initTaskPanel({
      linkedModel: 'Lot',
      linkedId: lotId,
      currentUserId: null,
      defaultTitleBuilder: () => {
        const address = ctx.lot?.address || ctx.lot?.jobNumber || '';
        return address ? `Follow up on ${address}` : 'Follow up on this lot';
      },
      defaultAssignmentTarget: 'contact'
    });

    // purchaser (contact)
    let purchaserContact = null;
    if (lot?.purchaser?._id) {
      purchaserContact = await API.getContact(lot.purchaser._id);
      assignPurchaser(purchaserContact);
    }

    // realtor (from purchaser)
    let realtor = null;
    if (purchaserContact?.realtor) {
      const realtorId = typeof purchaserContact.realtor === 'object'
        ? purchaserContact.realtor._id
        : purchaserContact.realtor;
      realtor = await API.getRealtor(realtorId);
      assignRealtor(realtor);
    }

    // primary lender entry (from purchaser.lenders)
    const primaryEntry = purchaserContact?.lenders?.find(l => l.isPrimary) || null;
    assignPrimaryLender(primaryEntry);

    // hydrate UI
    await hydrateAll({ communityId, lotId, lot, purchaserContact, realtor, primaryEntry });

    // attach controls after hydration so initial values exist
    attachAllControls({ communityId, lotId, lot, purchaserContact, primaryEntry });

    initListPriceAutomation({ lotId, lot });
    initReleaseDateAutomation({ lotId, lot });
    initReleaseStatusAutomation({ lotId, lot });
    initPurchaserStatusAutomation({ lotId, lot, purchaser: purchaserContact });
    initFloorPlanAutomation({ lotId, lot });
    initElevationAutomation({ lotId, lot });
    initExpectedCompletionAutomation({ lotId, lot });
    initClosingDateAutomation({ lotId, lot, primaryEntry });
    initClosingTimeAutomation({ lotId, lot, primaryEntry });
    initClosingStatusAutomation({ lotId, lot, primaryEntry });
    initWalkTasksAutomation({ lotId, lot, primaryEntry });

  } catch (err) {
    console.error('Failed to load lot details:', err);
    $('#lotTitle').textContent = 'Error loading lot';
  }
});
