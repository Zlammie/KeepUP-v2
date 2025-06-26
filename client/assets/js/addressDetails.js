// public/scripts/addressDetails.js

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const commId = params.get("communityId");
  const lotId  = params.get("lotId");
  if (!commId || !lotId) {
    console.error("Missing communityId or lotId");
    return;
  }

  try {
    // 1️⃣ Fetch lot details
    const res = await fetch(`/api/communities/${commId}/lots/${lotId}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const lot = await res.json();

    // 2️⃣ Populate title & static fields
    document.getElementById("lotTitle").textContent =
      `Lot ${lot.jobNumber} – ${lot.address}`;
    document.getElementById("jobNumberValue").textContent = lot.jobNumber || '';
    document.getElementById("lotBlockPhaseValue").textContent =
      `${lot.lot} / ${lot.block} / ${lot.phase}`;
    document.getElementById("addressValue").textContent = lot.address || '';

   function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    const datePart = d.toLocaleDateString();  
    // hour:minute only, no seconds
    const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
    return `${datePart} ${timePart}`;
  }
   // 3️⃣ Populate form controls instead of legacy <div>s
    const fpSelect = document.getElementById("floorPlanSelect");
    if (fpSelect) {
      fpSelect.innerHTML = '<option value="" disabled selected>— Select Floor Plan —</option>';
      const fpRes = await fetch('/api/floorplans');
      if (fpRes.ok) {
        (await fpRes.json()).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p._id;
          opt.textContent = `${p.planNumber} – ${p.name}`;
          fpSelect.appendChild(opt);
        });
        if (lot.floorPlan && lot.floorPlan._id) fpSelect.value = lot.floorPlan._id;
        if (lot.floorPlan) fpSelect.value = lot.floorPlan;
      }
    }

    const elevIn = document.getElementById("elevationInput");
    if (elevIn) elevIn.value = lot.elevation || '';

    const buildingSelect = document.getElementById("buildingStatusSelect");
      function updateBuildingSelectStyle(val) {
        // remove any old classes
        Object.values(buildingClasses).forEach(c => buildingSelect.classList.remove(c));
        // add the new one
        buildingSelect.classList.add(buildingClasses[val]);
      }

      const buildingLabels = {
        'Not-Started':        'Not Started',
        'Under-Construction': 'Under Construction',
        'Finished':           'Finished'
      };
      const buildingClasses = {
        'Not-Started':        'not-started',
        'Under-Construction': 'under-construction',
        'Finished':           'finished'
      };

      // initial styling:
      updateBuildingSelectStyle(buildingSelect.value);

      // when the user changes it, re-style + auto-save + update badge
      buildingSelect.addEventListener("change", async (e) => {
        const newVal = e.target.value;
        updateBuildingSelectStyle(newVal);

        // 1) auto-save (you may already have this via autoSaveMap)
        await fetch(`/api/communities/${commId}/lots/${lotId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newVal })
        });

        // 2) update the top‐bar badge
        const badgeEl = document.getElementById("buildingStatusValue");
        badgeEl.innerHTML = `<span class="status-badge ${buildingClasses[newVal]}">${buildingLabels[newVal]}</span>`;
      });

    const rdIn = document.getElementById("releaseDateInput");
    if (rdIn) rdIn.value = lot.releaseDate || '';

    const ecIn = document.getElementById("expectedCompletionInput");
    if (ecIn) ecIn.value = lot.expectedCompletionDate || '';

    const cmIn = document.getElementById("closeMonthInput");
    if (cmIn) cmIn.value = lot.closeMonth || '';

    // 4️⃣ Populate walks & close
   const thirdPartyIn   = document.getElementById("thirdPartyInput");
    const firstWalkIn    = document.getElementById("firstWalkInput");
    const finalSignIn    = document.getElementById("finalSignOffInput");

    if (thirdPartyIn) {
      thirdPartyIn.value = lot.thirdParty
        ? new Date(lot.thirdParty).toISOString().slice(0,16)
        : '';
    }
    if (firstWalkIn) {
      firstWalkIn.value = lot.firstWalk
        ? new Date(lot.firstWalk).toISOString().slice(0,16)
        : '';
    }
    if (finalSignIn) {
      finalSignIn.value = lot.finalSignOff
        ? new Date(lot.finalSignOff).toISOString().slice(0,16)
        : '';
    }

      const walkStatusSelect = document.getElementById("walkStatusSelect");

      const walkStatusLabels = {
        waitingOnBuilder:       'Waiting on Builder',
        datesSentToPurchaser:   'Dates Sent to Purchaser',
        datesConfirmed:         'Dates Confirmed',
        thirdPartyComplete:     '3rd Party Complete',
        firstWalkComplete:      '1st Walk Complete',
        finalSignOffComplete:   'Final Sign Off Complete'
      };

      // Walk‐status maps:
      const walkStatusClasses = {
        waitingOnBuilder:       'waiting-on-builder',
        datesSentToPurchaser:   'dates-sent-to-purchaser',
        datesConfirmed:         'dates-confirmed',
        thirdPartyComplete:     'third-party-complete',
        firstWalkComplete:      'first-walk-complete',
        finalSignOffComplete:   'final-sign-off-complete'
      };
    
        if (walkStatusSelect) {
      walkStatusSelect.value = lot.walkStatus || 'waitingOnBuilder';
    }

          // helper to restyle the select
      function updateWalkSelectStyle(val) {
        Object.values(walkStatusClasses).forEach(c => walkStatusSelect.classList.remove(c));
        walkStatusSelect.classList.add(walkStatusClasses[val]);
      }
      // initial tint:
      updateWalkSelectStyle(walkStatusSelect.value);

      // on change: auto-save, update badge + tint
      walkStatusSelect.addEventListener("change", async e => {
        const newVal = e.target.value;
        updateWalkSelectStyle(newVal);

        await fetch(`/api/communities/${commId}/lots/${lotId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walkStatus: newVal })
        });

        // refresh top-bar badge
        document.getElementById("walkStatusValue").innerHTML =
          `<span class="status-badge ${walkStatusClasses[newVal]}">${walkStatusLabels[newVal]}</span>`;
      });

    // 5️⃣ Purchaser/Contact
    let purchaserContact = null;
    if (lot.purchaser) {
      const cRes = await fetch(`/api/contacts/${lot.purchaser._id}`);
      if (cRes.ok) purchaserContact = await cRes.json();
      else console.error(`Contact fetch failed: ${cRes.status}`);
    }
    if (purchaserContact) {
      document.getElementById("purchaserValue").textContent      = purchaserContact.lastName || '';
      document.getElementById("purchaserPhoneValue").textContent = purchaserContact.phone    || '';
      document.getElementById("purchaserEmailValue").textContent = purchaserContact.email    || '';
    }
    console.log('PURCHASER CONTACT:', purchaserContact);
    console.log('primaryLender field:', purchaserContact.primaryLender);

    // 6️⃣ Realtor
    let realtor = null;
    if (purchaserContact?.realtor) {
      const raw = purchaserContact.realtor;
      const realtorId = typeof raw === 'object' ? raw._id : raw;
      console.log(`Fetching realtor: ${realtorId}`);
      const rRes = await fetch(`/api/realtors/${realtorId}`);
      if (rRes.ok) realtor = await rRes.json();
      else console.error(`Realtor fetch failed: ${rRes.status}`);
    }
    if (realtor) {
      document.getElementById("realtorNameValue").textContent  = `${realtor.firstName} ${realtor.lastName}`;
      document.getElementById("realtorPhoneValue").textContent = realtor.phone || '';
      document.getElementById("realtorEmailValue").textContent = realtor.email || '';
    }

    // 7️⃣ Lender (from purchaserContact, later)
    let primaryEntry = null;
      if (purchaserContact?.lenders?.length) {
        primaryEntry = purchaserContact.lenders.find(e => e.isPrimary);
      }
      if (primaryEntry?.lender) {
        const L = primaryEntry.lender;
        document.getElementById("lenderNameFinance").textContent  =
          L.name || `${L.firstName} ${L.lastName}`;
        document.getElementById("lenderPhoneFinance").textContent = L.phone || '';
        document.getElementById("lenderEmailFinance").textContent = L.email || '';
      }

            // ── Closing‐Status maps ──
      const closingStatusLabels = {
        notLocked:    'Not Locked',
        locked:       'Locked',
        underwriting: 'Underwriting',
        clearToClose: 'Clear to Close'
      };
      const closingStatusClasses = {
        notLocked:    'not-locked',
        locked:       'locked',
        underwriting: 'underwriting',
        clearToClose: 'clear-to-close'
      };
      const closingStatusSelect = document.getElementById("closingStatusSelect");
const closingDateInput     = document.getElementById("closingDateTimeInput");

if (primaryEntry) {
  // populate closingStatus
  if (closingStatusSelect) {
    closingStatusSelect.value = primaryEntry.closingStatus || "notLocked";
  }
  // helper to tint the <select>
function updateClosingSelectStyle(val) {
  Object.values(closingStatusClasses).forEach(c =>
    closingStatusSelect.classList.remove(c)
  );
  closingStatusSelect.classList.add(closingStatusClasses[val]);
}
// initial tint
updateClosingSelectStyle(closingStatusSelect.value);

// on change: tint + auto‐save + update top‐bar badge
closingStatusSelect.addEventListener("change", async e => {
  const newVal = e.target.value;
  updateClosingSelectStyle(newVal);

  // auto‐save back to the Contact
  await fetch(`/api/contacts/${purchaserContact._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lenders: purchaserContact.lenders.map(l =>
        l.isPrimary
          ? { ...l, closingStatus: newVal }
          : l
      )
    })
  });

  // update top‐bar badge
  const badgeEl = document.getElementById("closingStatusValue");
  badgeEl.innerHTML = `<span class="status-badge ${closingStatusClasses[newVal]}">
    ${closingStatusLabels[newVal]}
  </span>`;
});
  // populate closingDateTime
  if (closingDateInput && primaryEntry.closingDateTime) {
    closingDateInput.value = new Date(primaryEntry.closingDateTime)
                              .toISOString().slice(0,16);
  }
}

