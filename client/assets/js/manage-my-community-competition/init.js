// client/assets/js/manage-my-community-competition/init.js

// ------- resolve communityId once (works with body attr or JSON bootstrap) -------
const dataEl = document.getElementById('community-data');
const initialBootstrap = dataEl ? JSON.parse(dataEl.textContent) : {};
const communityId =
  (document.body.getAttribute('data-community-id') || '').trim() ||
  initialBootstrap.communityId ||
  '';

if (!communityId) {
  console.error('[manage-my-community-competition] Missing communityId');
}

// Base API endpoints used across sections
const COMMUNITY_API = `/api/communities/${communityId}`;
const PROFILE_API   = `/api/community-competition-profiles/${communityId}`;
const PLANS_API     = `/api/communities/${communityId}/floorplans`;
const LOT_STATS_API = `/api/communities/${communityId}/lot-stats`;

// ---------------- Tab nav (mirror update-competition behavior) ----------------

// ===== Month tabs (previous month on the RIGHT, older months to the left) =====
const monthTabs = (() => {
  const nav = document.getElementById('monthNav');
  if (!nav) return { init: () => {}, getSelectedMonth: () => null, subscribe: () => {} };

  const NUM_MONTHS = 6; // adjust as needed
  const subs = [];

  const keyOf   = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  const labelOf = (d) => d.toLocaleString(undefined, { month: 'short', year: 'numeric' });  // "Jul 2025"

  function setActive(a) {
    nav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    a.classList.add('active');
  }
  function getSelectedMonth() {
    const a = nav.querySelector('.nav-link.active');
    return a ? a.dataset.month : null;
  }
  function notify() {
    const m = getSelectedMonth();
    subs.forEach(fn => { try { fn(m); } catch (e) { console.error(e); } });
  }

  function build() {
    nav.innerHTML = '';

    // base = previous month
    const today = new Date();
    const base  = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // build from OLDEST → NEWEST so the newest (prev month) ends up on the RIGHT
    for (let i = NUM_MONTHS - 1; i >= 0; i--) {
      const d  = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const li = document.createElement('li');
      li.className = 'nav-item';

      const a = document.createElement('a');
      a.href = '#';
      a.className = `nav-link${i === 0 ? ' active' : ''}`; // last one (prev month) active
      a.dataset.month = keyOf(d);
      a.textContent   = labelOf(d);
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        setActive(a);
        notify();
      });

      li.appendChild(a);
      nav.appendChild(li);
    }

    // auto-scroll the overflow container to the right so the active pill is visible
    const scroller = nav.parentElement; // the <div class="d-flex overflow-auto">
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;

    notify(); // fire once with the active month
  }

  function subscribe(fn) { subs.push(fn); }
  function init() { build(); }

  return { init, getSelectedMonth, subscribe };
})();


function wireTabs() {
  const links = document.querySelectorAll('#sectionNav .nav-link');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const target = link.getAttribute('data-section');
      document.querySelectorAll('.section').forEach(sec => {
        const isTarget = sec.getAttribute('data-section-content') === target;
        sec.classList.toggle('d-none', !isTarget);
      });
    });
  });
}

// ---------------- helpers ----------------
const toFormData = (form) => Object.fromEntries(new FormData(form).entries());
const numOrNull  = (v) => (v === '' || v == null ? null : Number(v));

// ---------------- show/hide MUD/PID groups ----------------
function updateFeeGroups() {
  const feeNoneEl = document.getElementById('feeNone');
  const feeMudEl  = document.getElementById('feeMud');
  const feePidEl  = document.getElementById('feePid');

  if (!feeNoneEl && !feeMudEl && !feePidEl) return;

  const none = !!feeNoneEl?.checked;
  const mud  = !!feeMudEl?.checked && !none;
  const pid  = !!feePidEl?.checked && !none;

  const mudGroup = document.getElementById('mudFeeGroup');
  const pidGroup = document.getElementById('pidFeeGroup');
  if (mudGroup) mudGroup.style.display = mud ? '' : 'none';
  if (pidGroup) pidGroup.style.display = pid ? '' : 'none';
}

function wireFeeToggles() {
  ['feeNone', 'feeMud', 'feePid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateFeeGroups);
  });
}

