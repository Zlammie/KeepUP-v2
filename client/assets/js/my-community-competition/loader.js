// client/assets/js/my-community-competition/loader.js
import {
  selectEl, builderTitle, openAmenitiesBtn,
  statTotalLots, statLotsSold, statLotsRemaining, statQmiAvailable,
  promoText, hoaDisplay, taxDisplay,
  salesPerson, salesPersonPhone, salesPersonEmail,
  address, city, zip, modelPlan, lotSize, totalLots,
  garageTypeFront, garageTypeRear,
  schoolISD, elementarySchool, middleSchool, highSchool,
  hoaFee, hoaFrequency, tax, feeMud, feePid, feeNone,
  mudFeeGroup, pidFeeGroup, mudFee, pidFee, pidFeeFrequency,
  earnestAmount, realtorCommission
} from './dom.js';

import { enableUI } from './ui.js';
import { drawSalesGraph, drawBasePriceGraph, drawQmiSoldsGraph, drawSqftComparisonGraph } from './charts.js';
import { fetchCommunityOptions, fetchCommunityProfile, fetchCommunityFloorPlans } from './api.js';
import { setCommunityId, setProfile, sqftMonth, setSqftMonth } from './state.js';
import { bindAutosaveOnce } from './autosave.js';
import { applyAmenityChips } from './amenities.js';
import { formatPhoneDisplay } from '../shared/phone.js';

const normalizeText = (value) => {
  if (value == null) return '';
  return String(value).trim();
};

const planAliases = (plan) => {
  if (!plan || typeof plan !== 'object') return [];
  return [
    normalizeText(plan.planNumber),
    normalizeText(plan.name),
    normalizeText(plan.title),
    normalizeText(plan.code)
  ].filter(Boolean);
};

const buildPlanLabel = (plan) => {
  const number = normalizeText(plan?.planNumber);
  const name = normalizeText(plan?.name);
  const title = normalizeText(plan?.title);
  const code = normalizeText(plan?.code);

  const parts = [];
  if (number) parts.push(number);
  if (name && name !== number) parts.push(name);
  if (!parts.length && title) parts.push(title);
  if (!parts.length && code) parts.push(code);

  return parts.join(' - ') || 'Unnamed plan';
};

let planLoadSeq = 0;

const createPlanPlaceholder = () => {
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = '-- Select a floor plan --';
  return opt;
};

const ensureCustomPlanOption = (value) => {
  const trimmed = normalizeText(value);
  if (!trimmed) return;
  if (Array.from(modelPlan.options).some((opt) => opt.value === trimmed)) return;
  const opt = document.createElement('option');
  opt.value = trimmed;
  opt.textContent = trimmed;
  opt.selected = true;
  opt.dataset.custom = 'true';
  modelPlan.appendChild(opt);
};

const syncFeeGroups = () => {
  if (mudFeeGroup) {
    mudFeeGroup.style.display = feeMud?.checked ? '' : 'none';
  }
  if (pidFeeGroup) {
    const showPid = !!feePid?.checked;
    pidFeeGroup.style.display = showPid ? '' : 'none';
    if (!showPid && pidFeeFrequency) pidFeeFrequency.value = '';
  }
};

let feeToggleListenersBound = false;
const ensureFeeToggleListeners = () => {
  if (feeToggleListenersBound) return;
  const handleToggle = () => {
    if (!feePid?.checked && pidFeeFrequency) pidFeeFrequency.value = '';
    syncFeeGroups();
  };
  if (feeMud) {
    feeMud.addEventListener('change', () => {
      if (feeMud.checked && feeNone) feeNone.checked = false;
      handleToggle();
    });
  }
  if (feePid) {
    feePid.addEventListener('change', () => {
      if (feePid.checked && feeNone) feeNone.checked = false;
      handleToggle();
    });
  }
  if (feeNone) {
    feeNone.addEventListener('change', () => {
      if (feeNone.checked) {
        if (feeMud) feeMud.checked = false;
        if (feePid) feePid.checked = false;
      }
      handleToggle();
    });
  }
  feeToggleListenersBound = true;
};

