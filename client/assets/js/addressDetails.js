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

    const bsSel = document.getElementById("buildingStatusSelect");
    if (bsSel) bsSel.value = lot.status || 'Not-Started';

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
    
        if (walkStatusSelect) {
      walkStatusSelect.value = lot.walkStatus || 'waitingOnBuilder';
    }

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
      const closingStatusSelect = document.getElementById("closingStatusSelect");
const closingDateInput     = document.getElementById("closingDateTimeInput");

if (primaryEntry) {
  // populate closingStatus
  if (closingStatusSelect) {
    closingStatusSelect.value = primaryEntry.closingStatus || "notLocked";
  }
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

const closingStatusLabels = {
  notLocked:    'Not Locked',
  locked:       'Locked',
  underwriting: 'Underwriting',
  clearToClose: 'Clear to Close'
};

const walkStatusLabels = {
  waitingOnBuilder:       'Waiting on Builder',
  datesSentToPurchaser:   'Dates Sent to Purchaser',
  datesConfirmed:         'Dates Confirmed',
  thirdPartyComplete:     '3rd Party Complete',
  firstWalkComplete:      '1st Walk Complete',
  finalSignOffComplete:   'Final Sign Off Complete'
};

// Building Status  ← from lot.status
document.getElementById("buildingStatusValue").textContent =
  lot.status || '';

// Start Date  ← from lot.releaseDate
document.getElementById("startDateValue").textContent =
  lot.releaseDate || '';

  // 3rd Party
if (lot.thirdParty) {
  document.getElementById("thirdPartyStatusValue").textContent =
    new Date(lot.thirdParty).toLocaleString();
} else {
  document.getElementById("thirdPartyStatusValue").textContent = '';
}

// 1st Walk
if (lot.firstWalk) {
  document.getElementById("firstWalkStatusValue").textContent =
    new Date(lot.firstWalk).toLocaleString();
} else {
  document.getElementById("firstWalkStatusValue").textContent = '';
}

// Final Sign Off
if (lot.finalSignOff) {
  document.getElementById("finalSignOffStatusValue").textContent =
    new Date(lot.finalSignOff).toLocaleString();
} else {
  document.getElementById("finalSignOffStatusValue").textContent = '';
}

// Walk Status ← from lot.walkStatus
document.getElementById("walkStatusValue").textContent =
  lot.walkStatus
    ? (walkStatusLabels[lot.walkStatus] || lot.walkStatus)
    : '';


// Lender Status  ← from contact’s primary lender entry
if (primaryEntry) {
  const rawLS = primaryEntry.status || '';
  document.getElementById("lenderStatusValue").textContent =
    lenderStatusLabels[rawLS] || rawLS.charAt(0).toUpperCase() + rawLS.slice(1);
}

// Closing Status  ← from contact’s closingStatus
if (primaryEntry) {
  const rawCS = primaryEntry.closingStatus || '';
  document.getElementById("closingStatusValue").textContent =
    closingStatusLabels[rawCS] || rawCS.charAt(0).toUpperCase() + rawCS.slice(1);
}

// Closing Date  ← formatted closingDateTime
if (primaryEntry?.closingDateTime) {
  document.getElementById("closingDateValue").textContent =
    new Date(primaryEntry.closingDateTime)
      .toLocaleString();
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