// when you change the closing status, auto-save it
if (closingStatusSelect) {
  closingStatusSelect.addEventListener("change", async e => {
    const newVal = e.target.value;
    try {
      await fetch(`/api/contacts/${purchaserContact._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lenders: purchaserContact.lenders.map(l =>
            l.isPrimary
              ? { ...l, closingStatus: newVal }
              : l
          )
        })
      });
      console.log("Saved closingStatus:", newVal);
    } catch (err) {
      console.error("Failed to save closingStatus", err);
    }
  });
}

// when you blur the date-time picker, auto-save it
if (closingDateInput) {
  closingDateInput.addEventListener("blur", async e => {
    const dt = e.target.value; // e.g. "2025-06-30T15:00"
    try {
      await fetch(`/api/contacts/${purchaserContact._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lenders: purchaserContact.lenders.map(l =>
            l.isPrimary
              ? { ...l, closingDateTime: dt }
              : l
          )
        })
      });
      console.log("Saved closingDateTime:", dt);
    } catch (err) {
      console.error("Failed to save closingDateTime", err);
    }
  });
}
    
//Status Populate

const lenderStatusLabels = {
  invite:               'Invite',
  submittedApplication: 'Submitted Application',
  submittedDocs:        'Submitted Docs',
  missingDocs:          'Missing Docs',
  approved:             'Approved',
  cannotQualify:        'Cannot Qualify'
};
 const lenderStatusClasses = {
    invite:               'invite',
    submittedApplication: 'submitted',
    submittedDocs:        'submitted',
    missingDocs:          'missing',
    approved:             'approved',
    cannotQualify:        'cannot-qualify'
  };

