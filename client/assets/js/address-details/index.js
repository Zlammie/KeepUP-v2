// /assets/js/address-details/index.js
import * as API from './api.js';
import { $, assignLot, assignPurchaser, assignRealtor, assignPrimaryLender } from './domCache.js';
import { hydrateAll } from './hydrate.js';
import { attachAllControls } from './controls.js';

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

  } catch (err) {
    console.error('Failed to load lot details:', err);
    $('#lotTitle').textContent = 'Error loading lot';
  }
});