// ---------------- save handlers to /api/communities/:id ----------------
async function saveProfile() {
  const form = document.getElementById('profileForm');
  if (!form) return;
  const payload = toFormData(form);
  await fetch(COMMUNITY_API, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
}

async function saveFees() {
  const form = document.getElementById('feesForm');
  if (!form) return;
  const fd = new FormData(form);
  const feeTypes = fd.getAll('feeTypes');
  const payload = {
    HOA: numOrNull(fd.get('HOA')),
    tax: numOrNull(fd.get('tax')),
    realtorCommission: numOrNull(fd.get('realtorCommission')),
    feeTypes: feeTypes.length ? feeTypes : ['None'],
    mudFee: numOrNull(fd.get('mudFee')),
    pidFee: numOrNull(fd.get('pidFee')),
    earnestAmount: numOrNull(fd.get('earnestAmount'))
  };
  if (payload.feeTypes.includes('None')) {
    payload.feeTypes = ['None'];
    payload.mudFee = null;
    payload.pidFee = null;
  }
  await fetch(COMMUNITY_API, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
}

async function saveSchool() {
  const form = document.getElementById('schoolForm');
  if (!form) return;
  const payload = toFormData(form);
  await fetch(COMMUNITY_API, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
}

async function saveNotes() {
  const notesEl = document.getElementById('notes');
  if (!notesEl) return;
  await fetch(COMMUNITY_API, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ notes: notesEl.value })
  });
}

// autosave forms on change/blur
function wireFormAutosaves() {
  const pairs = [
    ['profileForm', saveProfile],
    ['feesForm', saveFees],
    ['schoolForm', saveSchool]
  ];
  pairs.forEach(([id, handler]) => {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input, select, textarea')) {
        handler().catch(console.error);
      }
    });
  });

  const notesEl = document.getElementById('notes');
  if (notesEl) {
    notesEl.addEventListener('blur', () => saveNotes().catch(console.error));
  }
}

// ---------------- Metrics (promotion + pros/cons) ----------------
const metrics = (() => {
  if (!communityId) return { load: ()=>{}, wire: ()=>{} };

  let currentProfile = null;

  const els = {
    promotion: document.getElementById('mPromotion'),
    prosList:  document.getElementById('prosList'),
    consList:  document.getElementById('consList'),
    newPro:    document.getElementById('newPro'),
    newCon:    document.getElementById('newCon'),
    addProBtn: document.getElementById('addProBtn'),
    addConBtn: document.getElementById('addConBtn'),
    saveBtn:   document.getElementById('saveMetricsBtn'),
  };

  function makeItem(text) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.appendChild(document.createTextNode(text));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => { li.remove(); save().catch(console.error); });
    li.appendChild(btn);
    return li;
  }

  function readList(ul) {
    if (!ul) return [];
    return Array.from(ul.querySelectorAll('.list-group-item'))
      .map(n => (n.firstChild ? n.firstChild.nodeValue.trim() : ''))
      .filter(Boolean);
  }

  async function load() {
    const res = await fetch(PROFILE_API);
    if (!res.ok) throw new Error(await res.text());
    const profile = await res.json();
    currentProfile = profile || {};

    const pc = currentProfile.prosCons || { pros: [], cons: [] };

    if (els.promotion) els.promotion.value = currentProfile.promotion || '';

    if (els.prosList) {
      els.prosList.innerHTML = '';
      (pc.pros || []).forEach(p => els.prosList.appendChild(makeItem(p)));
    }
    if (els.consList) {
      els.consList.innerHTML = '';
      (pc.cons || []).forEach(c => els.consList.appendChild(makeItem(c)));
    }
  }

  async function save() {
    const payload = {
      promotion: els.promotion ? els.promotion.value : '',
      prosCons: {
        pros: readList(els.prosList),
        cons: readList(els.consList),
      },
    };
    const res = await fetch(PROFILE_API, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    currentProfile = await res.json();
  }

  function wire() {
    if (els.addProBtn && els.newPro && els.prosList) {
      els.addProBtn.addEventListener('click', () => {
        const v = els.newPro.value.trim();
        if (!v) return;
        els.prosList.appendChild(makeItem(v));
        els.newPro.value = '';
        save().catch(console.error);
      });
    }
    if (els.addConBtn && els.newCon && els.consList) {
      els.addConBtn.addEventListener('click', () => {
        const v = els.newCon.value.trim();
        if (!v) return;
        els.consList.appendChild(makeItem(v));
        els.newCon.value = '';
        save().catch(console.error);
      });
    }
    if (els.saveBtn) {
      els.saveBtn.addEventListener('click', () => save().catch(console.error));
    }
    if (els.promotion) {
      let t;
      els.promotion.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => save().catch(console.error), 600);
      });
      els.promotion.addEventListener('blur', () => save().catch(console.error));
    }
  }

  return { load, wire };
})();

