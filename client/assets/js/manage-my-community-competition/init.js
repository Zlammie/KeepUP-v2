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

// ===== Price tab: Floor Plans table =====
(function () {
  // resolve communityId the same way as other sections
  const dataEl = document.getElementById('community-data');
  const initial = dataEl ? JSON.parse(dataEl.textContent) : {};
  const communityId =
    (document.body.getAttribute('data-community-id') || '').trim() ||
    initial.communityId || '';
  if (!communityId) return;

  const PLANS_API = `/api/communities/${communityId}/floorplans`;
  const table = document.getElementById('monthTable');
  if (!table) return;
  const tbody = table.querySelector('tbody');

  // simple formatters
  const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString() : (n ?? '—'));
  const safe = (s) => (s == null || s === '' ? '—' : s);

  async function loadPlansIntoTable() {
    try {
      const res = await fetch(PLANS_API);
      if (!res.ok) throw new Error(await res.text());
      const plans = await res.json();

      // clear body
      tbody.innerHTML = '';

      // build rows
      plans.forEach(p => {
        const sq = p?.specs?.squareFeet;
        const beds = p?.specs?.beds;
        const baths = p?.specs?.baths;
        const garage = p?.specs?.garage;

        // story & price aren’t in the FloorPlan schema yet; show placeholder for now
        const story = '—';
        const price = '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${safe(p?.name)}${p?.planNumber ? ` (${p.planNumber})` : ''}</td>
          <td>${fmtNum(sq)}</td>
          <td>${fmtNum(beds)}</td>
          <td>${fmtNum(baths)}</td>
          <td>${fmtNum(garage)}</td>
          <td>${story}</td>
          <td>${price}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Failed to load floor plans:', err);
      // keep the table body empty but don’t crash the page
    }
  }

  // Load immediately, and also whenever the “price” tab is clicked
  document.addEventListener('DOMContentLoaded', () => {
    loadPlansIntoTable().catch(console.error);
  });
  const nav = document.getElementById('sectionNav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-link');
      if (link && link.getAttribute('data-section') === 'price') {
        loadPlansIntoTable().catch(console.error);
      }
    });
  }
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
});
