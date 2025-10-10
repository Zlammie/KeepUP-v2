// client/assets/js/my-community-competition/loader.js
import {
  selectEl, builderTitle, amenityList,
  statTotalLots, statLotsSold, statLotsRemaining, statQmiAvailable,
  promoText, hoaDisplay, taxDisplay,
  salesPerson, salesPersonPhone, salesPersonEmail,
  address, city, zip, modelPlan, lotSize, totalLots,
  garageTypeFront, garageTypeRear,
  schoolISD, elementarySchool, middleSchool, highSchool,
  hoaFee, hoaFrequency, tax, feeMud, feePid, feeNone,
  mudFeeGroup, pidFeeGroup, mudFee, pidFee,
  earnestAmount, realtorCommission
} from './dom.js';

import { enableUI } from './ui.js';
import { drawSalesGraph, drawBasePriceGraph, drawQmiSoldsGraph } from './charts.js';
import { fetchCommunityOptions, fetchCommunityProfile, fetchSalesSeries } from './api.js';
import { setCommunityId, setProfile } from './state.js'; // <-- only these two
import { bindAutosaveOnce } from './autosave.js';

export function wireCommunitySelect() {
  selectEl.addEventListener('change', async () => {
    const id = selectEl.value;
    if (!id || id === 'undefined') {          // guard
      enableUI(false);
      setCommunityId(null);
      return;
    }
    await onSelectCommunity(id);
  });
}

export async function initialLoad() {
  try {
    const list = await fetchCommunityOptions();

    // Reset + placeholder
    selectEl.innerHTML = '<option value="">-- Select a community --</option>';

    // Build options (support {id,label} OR {_id,name/communityName,builder/builderName})
    for (const c of list || []) {
      const id = c.id || c._id;
      if (!id) continue;                       // skip anything without an id

      const name    = c.label || c.name || c.communityName || '(unnamed)';
      const builder = c.builder || c.builderName || '';
      const label   = c.label || (builder ? `${builder} — ${name}` : name);

      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      selectEl.appendChild(opt);
    }

    // Preselect via ?communityId=... if present and valid
    const preId = new URLSearchParams(window.location.search).get('communityId');
    if (preId && [...selectEl.options].some(o => o.value === preId)) {
      selectEl.value = preId;
      await onSelectCommunity(preId);
    } else {
      enableUI(false);
    }
  } catch (e) {
    console.error('Failed to load communities', e);
    enableUI(false);
  }
}

export async function onSelectCommunity(id) {
  try {
    if (!id || id === 'undefined') return;     // hard guard
    setCommunityId(id);

    const { community, profile } = await fetchCommunityProfile(id);
    setProfile(profile);

    // Title
    builderTitle.textContent =
      `${community?.builderName || 'Your Builder'} – ${community?.name || community?.communityName || 'Your Community'}`;

    // Amenities
    amenityList.innerHTML = '';
    (community?.communityAmenities || []).forEach(group => {
      (group.items || []).forEach(item => {
        const li = document.createElement('li');
        li.className = 'chip';
        li.textContent = item;
        amenityList.appendChild(li);
      });
    });

    // Stats
    statTotalLots.textContent      = profile?.lotCounts?.total ?? '—';
    statLotsSold.textContent       = profile?.lotCounts?.sold ?? '—';
    statLotsRemaining.textContent  = profile?.lotCounts?.remaining ?? '—';
    statQmiAvailable.textContent   = profile?.lotCounts?.quickMoveInLots ?? '—';

    // Promo & HOA / taxes
    promoText.textContent = (profile?.promotion && profile.promotion.trim()) ? profile.promotion : 'No promotion recorded.';
    const effHoaFee  = (profile?.hoaFee ?? community?.hoaFee);
    const effHoaFreq = profile?.hoaFrequency ?? null;
    hoaDisplay.textContent = (effHoaFee != null && effHoaFee !== '')
      ? (effHoaFreq ? `$${effHoaFee} / ${effHoaFreq}` : `$${effHoaFee}`)
      : 'Not specified';

    const effTax = (profile?.tax ?? community?.tax);
    taxDisplay.textContent = (effTax != null && effTax !== '') ? `${effTax}%` : 'Not specified';

    // Left sidebar inputs …
    salesPerson.value        = profile?.salesPerson || '';
    salesPersonPhone.value   = profile?.salesPersonPhone || '';
    salesPersonEmail.value   = profile?.salesPersonEmail || '';
    address.value            = (profile?.address ?? community?.address ?? '');
    city.value               = (profile?.city    ?? community?.city    ?? '');
    zip.value                = (profile?.zip     ?? community?.zip     ?? '');
    lotSize.value            = profile?.lotSize || '';
    totalLots.value          = profile?.lotCounts?.total ?? '';
    totalLots.setAttribute('readonly', 'readonly');
    (profile?.garageType === 'Front') ? (garageTypeFront.checked = true)
      : (profile?.garageType === 'Rear') ? (garageTypeRear.checked  = true) : null;
    schoolISD.value        = (profile?.schoolISD        ?? community?.schoolISD        ?? '');
    elementarySchool.value = (profile?.elementarySchool ?? community?.elementarySchool ?? '');
    middleSchool.value     = (profile?.middleSchool     ?? community?.middleSchool     ?? '');
    highSchool.value       = (profile?.highSchool       ?? community?.highSchool       ?? '');
    hoaFee.value           = (profile?.hoaFee ?? community?.hoaFee ?? '');
    hoaFrequency.value     = (profile?.hoaFrequency ?? '');
    tax.value              = (profile?.tax ?? community?.tax ?? '');

    const fees = profile?.feeTypes || [];
    feeMud.checked  = fees.includes('MUD');
    feePid.checked  = fees.includes('PID');
    feeNone.checked = fees.includes('None');
    mudFee.value    = profile?.mudFee ?? '';
    pidFee.value    = profile?.pidFee ?? '';
    mudFeeGroup.style.display = feeMud.checked ? '' : 'none';
    pidFeeGroup.style.display = feePid.checked ? '' : 'none';

    earnestAmount.value     = profile?.earnestAmount ?? '';
    realtorCommission.value = profile?.realtorCommission ?? '';

    // Notify others
    window.dispatchEvent(new CustomEvent('mcc:profileLoaded', { detail: { profile, communityId: id, community } }));

    enableUI(true);
    bindAutosaveOnce();

    // Active tab → draw correct chart
    const activeTab = document.querySelector('.tab-btn.is-active');
    const tab = activeTab ? activeTab.dataset.tab : 'sales';
    if (tab === 'sales') {
      await drawSalesGraph(id);
    } else if (tab === 'base') {
      await drawBasePriceGraph(id);
    } else if (tab === 'qmi') {
      await drawQmiSoldsGraph(id);
    }
  } catch (e) {
    console.error('Failed to load profile', e);
    enableUI(false);
  }
}
