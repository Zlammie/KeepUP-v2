// /assets/js/address-details/render.js
import { els } from './domCache.js';
import { formatCurrency } from '../../core/currency.js';
import {
  formatDateTime,
  toLocalInputDateTime,
  splitDateTimeForInputs
} from '../../core/datetime.js';
import {
  buildingLabels, buildingClasses,
  walkStatusLabels, walkStatusClasses,
  lenderStatusLabels, lenderStatusClasses
} from './statusMaps.js';
import { formatPhoneDisplay } from '../../shared/phone.js';

export const renderTitleAndBasics = (lot) => {
  els.lotTitle.textContent =  `${lot.address ?? ''}`;
  els.jobNumberValue.textContent = lot.jobNumber ?? '';
  els.lotBlockPhaseValue.textContent = `${lot.lot ?? ''} / ${lot.block ?? ''} / ${lot.phase ?? ''}`;

  if (els.addressValue) {
    els.addressValue.textContent = lot.address ?? '';
  }
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
      const date = lot.releaseDate ? new Date(lot.releaseDate) : null;
      els.startDateValue.textContent = (date && !isNaN(date)) ? date.toLocaleDateString() : '';
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
    if (els.closingStatusSelect) {
      els.closingStatusSelect.value = rawCS;
    }
    const { date: closingDatePart, time: closingTimePart } =
      splitDateTimeForInputs(primaryEntry.closingDateTime || '');
    const closingDateEl = els.closingDateInput;
    const closingTimeEl = els.closingTimeInput;
    if (closingDateEl) closingDateEl.value = closingDatePart || '';
    if (closingTimeEl) {
      closingTimeEl.value = closingTimePart || '';
      closingTimeEl.classList.toggle('is-blank', !closingTimePart);
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
  const phoneFrom = (o) => {
    const raw = o?.phone ?? o?.mobile ?? o?.cell ?? o?.primaryPhone ?? '';
    return formatPhoneDisplay(raw);
  };
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
  const el  = (id) => document.getElementById(id);
  const set = (node, v) => { if (node) node.textContent = v ?? ''; };
  const all = (css) => Array.from(document.querySelectorAll(css));

  const L = primaryEntry?.lender ?? {};

  // helpers
  const nonEmpty = (v) => v != null && String(v).trim() !== '';
  const first = (...vals) => {
    for (const v of vals) if (nonEmpty(v)) return String(v).trim();
    return '';
  };

  // Name: first/last -> name/fullName -> primaryEntry fallbacks
  const displayName = first(
    `${L.firstName ?? ''} ${L.lastName ?? ''}`.trim(),
    L.name, L.fullName,
    primaryEntry?.lenderName,
    `${primaryEntry?.lenderFirstName ?? ''} ${primaryEntry?.lenderLastName ?? ''}`.trim()
  );

  // Brokerage: include lenderBrokerage + common variants (flat & nested)
  const brokerage = first(
    L.lenderBrokerage,             // <- THIS was missing before
    L.brokerage, L.brokerageName, L?.brokerage?.name,
    L.company, L.companyName, L?.company?.name,
    L.organization, L.organizationName, L.org, L?.org?.name,
    primaryEntry?.lenderBrokerage, primaryEntry?.lenderCompany, primaryEntry?.lenderOrganization
  );

  // Compose final line
  const nameLine = displayName
    ? (brokerage ? `${displayName} - ${brokerage}` : displayName)
    : (brokerage || 'No lender linked');

  // Write to DOM (support both cached els.* and direct lookup)
  const target = els?.lenderNameFinance || el('lenderNameFinance');
  set(target, nameLine);

  // If somehow there are duplicate IDs in the page, set them all defensively
  if (!target) all('#lenderNameFinance').forEach(n => set(n, nameLine));

  // Phone / Email (with a few extra fallbacks)
  const rawPhone = first(L.phone, L.mobile, L.cell, L.primaryPhone, primaryEntry?.lenderPhone);
  const phone = formatPhoneDisplay(rawPhone);
  const email = first(L.email, L.emailAddress, primaryEntry?.lenderEmail);
  set(els?.lenderPhoneFinance || el('lenderPhoneFinance'), phone);
  set(els?.lenderEmailFinance || el('lenderEmailFinance'), email);
}

};

