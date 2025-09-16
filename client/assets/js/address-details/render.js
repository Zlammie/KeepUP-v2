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
  const el = (id) => document.getElementById(id);
  const set = (node, v) => { if (node) node.textContent = v ?? ''; };
  const nameFrom = (o) => {
    if (!o) return '';
    const parts = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim();
    return parts || o.name || o.fullName || '';
  };
  const phoneFrom = (o) => o?.phone ?? o?.mobile ?? o?.cell ?? o?.primaryPhone ?? '';
  const emailFrom = (o) => o?.email ?? o?.emailAddress ?? '';

  // Purchaser
  {
    const full  = nameFrom(purchaser) || 'No purchaser linked';
    set(els?.purchaserValue || el('purchaserValue'), full);
    set(els?.purchaserPhoneValue || el('purchaserPhoneValue'), phoneFrom(purchaser));
    set(els?.purchaserEmailValue || el('purchaserEmailValue'), emailFrom(purchaser));
  }

  // Realtor
  {
    const full  = nameFrom(realtor) || 'No realtor linked';
    set(els?.realtorNameValue || el('realtorNameValue'), full);
    set(els?.realtorPhoneValue || el('realtorPhoneValue'), phoneFrom(realtor));
    set(els?.realtorEmailValue || el('realtorEmailValue'), emailFrom(realtor));
  }

  // Lender
  {
    const L = primaryEntry?.lender;
    const display = nameFrom(L) || 'No lender linked';
    const brokerage = L?.brokerage ?? L?.company ?? L?.organization ?? '';
    set(els?.lenderNameFinance || el('lenderNameFinance'),
        brokerage && display !== 'No lender linked' ? `${display} — ${brokerage}` : display);
    set(els?.lenderPhoneFinance || el('lenderPhoneFinance'), phoneFrom(L));
    set(els?.lenderEmailFinance || el('lenderEmailFinance'), emailFrom(L));
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