async function hydrateModelPlans(communityId, selectedRaw) {
  planLoadSeq += 1;
  const token = planLoadSeq;
  const selected = normalizeText(selectedRaw);
  const selectedLower = selected.toLowerCase();

  modelPlan.innerHTML = '';
  modelPlan.appendChild(createPlanPlaceholder());

  if (!communityId) {
    if (selected) ensureCustomPlanOption(selected);
    return;
  }

  try {
    const plans = await fetchCommunityFloorPlans(communityId);
    if (token !== planLoadSeq) return;

    const list = Array.isArray(plans) ? plans : [];
    let matched = false;
    const seen = new Set();

    for (const plan of list) {
      if (!plan) continue;
      const key = normalizeText(plan._id) || normalizeText(plan.planNumber) || normalizeText(plan.name);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      const aliases = planAliases(plan).map((alias) => alias.toLowerCase());
      const hasMatch = selected && aliases.includes(selectedLower);
      const optionValue = hasMatch ? selected : (normalizeText(plan.planNumber) || normalizeText(plan.name) || key);
      if (!optionValue) continue;

      const opt = document.createElement('option');
      opt.value = optionValue;
      opt.textContent = buildPlanLabel(plan);
      if (plan._id) opt.dataset.planId = key;
      if (plan.planNumber) opt.dataset.planNumber = normalizeText(plan.planNumber);
      if (plan.name) opt.dataset.planName = normalizeText(plan.name);

      if (hasMatch) {
        opt.selected = true;
        matched = true;
      }

      modelPlan.appendChild(opt);
    }

    if (selected) {
      if (!matched) ensureCustomPlanOption(selected);
    } else {
      modelPlan.value = '';
    }
  } catch (err) {
    console.error('Failed to load floor plans', err);
    if (selected) ensureCustomPlanOption(selected);
  }
}

ensureFeeToggleListeners();
syncFeeGroups();

export function wireCommunitySelect() {
  selectEl.addEventListener('change', async () => {
    const id = selectEl.value;
  if (!id || id === 'undefined') {          // guard
      await hydrateModelPlans(null, null);
      enableUI(false);
      setCommunityId(null);
      if (feeMud) feeMud.checked = false;
      if (feePid) feePid.checked = false;
      if (feeNone) feeNone.checked = false;
      if (pidFeeFrequency) pidFeeFrequency.value = '';
      syncFeeGroups();
      applyAmenityChips([]);
      if (openAmenitiesBtn) openAmenitiesBtn.disabled = true;
      return;
    }
    await onSelectCommunity(id);
  });
}

export async function initialLoad() {
  await hydrateModelPlans(null, null);
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
    setSqftMonth('');

    const { community, profile } = await fetchCommunityProfile(id);
    setProfile(profile);
    hydrateModelPlans(id, profile?.modelPlan || '');

    // Title
    const companyDisplay = community?.companyName || community?.builderName || 'Your Company';
    const communityDisplay = community?.name || community?.communityName || 'Your Community';
    builderTitle.textContent = `${companyDisplay} – ${communityDisplay}`;

    const amenities = Array.isArray(profile?.communityAmenities) && profile.communityAmenities.length
      ? profile.communityAmenities
      : (community?.communityAmenities || []);
    applyAmenityChips(amenities);
    if (openAmenitiesBtn) openAmenitiesBtn.disabled = false;

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
    salesPersonPhone.value   = formatPhoneDisplay(profile?.salesPersonPhone || '');
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
    if (pidFeeFrequency) {
      pidFeeFrequency.value = fees.includes('PID') ? (profile?.pidFeeFrequency || '') : '';
    }
    syncFeeGroups();

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
    } else if (tab === 'sqft') {
      const result = await drawSqftComparisonGraph(id, { month: sqftMonth || undefined });
      setSqftMonth(result?.selectedMonth ?? sqftMonth ?? '');
    }
  } catch (e) {
    console.error('Failed to load profile', e);
    enableUI(false);
  }
}