// Building Status  ← from lot.status
const rawBuilding = lot.status || "Not-Started";
const bLabel   = buildingLabels[rawBuilding];
const bClass   = buildingClasses[rawBuilding];
document.getElementById("buildingStatusValue").innerHTML =
  `<span class="status-badge ${bClass}">${bLabel}</span>`;

// Start Date  ← from lot.releaseDate
document.getElementById("startDateValue").textContent =
  lot.releaseDate || '';

  // 3rd Party
if (lot.thirdParty) {
   document.getElementById("thirdPartyStatusValue").textContent =
       formatDateTime(lot.thirdParty);
} else {
  document.getElementById("thirdPartyStatusValue").textContent = '';
}

// 1st Walk
if (lot.firstWalk) {
  document.getElementById("firstWalkStatusValue").textContent =
    formatDateTime(lot.firstWalk);
} else {
  document.getElementById("firstWalkStatusValue").textContent = '';
}

// Final Sign Off
if (lot.finalSignOff) {
  document.getElementById("finalSignOffStatusValue").textContent =
    formatDateTime(lot.finalSignOff);
} else {
  document.getElementById("finalSignOffStatusValue").textContent = '';
}

// Walk Status ← from lot.walkStatus
document.getElementById("walkStatusValue").textContent =
  lot.walkStatus
    ? (walkStatusLabels[lot.walkStatus] || lot.walkStatus)
    : '';
    const rawWalk = lot.walkStatus || 'waitingOnBuilder';
    const wLabel = walkStatusLabels[rawWalk];
    const wClass = walkStatusClasses[rawWalk];
    document.getElementById("walkStatusValue").innerHTML =
      `<span class="status-badge ${wClass}">${wLabel}</span>`;

