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

    // 2️⃣ Populate title & general info
    document.getElementById("lotTitle").textContent =
      `Lot ${lot.jobNumber} – ${lot.address}`;
    document.getElementById("jobNumberValue").textContent     = lot.jobNumber   || '';
    document.getElementById("lotBlockPhaseValue").textContent = `${lot.lot} / ${lot.block} / ${lot.phase}`;
    document.getElementById("addressValue").textContent       = lot.address     || '';
    document.getElementById("floorPlanValue").textContent      = lot.floorPlan   || '';
    document.getElementById("elevationValue").textContent      = lot.elevation   || '';
    document.getElementById("statusValue").textContent         = lot.status      || '';

    // 3️⃣ Schedule
    document.getElementById("releaseDateValue").textContent            = lot.releaseDate            || '';
    document.getElementById("expectedCompletionDateValue").textContent = lot.expectedCompletionDate || '';
    document.getElementById("closeMonthValue").textContent             = lot.closeMonth             || '';
    document.getElementById("thirdPartyValue").textContent             = lot.thirdParty             || '';

    // 4️⃣ Walks & Close
    document.getElementById("firstWalkValue").textContent    = lot.firstWalk    || '';
    document.getElementById("finalSignOffValue").textContent = lot.finalSignOff || '';

    // 5️⃣ Purchaser -> Contact
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

    // 6️⃣ Realtor -> via contact.realtor
    let realtor = null;
    if (purchaserContact?.realtor) {
      const raw       = purchaserContact.realtor;
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

    // 7️⃣ Lender -> from Purchaser contact
    let lenderObj = null;
    let lenderId;
    if (purchaserContact) {
      // contact may have 'lender' field or 'lenders' array
      const raw = purchaserContact.lender ?? (Array.isArray(purchaserContact.lenders) ? purchaserContact.lenders[0] : null);
      if (raw) {
        lenderId = typeof raw === 'object' ? raw._id : raw;
        console.log(`Fetching lender: ${lenderId}`);
        const lRes = await fetch(`/api/lenders/${lenderId}`);
        if (lRes.ok) lenderObj = await lRes.json();
        else console.error(`Lender fetch failed: ${lRes.status}`);
      }
    }
    if (lenderObj) {
      document.getElementById("lenderNameFinance").textContent  =
        lenderObj.name || `${lenderObj.firstName || ''} ${lenderObj.lastName || ''}`.trim();
      document.getElementById("lenderPhoneFinance").textContent = lenderObj.phone || '';
      document.getElementById("lenderEmailFinance").textContent = lenderObj.email || '';
    }

  } catch (err) {
    console.error("Failed to load lot details:", err);
    document.getElementById("lotTitle").innerText = "Error loading lot";
  }
});
