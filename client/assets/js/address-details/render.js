// /assets/js/address-details/render.js
import { els } from './domCache.js';
import { formatDateTime, toLocalInputDateTime } from './utils.js';
import {
  buildingLabels, buildingClasses,
  walkStatusLabels, walkStatusClasses,
  closingStatusLabels, closingStatusClasses,
  lenderStatusLabels, lenderStatusClasses
} from './statusMaps.js';

export const renderTitleAndBasics = (lot) => {
  els.lotTitle.textContent =  `${lot.address ?? ''}`;
  els.jobNumberValue.textContent = lot.jobNumber ?? '';
  els.lotBlockPhaseValue.textContent = `${lot.lot ?? ''} / ${lot.block ?? ''} / ${lot.phase ?? ''}`;

  if (els.addressValue) {
    els.addressValue.textContent = lot.address ?? '';
  }
};

export const renderGeneralStatus = (lot, purchaserContact, primaryEntry) => {
  const rawBuilding = lot.status || 'Not-Started';
  const hasPurchaser = Boolean(purchaserContact);
  const closingDateTime = primaryEntry?.closingDateTime;
  let generalStatus = '';

  if (hasPurchaser && closingDateTime && new Date(closingDateTime) < new Date()) {
    generalStatus = 'Closed';
  } else if (hasPurchaser) {
    if (rawBuilding === 'Not-Started') generalStatus = 'Not Started & Sold';
    else if (rawBuilding === 'Under-Construction') generalStatus = 'Under Construction';
    else if (rawBuilding === 'Finished') generalStatus = 'Finished & Sold';
  } else {
    if (rawBuilding === 'Not-Started') generalStatus = 'Not Started';
    else if (rawBuilding === 'Under-Construction') generalStatus = 'Under Construction & Available';
    else if (rawBuilding === 'Finished') generalStatus = 'Finished & Available';
  }
  els.generalStatusValue.textContent = generalStatus;
};

export const renderTopBar = (lot, primaryEntry) => {
  // Building status badge
  {
    const raw = lot.status || 'Not-Started';
    if (els.buildingStatusValue) {
      els.buildingStatusValue.innerHTML =
        `<span class="status-badge ${buildingClasses[raw]}">${buildingLabels[raw]}</span>`;
    }
    if (els.startDateValue) {
      els.startDateValue.textContent = lot.releaseDate ?? '';
    }
  }

  // Walks
  {
    const rawWalk = lot.walkStatus || 'waitingOnBuilder';
    if (els.walkStatusValue) {
      els.walkStatusValue.innerHTML =
        `<span class="status-badge ${walkStatusClasses[rawWalk]}">${walkStatusLabels[rawWalk]}</span>`;
    }

    if (els.thirdPartyStatusValue) {
      els.thirdPartyStatusValue.textContent = lot.thirdParty ? formatDateTime(lot.thirdParty) : '';
    }
    if (els.firstWalkStatusValue) {
      els.firstWalkStatusValue.textContent  = lot.firstWalk ? formatDateTime(lot.firstWalk) : '';
    }
    if (els.finalSignOffStatusValue) {
      els.finalSignOffStatusValue.textContent = lot.finalSignOff ? formatDateTime(lot.finalSignOff) : '';
    }
  }

  // Lender + Closing
  if (primaryEntry) {
    const rawLS = primaryEntry.status || 'invite';
    if (els.lenderStatusValue) {
      els.lenderStatusValue.innerHTML =
        `<span class="status-badge ${lenderStatusClasses[rawLS]}">${lenderStatusLabels[rawLS]}</span>`;
    }

    const rawCS = primaryEntry.closingStatus || 'notLocked';
    if (els.closingStatusValue) {
      els.closingStatusValue.innerHTML =
        `<span class="status-badge ${closingStatusClasses[rawCS]}">${closingStatusLabels[rawCS]}</span>`;
    }

    if (els.closingDateValue) {
      els.closingDateValue.textContent = primaryEntry.closingDateTime
        ? formatDateTime(primaryEntry.closingDateTime)
        : '';
    }
  }
};

