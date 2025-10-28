﻿import { setLenderIdFromURL, state } from './state.js';
import { fetchLender, fetchRelatedContacts } from './api.js';
import { dom } from './domCache.js';
import { updateHeader, disableEditor, wireEditorToggle } from './identity.js';
import { populateForm, setupAutosave } from './editor.js';
import { initTopBar } from './topbar.js';
import { renderTable, renderPurchasedTable } from './table.js';

const normalizeStatus = (raw = '') => {
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (s.includes('sub') && s.includes('application')) return 'sub-application';
  if (s.includes('sub') && s.includes('doc')) return 'sub-docs';
  if (s.includes('missing') && s.includes('doc')) return 'missing-docs';
  if (s.includes('cannot') && s.includes('qual')) return 'cannot-qualify';
  return s;
};

const pickLenderEntry = (contact) => {
  const entries = contact?.lenders || [];
  const target = state.lenderId ? String(state.lenderId) : null;
  if (target) {
    const match = entries.find((entry) => {
      const entryId = entry?.lender?._id || entry?.lender;
      return entryId && String(entryId) === target;
    });
    if (match) return match;
  }
  return entries[0] || null;
};

const hasLinkedLotLocal = (contact = {}) => {
  const lot = contact.linkedLot || {};
  return Boolean(
    contact.lotId ||
    lot.lotId ||
    lot.communityId ||
    lot.address ||
    lot.jobNumber ||
    lot.block ||
    lot.phase ||
    lot.lot
  );
};

const computePurchasedFlag = (contact = {}) => {
  const status = String(contact.status || '').trim().toLowerCase();
  return status === 'purchased';
};

const annotateContacts = (list = []) =>
  list.map((contact) => {
    const entry = pickLenderEntry(contact);
    return {
      ...contact,
      _lenderStatus: normalizeStatus(entry?.status || ''),
      _purchasedWithLot: computePurchasedFlag(contact),
      _hasLinkedLot: hasLinkedLotLocal(contact)
    };
  });

const TAB = { ALL: 'all', PURCHASED: 'purchased' };

function toggleTabs(target = TAB.ALL) {
  const { tabs } = dom;
  if (!tabs) return;
  const showPurchased = target === TAB.PURCHASED;

  tabs.allPanel?.classList.toggle('is-hidden', showPurchased);
  tabs.purchasedPanel?.classList.toggle('is-hidden', !showPurchased);

  tabs.allBtn?.classList.toggle('active', !showPurchased);
  tabs.purchasedBtn?.classList.toggle('active', showPurchased);

  tabs.allBtn?.setAttribute('aria-selected', (!showPurchased).toString());
  tabs.purchasedBtn?.setAttribute('aria-selected', showPurchased.toString());
  tabs.allPanel?.setAttribute('aria-hidden', showPurchased ? 'true' : 'false');
  tabs.purchasedPanel?.setAttribute('aria-hidden', showPurchased ? 'false' : 'true');
}

function initTabs() {
  const { tabs } = dom;
  if (!tabs?.allBtn || !tabs?.purchasedBtn) return;

  tabs.allBtn.addEventListener('click', () => toggleTabs(TAB.ALL));
  tabs.purchasedBtn.addEventListener('click', () => toggleTabs(TAB.PURCHASED));

  toggleTabs(TAB.ALL);
}

async function init(){
  setLenderIdFromURL();
  if(!state.lenderId){ alert('Missing lender id'); return; }

  try{
    // Load lender & populate
    const lender = await fetchLender(state.lenderId);
    populateForm(lender);
    updateHeader();
    disableEditor(true);
    wireEditorToggle();
    setupAutosave();

    // Load related contacts & boot top bar + table
    const contacts = await fetchRelatedContacts(state.lenderId);
    state.allContacts = annotateContacts(contacts);
    state.purchasedContacts = state.allContacts.filter((contact) => contact._purchasedWithLot);

    // initial table render; topbar will re-render as filters change
    renderTable(state.allContacts);
    renderPurchasedTable(state.purchasedContacts);

    // kick off top bar (counts + filtering + More/Back + community)
    initTopBar(state.allContacts);
    initTabs();
  }catch(err){
    console.error(err);
    if(dom.tableBody) dom.tableBody.innerHTML = `<tr><td colspan="9">Error loading data.</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

