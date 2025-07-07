

// autoSave.js
window.allowAutoSave = false;
// 1) Timer handle for debouncing saves
let saveTimeout;

// 2) Main auto‐save logic
async function autoSaveContact() {


  clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    const payload = {
      firstName:   document.getElementById('firstName').value,
      lastName:    document.getElementById('lastName').value,
      email:       document.getElementById('email').value,
      phone:       document.getElementById('phone').value,
      status:      document.getElementById('status').value,
      source:      document.getElementById('source').value,
      investor:    document.getElementById('investor').checked,
      owner:       document.getElementById('owner').value,
      communityId: document.getElementById('community-select').value,
      floorplans: Array.from(
       document.querySelectorAll('input[name="floorplans"]:checked')
      ).map(cb => cb.value),
      visitDate:   document.getElementById('visit-date').value,
      lotLineUp:   document.getElementById('lotLineUp').value,
      realtor:     window.updatedContactRealtorId || null,
    };

      const contactId = getContactId();
      console.log('Auto-save payload for', contactId, payload);

      try {
        if (!contactId) {
          console.error('[AutoSave] No contact ID available — aborting save.');
          return;
        }

        const res = await fetch(`/api/contacts/${contactId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(`Auto-save failed (${res.status}):`, data);
        } else {
          console.log('Auto-saved contact:', data);
        }
      } catch (err) {
        console.error('Auto-save network error:', err);
      }
  }, 500);
}


// 3) Attach the change listeners to your inputs/selects
function setupAutoSaveListeners() {
 if (!getContactId()) {
  console.error('No contact ID — auto-save disabled.');
    return;
  }
  const inputs = document.querySelectorAll(
    '#contactForm input:not(.no-auto), #contactForm select:not(.no-auto), .realtor-container input'
  );

  inputs.forEach(input => input.addEventListener('change', autoSaveContact));
}

// 4) Expose so your loader can call it when ready
window.setupAutoSaveListeners = setupAutoSaveListeners;