// ---------------- Top 3 Plans ----------------
const topPlans = (() => {
  if (!communityId) return { load: ()=>{}, wire: ()=>{} };

  const s1 = document.getElementById('topPlan1');
  const s2 = document.getElementById('topPlan2');
  const s3 = document.getElementById('topPlan3');
  if (!s1 || !s2 || !s3) return { load: ()=>{}, wire: ()=>{} };

  function optionFor(p) {
    const o = document.createElement('option');
    o.value = p._id;
    const sqft = p.specs?.squareFeet ? ` – ${p.specs.squareFeet} sqft` : '';
    o.textContent = `${p.name || '(unnamed)'}${sqft}`;
    return o;
  }

  function setSelected(selectEl, id) {
    if (!id) { selectEl.value = ''; return; }
    const has = Array.from(selectEl.options).some(opt => opt.value === id);
    selectEl.value = has ? id : '';
  }

  function enforceUnique() {
    const chosen = [s1.value, s2.value, s3.value].filter(Boolean);
    [s1, s2, s3].forEach(sel => {
      Array.from(sel.options).forEach(opt => {
        if (!opt.value) return;
        opt.disabled = chosen.includes(opt.value) && sel.value !== opt.value;
      });
    });
  }

  async function load() {
    // 1) load plans
    const plansRes = await fetch(PLANS_API);
    if (!plansRes.ok) throw new Error(await plansRes.text());
    const plans = await plansRes.json();

    // Build options for all three selects (keep the first placeholder option)
    [s1, s2, s3].forEach(sel => {
      const placeholder = sel.querySelector('option[value=""]') || sel.firstElementChild;
      sel.innerHTML = '';
      if (placeholder) sel.appendChild(placeholder);
      plans.forEach(p => sel.appendChild(optionFor(p)));
    });

    // 2) load profile to get saved picks
    const profRes = await fetch(PROFILE_API);
    if (!profRes.ok) throw new Error(await profRes.text());
    const profile = await profRes.json();

    const tp = profile?.topPlans || {};
    setSelected(s1, tp.plan1?._id || tp.plan1 || null);
    setSelected(s2, tp.plan2?._id || tp.plan2 || null);
    setSelected(s3, tp.plan3?._id || tp.plan3 || null);

    enforceUnique();
  }

  async function save() {
    const payload = {
      topPlans: {
        plan1: s1.value || null,
        plan2: s2.value || null,
        plan3: s3.value || null,
      }
    };
    const res = await fetch(PROFILE_API, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    await res.json(); // not strictly needed, but keeps the contract
  }

  function wire() {
    [s1, s2, s3].forEach(sel => {
      sel.addEventListener('change', () => {
        enforceUnique();
        save().catch(console.error);
      });
    });
  }

  return { load, wire };
})();

// ---------------- Lot stats (total, sold via linked contact, remaining) ----------------
const lotStats = (() => {
  if (!communityId) return { load: ()=>{} };

  const lotCountInput  = document.getElementById('lotCount');
  const soldLotsInput  = document.getElementById('soldLots');
  const remainingInput = document.getElementById('remainingLots');
  if (!lotCountInput || !soldLotsInput || !remainingInput) {
    return { load: ()=>{} };
  }

  soldLotsInput.readOnly = true; // derived from linked contacts

  async function load() {
    try {
      const res = await fetch(LOT_STATS_API);
      if (!res.ok) throw new Error(await res.text());
      const { total, sold } = await res.json();
      const t = Number.isFinite(total) ? total : 0;
      const s = Number.isFinite(sold)  ? sold  : 0;
      lotCountInput.value  = t;
      soldLotsInput.value  = s;
      remainingInput.value = Math.max(0, t - s);
    } catch (e) {
      console.error('Failed to load lot stats:', e);
      const t = Number(lotCountInput.value || 0);
      const s = Number(soldLotsInput.value || 0);
      remainingInput.value = Math.max(0, t - s);
    }
  }

  return { load };
})();

// ===== Lot Stats (total, sold via linked contact, remaining) =====
(function () {
  const dataEl = document.getElementById('community-data');
  const initial = dataEl ? JSON.parse(dataEl.textContent) : {};
  const communityId =
    (document.body.getAttribute('data-community-id') || '').trim() ||
    initial.communityId || '';
  if (!communityId) return;

  const STATS_API = `/api/communities/${communityId}/lot-stats`;

  const lotCountInput  = document.getElementById('lotCount');       // readonly
  const soldLotsInput  = document.getElementById('soldLots');       // readonly
  const remainingInput = document.getElementById('remainingLots');  // readonly
  if (!lotCountInput || !soldLotsInput || !remainingInput) return;

  soldLotsInput.readOnly = true; // computed from linked contact

  async function loadLotStats() {
    try {
      const res = await fetch(STATS_API);
      if (!res.ok) throw new Error(await res.text());
      const { total, sold } = await res.json();

      const t = Number.isFinite(total) ? total : 0;
      const s = Number.isFinite(sold)  ? sold  : 0;

      lotCountInput.value  = t;
      soldLotsInput.value  = s;
      remainingInput.value = Math.max(0, t - s);
    } catch (e) {
      console.error('Failed to load lot stats:', e);
      const t = Number(lotCountInput.value || 0);
      const s = Number(soldLotsInput.value || 0);
      remainingInput.value = Math.max(0, t - s);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadLotStats().catch(console.error);
  });
})();

// ===== Price tab: Floor Plans table (month-aware, editable) =====
const priceTable = (() => {
  const table = document.getElementById('monthTable');
  if (!table) return { load: async () => {} };

  const tbody = table.querySelector('tbody');

  // Reuse constants you already define at the top of init.js:
  // const communityId = ...; const PLANS_API = `/api/communities/${communityId}/floorplans`;
  // const PROFILE_API = `/api/community-competition-profiles/${communityId}`;
  const PRICES_API = `${PROFILE_API}/prices`; // -> /api/community-competition-profiles/:id/prices

  let currentMonth = null; // "YYYY-MM"
  let priceMap = {};       // { planId: number }
  let debounceTimer = null;

  const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString() : (n ?? '—'));
  const safe   = (s) => (s == null || s === '' ? '—' : s);

  function debounce(fn, delay = 400) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, delay);
  }

  async function fetchPlans() {
    const res = await fetch(PLANS_API);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function fetchPrices(month) {
    const res = await fetch(`${PRICES_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.prices || {};
  }

  async function putPrice(month, planId, price) {
    const res = await fetch(PRICES_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, plan: planId, price })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.prices || {};
  }

  function buildRow(plan) {
    const sq     = plan?.specs?.squareFeet;
    const beds   = plan?.specs?.beds;
    const baths  = plan?.specs?.baths;
    const garage = plan?.specs?.garage;
    const price  = priceMap[plan._id] ?? '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${safe(plan?.name)}${plan?.planNumber ? ` (${plan.planNumber})` : ''}</td>
      <td>${fmtNum(sq)}</td>
      <td>${fmtNum(beds)}</td>
      <td>${fmtNum(baths)}</td>
      <td>${fmtNum(garage)}</td>
      <td>—</td>  <!-- Story (add if/when available) -->
      <td>
        <input type="number" min="0" step="1000"
               class="form-control form-control-sm plan-price-input"
               data-plan="${plan._id}" value="${price}">
      </td>
    `;
    return tr;
  }

  function wirePriceInputs() {
    tbody.querySelectorAll('input.plan-price-input').forEach(input => {
      input.addEventListener('input', () => {
        const planId = input.dataset.plan;
        const valNum = input.value === '' ? '' : Number(input.value);
        // Optimistic local state
        priceMap[planId] = (input.value === '' ? undefined : (Number.isFinite(valNum) ? valNum : 0));

        debounce(async () => {
          try {
            const newPrices = await putPrice(currentMonth, planId, input.value === '' ? null : valNum);
            priceMap = newPrices; // sync to server’s truth
          } catch (e) {
            console.error('Failed to save price', e);
          }
        });
      });

      input.addEventListener('blur', () => {
        // Flush immediately on blur
        clearTimeout(debounceTimer);
        const planId = input.dataset.plan;
        const valNum = input.value === '' ? null : Number(input.value);
        putPrice(currentMonth, planId, valNum)
          .then(newPrices => { priceMap = newPrices; })
          .catch(err => console.error('Failed to save price', err));
      });
    });
  }

  async function load(month /* "YYYY-MM" from month pills */) {
    if (!month) return;
    currentMonth = month;

    const [plans, prices] = await Promise.all([ fetchPlans(), fetchPrices(month) ]);
    priceMap = prices || {};

    tbody.innerHTML = '';
    plans.forEach(p => tbody.appendChild(buildRow(p)));
    wirePriceInputs();
  }

  return { load };
})();

