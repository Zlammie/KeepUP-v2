// assets/js/contact-details/status.js
import { DOM } from './domCache.js';
import { getState, setContact } from './state.js';
import * as api from './api.js';

const PURCHASED = 'Purchased';

const STATUS_BG = {
  'new': '#0E79B2',
  'be-back': '#FFB347',
  'cold': '#4682B4',
  'target': '#6A0DAD',
  'possible': '#B57EDC',
  'negotiating': '#3CB371',
  'purchased': '#2E8B57',
  'closed': '#495057',
  'not-interested': '#FF6F61',
  'deal-lost': '#B22222',
  'bust': '#8B0000'
};

export function initStatusLogic() {
  // Initial badge + visibility sync (covers page reload)
  if (DOM.statusSelect) {
    paintStatusSelect();
    syncStatusBadge();
    updateStatusVisibility(DOM.statusSelect.value);
  }

  // Save + resync on change
  if (DOM.statusSelect) {
    DOM.statusSelect.addEventListener('change', async (e) => {
      const status = e.target.value;

      // First reflect in UI so it feels instant
      paintStatusSelect();  
      syncStatusBadge();
      updateStatusVisibility(status);

      // Persist to server and update local state
      try {
        const { contactId } = getState();
        const updated = await api.saveContact(contactId, { status });
        setContact({ status: updated?.status ?? status });
      } catch (err) {
        console.error('[status] save failed', err);
      }
    });
        // UX parity with old statusStyling.js:
    // show a neutral background while the native menu is open,
    // then restore the color shortly after it closes
    DOM.statusSelect.addEventListener('mousedown', () => {
      DOM.statusSelect.style.backgroundColor = '#fff';
      DOM.statusSelect.style.color = '#000';
    });
    window.addEventListener('pointerdown', (ev) => {
      if (!DOM.statusSelect.contains(ev.target)) {
        setTimeout(paintStatusSelect, 50);
      }
    });

  }
}

export function updateStatusVisibility(status) {
  const norm = normalize(status);
    // Show the linked-lot card for purchased *and* closed.
  const isPurchasedFlow = ['purchased', 'purchaser', 'closed'].includes(norm);
  // Only allow searching/linking when it's actively in Purchased/Purchaser.
  const allowLinking = norm === 'purchased' || norm === 'purchaser';

  const { linkedLot } = getState() || {};
    const hasLinked =
    !!linkedLot &&
    !!(linkedLot.lotId || linkedLot.lot?._id || linkedLot._id);

  // Be flexible with existing markup
  const communityBox = document.querySelector(
    '#community-section, #community-section-container, .community-section'
  );

    // Non-purchased → show community UI, hide all lot-link UIs
  if (!isPurchasedFlow) {
    if (communityBox) communityBox.style.display = '';
    if (DOM.communitySection) DOM.communitySection.style.display = '';
    if (DOM.lotLinkContainer) DOM.lotLinkContainer.style.display = 'none';
    const linkedCard = document.getElementById('linked-lot-display');
    if (linkedCard) linkedCard.style.display = 'none';
    const purchasedSelector = document.getElementById('purchased-community-selector');
    if (purchasedSelector) purchasedSelector.style.display = 'none';
    return;
  }

  // Purchased:
  // - If a lot is already linked → show the linked card, hide the search UI
  // - If no linked lot → show the search UI (and optional purchased selector)
  if (communityBox) communityBox.style.display = 'none';
  if (DOM.communitySection) DOM.communitySection.style.display = 'none';

  const linkedCard = document.getElementById('linked-lot-display');
  if (linkedCard) linkedCard.style.display = hasLinked ? 'block' : 'none';

  if (DOM.lotLinkContainer) DOM.lotLinkContainer.style.display = hasLinked ? 'none' : '';

  const purchasedSelector = document.getElementById('purchased-community-selector');
  if (purchasedSelector) {
    purchasedSelector.style.display = hasLinked ? 'none' : (allowLinking ? 'block' : 'none');
 }
}

function syncStatusBadge() {
  const badge = document.getElementById('contact-status-badge');
  if (!badge || !DOM.statusSelect) return;

  const raw = DOM.statusSelect.value || 'new';
  const key = normalize(raw);
  const label = formatStatusLabel(raw);

  badge.className = `status-badge ${key}`;
  const bg = STATUS_BG[key];
  if (bg) {
    badge.style.backgroundColor = bg;
    badge.style.color = (key === 'cold' || key === 'negotiating') ? '#000' : '#fff';
  } else {
    badge.style.backgroundColor = '';
    badge.style.color = '';
  }
  badge.textContent = label;
}

function paintStatusSelect() {
  const sel = DOM.statusSelect;
  if (!sel) return;
  const key = normalize(sel.value);
  const bg = STATUS_BG[key];
  if (bg) {
    sel.style.backgroundColor = bg;
    sel.style.color = (key === 'cold' || key === 'negotiating') ? '#000' : '#fff';
  } else {
    sel.style.backgroundColor = '';
    sel.style.color = '';
  }
}

function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function formatStatusLabel(s) {
  return String(s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function refreshStatusUI() {
  if (!DOM.statusSelect) return;
  // Repaint the badge and purchased/linked-lot visibility WITHOUT saving
  paintStatusSelect();
  syncStatusBadge();
  updateStatusVisibility(DOM.statusSelect.value);
}
