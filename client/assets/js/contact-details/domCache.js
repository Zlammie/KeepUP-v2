// assets/js/contact-details/domCache.js
export const DOM = {};

/** Flexible query: tries selectors in order, returns first match */
function q(...selectors) {
  for (const s of selectors) {
    if (!s) continue;
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function cacheDOM() {
  // Root
  DOM.root = document.getElementById('contact-details-root');

  // Status + sections
  DOM.statusSelect     = document.getElementById('status');
  DOM.communitySection = q('#community-section', '#community-section-container', '.community-section');
  DOM.lotLinkContainer = document.getElementById('lot-link-container');

  // Community + floorplans
  DOM.communitySelect     = document.getElementById('community-select');
  DOM.floorplansContainer = document.getElementById('floorplans-container');

  // Sales details INSIDE lot link container (may be empty on load)
  DOM.saleDateInput  = document.getElementById('sale-date');
  DOM.salePriceInput = document.getElementById('sale-price');

  // Lot link/search UI
  DOM.lotSearchInput    = document.getElementById('lot-search');
  DOM.linkLotBtn        = document.getElementById('link-lot-btn');
  DOM.unlinkLotBtn      = document.getElementById('unlink-lot-btn');
  DOM.linkedLotDisplay  = document.getElementById('linked-lot-display');

  // Realtor/Lender search
  DOM.realtorSearch = document.getElementById('realtor-search');
  DOM.realtorList   = document.getElementById('realtor-results');
  DOM.lenderSearch  = document.getElementById('lender-search');
  DOM.lenderList    = document.getElementById('lender-results');

  // Optional: “More Details” panel
  DOM.moreInfoBody   = document.querySelector('#more-info-body');

  // Helpful warnings if a critical element is missing
  warnIfMissing('statusSelect', DOM.statusSelect);
  warnIfMissing('communitySelect', DOM.communitySelect);
  warnIfMissing('communitySection', DOM.communitySection);
}

/** Call this after dynamic renders (e.g., after seeding floorplans or rendering linked-lot card) */
export function refreshDOM() {
  // Re-grab nodes that may have been replaced/inserted dynamically
  DOM.floorplansContainer = document.getElementById('floorplans-container');
  DOM.linkedLotDisplay    = document.getElementById('linked-lot-display');

  // These inputs may appear only when Purchased or after linking a lot
  DOM.saleDateInput  = document.getElementById('sale-date');
  DOM.salePriceInput = document.getElementById('sale-price');
}

function warnIfMissing(name, el) {
  if (!el) console.warn(`[domCache] Missing element for ${name}`);
}
