// assets/js/contact-details/index.js
import { initState } from './state.js';
import { cacheDOM } from './domCache.js';
import { hydrateAll } from './hydrate.js';
import { bindAutosave } from './contact-autosave.js';
import { initStatusLogic } from './status.js';
import { initCommunitySection } from './communitySection.js';
import { getContact } from './state.js';
import { initLotLinking } from './lotLink.js';
import { initRealtorSearch } from './realtorSearch.js';
import { initLenderSearch } from './lenderSearch.js';
import { setupCommentSection } from './commentLoader.js';
import { on, emit } from './events.js';
import { initMiscUI } from './ui.js';
import { initLotSearch } from './lotSearch.js';

activateDeferredStyles();

window.addEventListener('DOMContentLoaded', async () => {

  const root = document.getElementById('contact-details-root');
  if (!root) {
    console.error('[contact-details] Missing #contact-details-root — aborting init');
    return;
  }

  const contactId = root.dataset.contactId;
  const initialStatus = root.dataset.initialStatus;
  const currentUserId = root.dataset.currentUserId || null;
  const contactSeed = readContactSeed();

  try {
    // 1) Load state so other modules can read it
    await initState({ contactId, initialStatus, contactSeed });

    // 2) Cache DOM once
    cacheDOM();

    // 3) Static listeners / simple UI
    initMiscUI();              // More Details + Tasks toggles
    initStatusLogic();         // badge + purchased visibility
    initCommunitySection();    // community select change handler
    initLotLinking();          // linked-lot render from state
    initRealtorSearch();
    initLenderSearch();
    initLotSearch();
    setupCommentSection();

    setupLazyTaskPanel({ contactId, currentUserId });

    // 4) First paint
    await hydrateAll();

    // 5) Now that dynamic nodes exist, bind autosave
    bindAutosave();

    // Optional: error bus
    on('error', (e) => console.error('[contact-details]', e));
    window.addEventListener('unhandledrejection', (ev) => {
      console.error('[contact-details] Unhandled promise rejection:', ev.reason);
    });

    emit('init:done');
  } catch (err) {
    console.error('[contact-details] init failed:', err);
  }
});

function readContactSeed() {
  try {
    if (window.__CONTACT_SEED__ && typeof window.__CONTACT_SEED__ === 'object') {
      return window.__CONTACT_SEED__;
    }
  } catch (_) {
    /* ignore */
  }
  const el = document.getElementById('contact-seed');
  if (!el || !el.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (err) {
    console.warn('[contact-details] unable to parse contact seed JSON', err);
    return null;
  }
}

let taskPanelPromise = null;
function setupLazyTaskPanel({ contactId, currentUserId }) {
  const toggle = document.getElementById('todo-toggle');
  const panel = document.getElementById('todo-panel');
  if (!toggle || !panel) return;

  const load = () => {
    if (taskPanelPromise) return taskPanelPromise;
    taskPanelPromise = Promise.all([
      import('./tasks.js'),
      import('./lotSalesPriceTask.js'),
      import('./lenderLinkTask.js'),
    ])
      .then(([tasksMod, salesMod, lenderMod]) => {
        tasksMod?.initTaskPanel?.({ contactId, currentUserId, defaultAssignmentTarget: 'contact' });
        salesMod?.initLotSalesPriceAutomation?.();
        lenderMod?.initLenderLinkAutomation?.();
      })
      .catch((err) => console.error('[contact-details] failed to load tasks panel', err));
    return taskPanelPromise;
  };

  const handleFirstIntent = () => {
    load();
    teardown();
  };

  const teardown = () => {
    toggle.removeEventListener('click', onToggleClick);
    panel.removeEventListener('pointerenter', handleFirstIntent);
    panel.removeEventListener('focusin', handleFirstIntent);
  };

  const onToggleClick = () => {
    // wait a tick to let any expand/collapse UI settle
    requestAnimationFrame(() => {
      load();
    });
  };

  toggle.addEventListener('click', onToggleClick, { once: true });
  panel.addEventListener('pointerenter', handleFirstIntent, { once: true });
  panel.addEventListener('focusin', handleFirstIntent, { once: true });

  // Ensure the task panel hydrates on initial load so counts/details are present
  load();
}

function activateDeferredStyles() {
  const apply = () => {
    const links = document.querySelectorAll('link[rel="preload"][as="style"][data-defer-css]');
    links.forEach((link) => {
      link.rel = 'stylesheet';
      link.removeAttribute('as');
    });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    apply();
  } else {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }
}