export const renderRightColumn = (purchaser, realtor, primaryEntry) => {
  // helpers
  const el = (id) => document.getElementById(id);           // fallback if els.* isn't mapped
  const set = (node, v) => { if (node) node.textContent = v ?? ''; };
  const nameFrom = (obj) => {
    if (!obj) return '';
    // accept many shapes: {firstName,lastName}, {name}, {fullName}
    const byParts = `${obj.firstName ?? ''} ${obj.lastName ?? ''}`.trim();
    return byParts || obj.name || obj.fullName || '';
  };
  const phoneFrom = (obj) => obj?.phone ?? obj?.mobile ?? obj?.cell ?? obj?.primaryPhone ?? '';
  const emailFrom = (obj) => obj?.email ?? obj?.emailAddress ?? '';

  // --- Purchaser: Full Name + Phone + Email
  {
    const full   = nameFrom(purchaser);
    const phone  = phoneFrom(purchaser);
    const email  = emailFrom(purchaser);

    set(els?.purchaserValue || el('purchaserValue'), full);
    set(els?.purchaserPhoneValue || el('purchaserPhoneValue'), phone);
    set(els?.purchaserEmailValue || el('purchaserEmailValue'), email);
  }

  // --- Realtor: Full Name + Phone + Email
  {
    const full   = nameFrom(realtor);
    const phone  = phoneFrom(realtor);
    const email  = emailFrom(realtor);

    set(els?.realtorNameValue || el('realtorNameValue'), full);
    set(els?.realtorPhoneValue || el('realtorPhoneValue'), phone);
    set(els?.realtorEmailValue || el('realtorEmailValue'), email);
  }

  // --- Lender (from primaryEntry.lender): Name — Brokerage + Phone + Email
  {
    const L = primaryEntry?.lender;
    const displayName = nameFrom(L);
    const brokerage   = L?.brokerage ?? L?.company ?? L?.organization ?? '';
    const nameLine    = brokerage ? `${displayName} — ${brokerage}` : displayName;
    const phone       = phoneFrom(L);
    const email       = emailFrom(L);

    set(els?.lenderNameFinance  || el('lenderNameFinance'),  nameLine);
    set(els?.lenderPhoneFinance || el('lenderPhoneFinance'), phone);
    set(els?.lenderEmailFinance || el('lenderEmailFinance'), email);
  }
};

export const setInitialFormValues = (lot, primaryEntry) => {
  // General & dates
  if (els.elevationInput) els.elevationInput.value = lot.elevation ?? '';
  if (els.releaseDateInput) els.releaseDateInput.value = lot.releaseDate ?? '';
  if (els.expectedCompletionInput) els.expectedCompletionInput.value = lot.expectedCompletionDate ?? '';
  if (els.closeMonthInput) els.closeMonthInput.value = lot.closeMonth ?? '';

  // Walks
  if (els.thirdPartyInput) els.thirdPartyInput.value = lot.thirdParty ? toLocalInputDateTime(lot.thirdParty) : '';
  if (els.firstWalkInput) els.firstWalkInput.value = lot.firstWalk ? toLocalInputDateTime(lot.firstWalk) : '';
  if (els.finalSignOffInput) els.finalSignOffInput.value = lot.finalSignOff ? toLocalInputDateTime(lot.finalSignOff) : '';

  // List price (schema stored as string => don’t format too aggressively)
  if (els.listPriceInput) els.listPriceInput.value = lot.listPrice ?? '';

  // Selects
  if (els.buildingStatusSelect) els.buildingStatusSelect.value = lot.status || 'Not-Started';
  if (els.walkStatusSelect) els.walkStatusSelect.value = lot.walkStatus || 'waitingOnBuilder';
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  if (els.closingDateTimeInput && primaryEntry?.closingDateTime) {
    els.closingDateTimeInput.value = toLocalInputDateTime(primaryEntry.closingDateTime);
  }
};