// ===== Inventory tab: Quick Move-In Homes (month-aware) =====
const qmiTable = (() => {
  const table = document.getElementById('quickHomesTable');
  if (!table) return { load: async () => {} };

  const tbody = table.querySelector('tbody');
  const QMI_GET_API = `${PROFILE_API}/qmi`; // GET ?month=YYYY-MM
  const QMI_PUT_API = `${PROFILE_API}/qmi`; // PUT { month, excludeLotId | includeLotId }

  let currentMonth = null;

  const fmtMoney = (n) =>
    (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = (d instanceof Date) ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? '—'
      : dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const safe = (s) => (s == null || s === '' ? '—' : s);

  async function exclude(lotId) {
    if (!currentMonth) return;
    const res = await fetch(QMI_PUT_API, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ month: currentMonth, excludeLotId: lotId }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  function buildRow(h) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width:42px">
        <button type="button" class="btn btn-sm btn-outline-danger qmi-del" data-id="${h.lotId}">✕</button>
      </td>
      <td>${safe(h.address)}</td>
      <td>${fmtDate(h.listDate)}</td>
      <td>${h.floorPlan ? `${safe(h.floorPlan.name)}${h.floorPlan.planNumber ? ` (${h.floorPlan.planNumber})` : ''}` : '—'}</td>
      <td>${fmtMoney(h.listPrice)}</td>
      <td>${h.sqft ? h.sqft.toLocaleString() : '—'}</td>
      <td>${safe(h.status)}</td>
    `;
    return tr;
  }

  async function load(month /* "YYYY-MM" */) {
    if (!month) return;
    currentMonth = month;
    const res = await fetch(`${QMI_GET_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) {
      console.error('Failed to load QMI:', await res.text());
      return;
    }
    const data = await res.json();
    const homes = data.homes || [];

    tbody.innerHTML = '';
    homes.forEach(h => tbody.appendChild(buildRow(h)));

    // wire delete buttons
    tbody.querySelectorAll('.qmi-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lotId = btn.getAttribute('data-id');
        try {
          await exclude(lotId);
          // remove row locally
          const tr = btn.closest('tr');
          if (tr) tr.remove();
        } catch (e) {
          console.error('Exclude failed', e);
          alert('Failed to remove from this month.');
        }
      });
    });
  }

  return { load };
})();

