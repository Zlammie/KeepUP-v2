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

    // 3️⃣ Populate dynamic controls
    // Floor Plan select
    const fpSelect = document.getElementById("floorPlanSelect");
    const fpRes = await fetch('/api/floorplans');
    if (fpRes.ok) {
      const plans = await fpRes.json();
      plans.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p._id;
        opt.textContent = `${p.planNumber} – ${p.name}`;
        fpSelect.appendChild(opt);
      });
      if (lot.floorPlan && lot.floorPlan._id) fpSelect.value = lot.floorPlan._id;
    }

    // Elevation, status, dates
    document.getElementById("elevationInput").value          = lot.elevation || '';
    document.getElementById("buildingStatusSelect").value    = lot.status    || 'Not-Started';
    document.getElementById("releaseDateInput").value        = lot.releaseDate            || '';
    document.getElementById("expectedCompletionInput").value = lot.expectedCompletionDate || '';
    document.getElementById("closeMonthInput").value         = lot.closeMonth             || '';

    // 4️⃣ Populate walks & close
    document.getElementById("firstWalkValue").textContent    = lot.firstWalk    || '';
    document.getElementById("finalSignOffValue").textContent = lot.finalSignOff || '';

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
    let lenderObj = null;
      if (purchaserContact?.primaryLender) {
        const raw = purchaserContact.primaryLender;
        const lenderId = typeof raw === 'object' ? raw._id : raw;
        console.log(`Fetching primary lender: ${lenderId}`);
        const lRes = await fetch(`/api/lenders/${lenderId}`);
        if (lRes.ok) {
          lenderObj = await lRes.json();
        } else {
          console.error(`Primary lender fetch failed: ${lRes.status}`);
        }
      }

      if (lenderObj) {
        document.getElementById("lenderNameFinance").textContent  =
          lenderObj.name || `${lenderObj.firstName || ''} ${lenderObj.lastName || ''}`.trim();
        document.getElementById("lenderPhoneFinance").textContent = lenderObj.phone || '';
        document.getElementById("lenderEmailFinance").textContent = lenderObj.email || '';
      }
    // ... same logic as before when ready ...

    // 8️⃣ Auto-save handlers
    const autoSaveMap = [
      { id: 'floorPlanSelect', key: 'floorPlan' },
      { id: 'elevationInput', key: 'elevation' },
      { id: 'buildingStatusSelect', key: 'status' },
      { id: 'releaseDateInput', key: 'releaseDate' },
      { id: 'expectedCompletionInput', key: 'expectedCompletionDate' },
      { id: 'closeMonthInput', key: 'closeMonth' }
    ];
    autoSaveMap.forEach(({id, key}) => {
      const el = document.getElementById(id);
      if (!el) return;
      const eventType = el.tagName === 'SELECT' ? 'change' : 'blur';
      el.addEventListener(eventType, async (evt) => {
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
