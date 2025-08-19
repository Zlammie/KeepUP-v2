// client/assets/js/my-community-competition/index.js
const selectEl = document.getElementById('communitySelect');

const leftSidebar = document.getElementById('leftSidebar');
const rightTop = document.getElementById('rightTop');

const builderTitle = document.getElementById('builderTitle');
const amenityList = document.getElementById('amenityList');
const statTotalLots = document.getElementById('statTotalLots');
const statLotsSold = document.getElementById('statLotsSold');
const statLotsRemaining = document.getElementById('statLotsRemaining');
const statQmiAvailable = document.getElementById('statQmiAvailable');

const promoText = document.getElementById('promoText');
const hoaDisplay = document.getElementById('hoaDisplay');
const taxDisplay = document.getElementById('taxDisplay');

const salesPerson = document.getElementById('salesPerson');
const salesPersonPhone = document.getElementById('salesPersonPhone');
const salesPersonEmail = document.getElementById('salesPersonEmail');

const address = document.getElementById('address');
const city = document.getElementById('city');
const zip = document.getElementById('zip');
const modelPlan = document.getElementById('modelPlan');
const lotSize = document.getElementById('lotSize');
const totalLots = document.getElementById('totalLots');
const garageTypeFront = document.querySelector('input[name="garageType"][value="Front"]');
const garageTypeRear  = document.querySelector('input[name="garageType"][value="Rear"]');

const schoolISD = document.getElementById('schoolISD');
const elementarySchool = document.getElementById('elementarySchool');
const middleSchool = document.getElementById('middleSchool');
const highSchool = document.getElementById('highSchool');

const hoaFee = document.getElementById('hoaFee');
const hoaFrequency = document.getElementById('hoaFrequency');
const tax = document.getElementById('tax');
const feeMud = document.getElementById('feeMud');
const feePid = document.getElementById('feePid');
const feeNone = document.getElementById('feeNone');
const mudFeeGroup = document.getElementById('mudFeeGroup');
const pidFeeGroup = document.getElementById('pidFeeGroup');
const mudFee = document.getElementById('mudFee');
const pidFee = document.getElementById('pidFee');
const earnestAmount = document.getElementById('earnestAmount');
const realtorCommission = document.getElementById('realtorCommission');

const prosUl = document.getElementById('prosUl');
const consUl = document.getElementById('consUl');

const compSearch = document.getElementById('competitionSearch');
const compResults = document.getElementById('competitionResults');
const linkedContainer = document.getElementById('linkedCompetitors');

const graphMount = document.getElementById('graphMount');

let currentCommunityId = null;
let profileCache = null;
let linked = [];
let saveTimer;

function enableUI(enabled) {
  const method = enabled ? 'remove' : 'add';
  leftSidebar?.classList[method]('opacity-50');
  rightTop?.classList[method]('opacity-50');
  leftSidebar?.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  rightTop?.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- Load communities into dropdown
(async function loadCommunities() {
  try {
    const list = await fetch('/api/communities/select-options').then(r => r.json());
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name || c._id;
      selectEl.appendChild(opt);
    });
    // Optional deep-link: ?communityId=
    const params = new URLSearchParams(window.location.search);
    const preId = params.get('communityId');
    if (preId && list.find(x => x._id === preId)) {
      selectEl.value = preId;
      await onSelectCommunity(preId);
    } else {
      enableUI(false);
    }
  } catch (e) {
    console.error('Failed to load communities', e);
  }
})();

selectEl.addEventListener('change', async () => {
  const id = selectEl.value;
  if (!id) {
    enableUI(false);
    currentCommunityId = null;
    return;
  }
  await onSelectCommunity(id);
});

