// /assets/js/address-details/domCache.js

// Simple helper with forgiving selectors (#id or id)
export const $ = (idOrSelector) => {
  if (!idOrSelector) return null;
  const id = idOrSelector.startsWith('#') ? idOrSelector.slice(1) : idOrSelector;
  return document.getElementById(id);
};

// IMPORTANT: Lazy DOM access - resolves at the moment you use it
// so it never runs before the DOM exists.
export const els = new Proxy({}, {
  get: (_target, prop) => document.getElementById(prop)
});

let _lot = null, _purchaser = null, _realtor = null, _primaryLenderEntry = null;

export const assignLot = (lot) => { _lot = lot; };
export const assignPurchaser = (c) => { _purchaser = c || null; };
export const assignRealtor = (r) => { _realtor = r || null; };
export const assignPrimaryLender = (e) => { _primaryLenderEntry = e || null; };

export const ctx = {
  get lot(){ return _lot; },
  get purchaser(){ return _purchaser; },
  get realtor(){ return _realtor; },
  get primary(){ return _primaryLenderEntry; },
};