// Lender Status  ← from contact’s primary lender entry
if (primaryEntry) {
  const raw = primaryEntry.status || 'invite';
  const label   = lenderStatusLabels[raw];
  const cssCls  = lenderStatusClasses[raw];
  document.getElementById("lenderStatusValue").innerHTML =
    `<span class="status-badge ${cssCls}">${label}</span>`;
}

  

// Closing Status  ← from contact’s closingStatus
if (primaryEntry) {
  const rawCS = primaryEntry.closingStatus || '';
  {
  const raw = primaryEntry.closingStatus || "notLocked";
  const lbl = closingStatusLabels[raw];
  const cls = closingStatusClasses[raw];
  document.getElementById("closingStatusValue").innerHTML =
    `<span class="status-badge ${cls}">${lbl}</span>`;
}
    closingStatusLabels[rawCS] || rawCS.charAt(0).toUpperCase() + rawCS.slice(1);
}

// Closing Date  ← formatted closingDateTime
if (primaryEntry?.closingDateTime) {
  document.getElementById("closingDateValue").textContent =
   formatDateTime(primaryEntry.closingDateTime);
}

    // 8️⃣ Auto-save handlers
    const autoSaveMap = [
      { id: 'floorPlanSelect', key: 'floorPlan' },
      { id: 'elevationInput', key: 'elevation' },
      { id: 'buildingStatusSelect', key: 'status' },
      { id: 'releaseDateInput', key: 'releaseDate' },
      { id: 'expectedCompletionInput', key: 'expectedCompletionDate' },
      { id: 'closeMonthInput', key: 'closeMonth' },
      { id: 'thirdPartyInput',       key: 'thirdParty'          },
      { id: 'firstWalkInput',        key: 'firstWalk'           },
      { id: 'finalSignOffInput',     key: 'finalSignOff'        },
       { id: 'walkStatusSelect', key: 'walkStatus' },
    ];
    autoSaveMap.forEach(({id, key}) => {
      const el = document.getElementById(id);
      if (!el) return;
      const eventType = el.tagName === 'SELECT' ? 'change' : 'blur';
      el.addEventListener(eventType, async (evt) => {
        console.log('▶ auto-saving', key, '→', evt.target.value);
        const payload = { [key]: evt.target.value };
        try {
          const saveRes = await fetch(
            `/api/communities/${commId}/lots/${lotId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }
          );
          if (!saveRes.ok) throw new Error(`Save failed: ${saveRes.status}`);
        } catch (err) {
          console.error('Auto-save error for', key, err);
        }
      });
    });

  } catch (err) {
    console.error("Failed to load lot details:", err);
    document.getElementById("lotTitle").innerText = "Error loading lot";
  }
});