// ===== Inventory tab: Sold Homes (month-scoped) =====
const soldTable = (() => {
  const table = document.getElementById('soldHomesTable');
  if (!table) return { load: async () => {} };

  const tbody = table.querySelector('tbody');
  const SOLD_GET_API = `${PROFILE_API}/sales`; // GET ?month=YYYY-MM

  let currentMonth = null;

  const fmtDate = (d) => {
    if (!d) return '—';
    // If it's "YYYY-MM", print as that; if it's a full date, format prettily.
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(d)) return d;
    const dt = new Date(d);
    return Number.isNaN(dt.getTime())
      ? String(d)
      : dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
  };
  const safe = (s) => (s == null || s === '' ? '—' : s);

  function buildRow(h) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width:42px"></td>  <!-- no per-month delete for sales (can add later) -->
      <td>${safe(h.address)}</td>
      <td>${fmtDate(h.listDate)}</td>
      <td>${h.floorPlan ? `${safe(h.floorPlan.name)}${h.floorPlan.planNumber ? ` (${h.floorPlan.planNumber})` : ''}` : '—'}</td>
      <td>${safe(h.listPrice)}</td>
      <td>${h.sqft ? Number(h.sqft).toLocaleString() : '—'}</td>
      <td>${safe(h.status)}</td>
      <td>${fmtDate(h.soldDate)}</td>
      <td>${h.soldPrice == null || h.soldPrice === '' ? '—' : String(h.soldPrice)}</td>
    `;
    return tr;
  }

  async function load(month /* "YYYY-MM" */) {
    if (!month) return;
    currentMonth = month;

    const res = await fetch(`${SOLD_GET_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) {
      console.error('Failed to load sold homes:', await res.text());
      return;
    }
    const data = await res.json();
    const sales = data.sales || [];

    tbody.innerHTML = '';
    sales.forEach(h => tbody.appendChild(buildRow(h)));
  }

  return { load };
})();