export const setInitialFormValues = (lot, primaryEntry) => {
  // ----- helpers (local, no imports needed)
  const $ = (el) => el || null;
  const getEl = (k) => els[k] || document.getElementById(k);
  const asLocalDate = (v) => {
    if (!v) return '';
    try {
      const d = (v instanceof Date) ? v : new Date(v);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
    } catch { return ''; }
  };
  const toDateInputValue = (v) => {
    if (!v) return '';
    try {
      const d = (v instanceof Date) ? v : new Date(v);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch { return ''; }
  };

  // ----- General & dates (existing)
  if (els.elevationInput) els.elevationInput.value = lot.elevation ?? '';
  if (els.releaseDateInput) els.releaseDateInput.value = toDateInputValue(lot.releaseDate);
  if (els.expectedCompletionInput) els.expectedCompletionInput.value = toDateInputValue(lot.expectedCompletionDate);
  if (els.closeMonthInput) els.closeMonthInput.value = lot.closeMonth ?? '';

  // ----- Walks (existing)
  if (els.thirdPartyInput) els.thirdPartyInput.value = lot.thirdParty ? toLocalInputDateTime(lot.thirdParty) : '';
  if (els.firstWalkInput) els.firstWalkInput.value = lot.firstWalk ? toLocalInputDateTime(lot.firstWalk) : '';
  if (els.finalSignOffInput) els.finalSignOffInput.value = lot.finalSignOff ? toLocalInputDateTime(lot.finalSignOff) : '';

  // ----- List price (existing)
  if (els.listPriceInput) {
    const formattedListPrice = formatCurrency(lot.listPrice);
    els.listPriceInput.value = formattedListPrice || (lot.listPrice ?? '');
  }

  // ===== NEW: Sales Price & Sales Date (read-only display nodes) =====
  // Try primaryEntry first, then lot, with common field-name fallbacks.
  const salesPriceRaw =
      primaryEntry?.salesPrice ?? primaryEntry?.contractPrice ?? primaryEntry?.purchasePrice ??
      lot.salesPrice ?? lot.contractPrice ?? lot.purchasePrice ?? '';

  const salesDateRaw =
      primaryEntry?.salesDate ?? primaryEntry?.contractDate ?? primaryEntry?.salesDateTime ??
      lot.salesDate ?? lot.salesDateTime ?? '';

  const spEl = getEl('salesPriceValue');
  const sdEl = getEl('salesDateValue');

  if ($(spEl)) {
    const formattedSalesPrice = formatCurrency(salesPriceRaw);
    spEl.textContent = formattedSalesPrice || (salesPriceRaw ? String(salesPriceRaw) : '');
  }
  if ($(sdEl)) sdEl.textContent = asLocalDate(salesDateRaw);

  // ----- Selects (existing)
  if (els.buildingStatusSelect) els.buildingStatusSelect.value = lot.status || 'Not-Started';
  if (els.walkStatusSelect) els.walkStatusSelect.value = lot.walkStatus || 'waitingOnBuilder';
  if (els.closingStatusSelect && primaryEntry) {
    els.closingStatusSelect.value = primaryEntry.closingStatus || 'notLocked';
  }
  {
    const dateEl = els.closingDateInput;
    const timeEl = els.closingTimeInput;
    const { date, time } = splitDateTimeForInputs(primaryEntry?.closingDateTime || '');
    if (dateEl) dateEl.value = date || '';
    if (timeEl) {
      timeEl.value = time || '';
      timeEl.classList.toggle('is-blank', !time);
    }
  }
  {
  const gSel = els.generalStatusSelect || document.getElementById('generalStatusSelect');
  if (gSel) gSel.value = lot.generalStatus ?? 'Available';
}
};
