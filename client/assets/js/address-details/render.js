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
  els.lotTitle.textContent = `Lot ${lot.jobNumber ?? ''} – ${lot.address ?? ''}`;
  els.jobNumberValue.textContent = lot.jobNumber ?? '';
  els.lotBlockPhaseValue.textContent = `${lot.lot ?? ''} / ${lot.block ?? ''} / ${lot.phase ?? ''}`;
  els.addressValue.textContent = lot.address ?? '';
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
    els.buildingStatusValue.innerHTML =
      `<span class="status-badge ${buildingClasses[raw]}">${buildingLabels[raw]}</span>`;
    els.startDateValue.textContent = lot.releaseDate ?? '';
  }

  // Walks
  {
    const rawWalk = lot.walkStatus || 'waitingOnBuilder';
    els.walkStatusValue.innerHTML =
      `<span class="status-badge ${walkStatusClasses[rawWalk]}">${walkStatusLabels[rawWalk]}</span>`;

    els.thirdPartyStatusValue.textContent = lot.thirdParty ? formatDateTime(lot.thirdParty) : '';
    els.firstWalkStatusValue.textContent  = lot.firstWalk ? formatDateTime(lot.firstWalk) : '';
    els.finalSignOffStatusValue.textContent = lot.finalSignOff ? formatDateTime(lot.finalSignOff) : '';
  }

  // Lender + Closing
  if (primaryEntry) {
    const rawLS = primaryEntry.status || 'invite';
    els.lenderStatusValue.innerHTML =
      `<span class="status-badge ${lenderStatusClasses[rawLS]}">${lenderStatusLabels[rawLS]}</span>`;

    const rawCS = primaryEntry.closingStatus || 'notLocked';
    els.closingStatusValue.innerHTML =
      `<span class="status-badge ${closingStatusClasses[rawCS]}">${closingStatusLabels[rawCS]}</span>`;

    els.closingDateValue.textContent = primaryEntry.closingDateTime
      ? formatDateTime(primaryEntry.closingDateTime)
      : '';
  }
};

export const renderRightColumn = (purchaser, realtor, primaryEntry) => {
  // Purchaser
  if (purchaser) {
    els.purchaserValue.textContent = purchaser.lastName ?? '';
    els.purchaserPhoneValue.textContent = purchaser.phone ?? '';
    els.purchaserEmailValue.textContent = purchaser.email ?? '';
  } else {
    els.purchaserValue.textContent = '';
    els.purchaserPhoneValue.textContent = '';
    els.purchaserEmailValue.textContent = '';
  }

  // Realtor
  if (realtor) {
    els.realtorNameValue.textContent  = `${realtor.firstName ?? ''} ${realtor.lastName ?? ''}`.trim();
    els.realtorPhoneValue.textContent = realtor.phone ?? '';
    els.realtorEmailValue.textContent = realtor.email ?? '';
  } else {
    els.realtorNameValue.textContent = '';
    els.realtorPhoneValue.textContent = '';
    els.realtorEmailValue.textContent = '';
  }

  // Lender contact card
  if (primaryEntry?.lender) {
    const L = primaryEntry.lender;
    els.lenderNameFinance.textContent  = L.name || `${L.firstName ?? ''} ${L.lastName ?? ''}`.trim();
    els.lenderPhoneFinance.textContent = L.phone ?? '';
    els.lenderEmailFinance.textContent = L.email ?? '';
  } else {
    els.lenderNameFinance.textContent = '';
    els.lenderPhoneFinance.textContent = '';
    els.lenderEmailFinance.textContent = '';
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