// ===== Sales Summary (month-aware, editable) =====
const salesSummary = (() => {
  const table = document.getElementById('salesTable');
  if (!table) return { load: async () => {} };

  const tbody = table.querySelector('tbody');
  const SALES_API = `${PROFILE_API}/sales-summary`; // GET/PUT

  let currentMonth = null;
  let debounceTimer = null;

  const ymLabel = (ym) => {
    if (!ym || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return '—';
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' }); // "Jul 2025"
  };
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  function buildRow(state) {
    const net = Math.max(0, num(state.sales) - num(state.cancels));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ymLabel(currentMonth)}</td>
      <td><input type="number" min="0" step="1" id="salesCount" class="form-control form-control-sm" value="${state.sales ?? 0}"></td>
      <td><input type="number" min="0" step="1" id="salesCancels" class="form-control form-control-sm" value="${state.cancels ?? 0}"></td>
      <td><input type="number" min="0" step="1" id="salesNet" class="form-control form-control-sm" value="${net}" readonly></td>
      <td><input type="number" min="0" step="1" id="salesClosings" class="form-control form-control-sm" value="${state.closings ?? 0}"></td>
    `;
    return tr;
  }

  function wireInputs() {
    const salesEl    = tbody.querySelector('#salesCount');
    const cancelsEl  = tbody.querySelector('#salesCancels');
    const netEl      = tbody.querySelector('#salesNet');
    const closingsEl = tbody.querySelector('#salesClosings');

    const recompute = () => {
      const net = Math.max(0, num(salesEl.value) - num(cancelsEl.value));
      netEl.value = net;
    };

    const save = async () => {
      const payload = {
        month: currentMonth,
        sales:    num(salesEl.value),
        cancels:  num(cancelsEl.value),
        closings: num(closingsEl.value),
      };
      const res = await fetch(SALES_API, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      // no need to read body unless you want to confirm values
    };

    const debouncedSave = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        save().catch(err => console.error('Save sales summary failed:', err));
      }, 400);
    };

    [salesEl, cancelsEl, closingsEl].forEach(el => {
      el.addEventListener('input', () => { recompute(); debouncedSave(); });
      el.addEventListener('blur', () => { recompute(); save().catch(console.error); });
    });
  }

  async function load(month /* "YYYY-MM" */) {
    if (!month) return;
    currentMonth = month;

    const res = await fetch(`${SALES_API}?month=${encodeURIComponent(month)}`);
    if (!res.ok) {
      console.error('Failed to load sales summary:', await res.text());
      return;
    }
    const data = await res.json();

    tbody.innerHTML = '';
    tbody.appendChild(buildRow({
      sales: data.sales ?? 0,
      cancels: data.cancels ?? 0,
      closings: data.closings ?? 0
    }));
    wireInputs();
  }

  return { load };
})();




// ---------------- Boot ----------------
document.addEventListener('DOMContentLoaded', () => {
  wireTabs();
  wireFeeToggles();
  updateFeeGroups();

  wireFormAutosaves();

  // Load dynamic sections
  metrics.wire();
  metrics.load().catch(console.error);

  topPlans.wire();
  topPlans.load().catch(console.error);

  lotStats.load().catch(console.error);

  // 👇 NEW: build month pills and reload the plans table when month changes
  monthTabs.subscribe((ym) => {
    priceTable.load(ym).catch(console.error);
    qmiTable.load(ym).catch(console.error);
    soldTable.load(ym).catch(console.error);
    salesSummary.load(ym).catch(console.error);  
  });
  monthTabs.init();

  setTimeout(() => {
  const ym = monthTabs.getSelectedMonth();
  if (ym) {
    priceTable.load(ym).catch(console.error);
    qmiTable.load(ym).catch(console.error);
    soldTable.load(ym).catch(console.error);
    salesSummary.load(ym).catch(console.error);
  }
}, 0);
// optional: if you only want to load QMI when the Inventory section is shown
const sectionNav = document.getElementById('sectionNav');
if (sectionNav) {
  sectionNav.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    const section = link.getAttribute('data-section');
    const ym = monthTabs.getSelectedMonth();

    if (section === 'inventory') {
      qmiTable.load(ym).catch(console.error);
      soldTable.load(ym).catch(console.error);
    } else if (section === 'price') {
      priceTable.load(ym).catch(console.error);
    } else if (section === 'sales') {
      salesSummary.load(ym).catch(console.error);
    }
  });
}
});