async function onSelectCommunity(id) {
  currentCommunityId = id;
  try {
    const { community, profile } = await fetch(`/api/my-community-competition/${id}`).then(r => r.json());
    profileCache = profile;

    // Title
    builderTitle.textContent = `${community?.builderName || 'Your Builder'} – ${community?.name || community?.communityName || 'Your Community'}`;

    // Amenities chips (if you have them in your Community)
    amenityList.innerHTML = '';
    (community?.communityAmenities || []).forEach(group => {
      (group.items || []).forEach(item => {
        const li = document.createElement('li');
        li.className = 'chip';
        li.textContent = item;
        amenityList.appendChild(li);
      });
    });

    // Stats (left as — when unknown)
    statTotalLots.textContent = profile?.lotCounts?.total ?? '—';
    statLotsSold.textContent = profile?.lotCounts?.sold ?? '—';
    statLotsRemaining.textContent = profile?.lotCounts?.remaining ?? '—';
    statQmiAvailable.textContent = profile?.lotCounts?.quickMoveInLots ?? '—';

    // Promotion & HOA display
    promoText.textContent = (profile?.promotion && profile.promotion.trim()) ? profile.promotion : 'No promotion recorded.';
    hoaDisplay.textContent = (profile?.lotCounts?.quickMoveInLots != null || community?.hoaFee)
      ? (community?.hoaFee && profile?.hoaFrequency ? `$${community.hoaFee} / ${profile.hoaFrequency}` : (community?.hoaFee ? `$${community.hoaFee}` : 'Not specified'))
      : 'Not specified';
    taxDisplay.textContent = community?.tax ? `${community.tax}%` : (profile?.tax ? `${profile.tax}%` : 'Not specified');

    // Fill left sidebar inputs from community (prefill) + profile (editable)
    salesPerson.value = profile?.salesPerson || '';
    salesPersonPhone.value = profile?.salesPersonPhone || '';
    salesPersonEmail.value = profile?.salesPersonEmail || '';

    address.value = community?.address || '';
    city.value = community?.city || '';
    zip.value = community?.zip || '';

    lotSize.value = profile?.lotSize || '';
    totalLots.value = profile?.lotCounts?.total ?? '';
      totalLots.setAttribute('readonly', 'readonly');

    (profile?.garageType === 'Front') ? (garageTypeFront.checked = true) :
    (profile?.garageType === 'Rear')  ? (garageTypeRear.checked  = true) : null;

    schoolISD.value = community?.schoolISD || '';
    elementarySchool.value = community?.elementarySchool || '';
    middleSchool.value = community?.middleSchool || '';
    highSchool.value = community?.highSchool || '';

    hoaFee.value = community?.hoaFee ?? '';
    hoaFrequency.value = profile?.hoaFrequency || '';
    tax.value = community?.tax ?? profile?.tax ?? '';

    const fees = profile?.feeTypes || [];
    feeMud.checked  = fees.includes('MUD');
    feePid.checked  = fees.includes('PID');
    feeNone.checked = fees.includes('None');
    mudFee.value = profile?.mudFee ?? '';
    pidFee.value = profile?.pidFee ?? '';
    mudFeeGroup.style.display = feeMud.checked ? '' : 'none';
    pidFeeGroup.style.display = feePid.checked ? '' : 'none';

    earnestAmount.value = profile?.earnestAmount ?? '';
    realtorCommission.value = profile?.realtorCommission ?? '';

    // Pros & Cons
    prosUl.innerHTML = '';
    (profile?.prosCons?.pros || []).forEach(p => {
      const li = document.createElement('li'); li.textContent = p; prosUl.appendChild(li);
    });
    consUl.innerHTML = '';
    (profile?.prosCons?.cons || []).forEach(c => {
      const li = document.createElement('li'); li.textContent = c; consUl.appendChild(li);
    });

    // Linked comps
    linked = (profile?.linkedCompetitions || []).map(c => ({ _id: c._id, name: c.name, builder: c.builder, market: c.market }));
    renderLinked();

    enableUI(true);
    bindAutosaveOnce();
  } catch (e) {
    console.error('Failed to load profile', e);
    enableUI(false);
  }
}

function bindAutosaveOnce() {
  if (bindAutosaveOnce._bound) return;
  bindAutosaveOnce._bound = true;
  const inputs = [
    salesPerson, salesPersonPhone, salesPersonEmail,
    address, city, zip, modelPlan, lotSize, totalLots,
    schoolISD, elementarySchool, middleSchool, highSchool,
    hoaFee, hoaFrequency, tax, mudFee, pidFee, earnestAmount, realtorCommission
  ];
  inputs.forEach(el => el && el.addEventListener('input', autosave));
  [feeMud, feePid, feeNone, garageTypeFront, garageTypeRear].forEach(el => el && el.addEventListener('change', autosave));
}

async function autosave() {
  if (!currentCommunityId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const feeTypes = [
      feeMud.checked ? 'MUD' : null,
      feePid.checked ? 'PID' : null,
      feeNone.checked ? 'None' : null
    ].filter(Boolean);

    const garageType = garageTypeFront.checked ? 'Front' : (garageTypeRear.checked ? 'Rear' : null);

    const payload = {
      salesPerson: salesPerson.value,
      salesPersonPhone: salesPersonPhone.value,
      salesPersonEmail: salesPersonEmail.value,
      address: address.value,
      city: city.value,
      zip: zip.value,
      modelPlan: modelPlan.value || null,
      lotSize: lotSize.value || null,
      garageType,
      schoolISD: schoolISD.value,
      elementarySchool: elementarySchool.value,
      middleSchool: middleSchool.value,
      highSchool: highSchool.value,
      hoaFee: numOrNull(hoaFee.value),
      hoaFrequency: hoaFrequency.value || null,
      tax: numOrNull(tax.value),
      feeTypes,
      mudFee: feeMud.checked ? numOrNull(mudFee.value) : null,
      pidFee: feePid.checked ? numOrNull(pidFee.value) : null,
      earnestAmount: numOrNull(earnestAmount.value),
      realtorCommission: numOrNull(realtorCommission.value)
    };

    await fetch(`/api/my-community-competition/${currentCommunityId}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
  }, 350);
}

// Linked competitors
function renderLinked() {
  linkedContainer.innerHTML = '';
  linked.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `<div><div><strong>${c.name}</strong></div><small>${c.builder || ''} ${c.market ? '— '+c.market : ''}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Remove';
    btn.onclick = async () => {
      linked = linked.filter(x => x._id !== c._id);
      await saveLinked();
      renderLinked();
    };
    item.appendChild(btn);
    linkedContainer.appendChild(item);
  });
}

async function saveLinked() {
  if (!currentCommunityId) return;
  await fetch(`/api/my-community-competition/${currentCommunityId}/linked-competitions`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ competitionIds: linked.map(x => x._id) })
  });
}

compSearch?.addEventListener('input', async () => {
  const q = compSearch.value.trim();
  compResults.innerHTML = '';
  if (!q) return;
  const results = await fetch(`/api/competitions/search?q=${encodeURIComponent(q)}`).then(r=>r.json());
  results.forEach(r => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action';
    btn.textContent = `${r.name} — ${r.builder || ''} ${r.market ? '('+r.market+')' : ''}`;
    btn.onclick = async () => {
      if (!linked.find(x => x._id === r._id)) {
        linked.push(r);
        await saveLinked();
        renderLinked();
      }
    };
    compResults.appendChild(btn);
  });
});
