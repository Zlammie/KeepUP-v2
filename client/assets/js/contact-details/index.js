// assets/js/contact-details/index.js
import { initState } from './state.js';
import { cacheDOM } from './domCache.js';
import { hydrateAll } from './hydrate.js';
import { bindAutosave } from './contact-autosave.js';
import { initStatusLogic } from './status.js';
import { initCommunitySection, populateCommunities } from './communitySection.js';
import { getContact } from './state.js';
import { initLotLinking } from './lotLink.js';
import { initRealtorSearch } from './realtorSearch.js';
import { initLenderSearch } from './lenderSearch.js';
import { setupCommentSection } from './commentLoader.js';
import { on, emit } from './events.js';
import { initMiscUI } from './ui.js';
import { initLotSearch } from './lotSearch.js';

window.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('contact-details-root');
  if (!root) {
    console.error('[contact-details] Missing #contact-details-root — aborting init');
    return;
  }

  const contactId = root.dataset.contactId;
  const initialStatus = root.dataset.initialStatus;

  try {
    // 1) Load state so other modules can read it
    await initState({ contactId, initialStatus });

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

    // 4) First paint
    await hydrateAll();
    await populateCommunities({ contact: getContact() });

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
