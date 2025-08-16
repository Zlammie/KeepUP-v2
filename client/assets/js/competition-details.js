// public/scripts/competition-details.js
/*
(() => {
  const bootEl = document.getElementById('__COMPETITION_DATA__');
  let boot = {};
  try {
    boot = JSON.parse(bootEl?.textContent || '{}');
  } catch (e) {
    console.error('Failed to parse __COMPETITION_DATA__', e);
  }

  // Optional: mirror the old global shape so the rest of the script can stay the same
  window.__COMPETITION__ = {
    id: boot.id || null,
    amenities: Array.isArray(boot.amenities) ? boot.amenities : []
  };
(() => {
  const competitionId = window.__COMPETITION__?.id;

  // ---------- Utilities ----------
  const debounce = (fn, wait = 600) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Fee UI logic ----------
  const feeNone = $('#feeNone');
  const feeMud  = $('#feeMud');
  const feePid  = $('#feePid');
  const mudGrp  = $('#mudFeeGroup');
  const pidGrp  = $('#pidFeeGroup');

  function syncFeeUI() {
    if (!feeNone || !feeMud || !feePid) return;

    // If None checked -> uncheck others and hide groups
    if (feeNone.checked) {
      feeMud.checked = false;
      feePid.checked = false;
      mudGrp.style.display = 'none';
      pidGrp.style.display = 'none';
      return;
    }

    // If any of MUD/PID checked -> None off
    if (feeMud.checked || feePid.checked) {
      feeNone.checked = false;
    }

    mudGrp.style.display = feeMud.checked ? 'block' : 'none';
    pidGrp.style.display = feePid.checked ? 'block' : 'none';
  }

  [feeNone, feeMud, feePid].forEach(cb => cb?.addEventListener('change', () => {
    syncFeeUI();
    debouncedSave();
  }));
  syncFeeUI();

  // ---------- Build autosave payload ----------
  function buildPayload() {
    const data = {};
    // All standard inputs/selects
    $$('input[type="text"], input[type="email"], input[type="number"], select').forEach(el => {
      if (!el.name) return;
      data[el.name] = el.value;
    });

    // Fee types
    const fees = [];
    if (feeMud?.checked) fees.push('MUD');
    if (feePid?.checked) fees.push('PID');
    if (feeNone?.checked) fees.push('None');
    data.feeTypes = fees;

    // Garage type (radios)
    const garage = $('input[name="garageType"]:checked');
    data.garageType = garage ? garage.value : null;

    return data;
  }

  async function autoSave() {
    if (!competitionId) return;
    const payload = buildPayload();

    try {
      const res = await fetch(`/api/competitions/${competitionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      // console.log('✔ Auto-saved competition data');
    } catch (err) {
      console.error('❌ Auto-save error:', err);
    }
  }

  const debouncedSave = debounce(autoSave, 800);

  // Hook inputs
  $$('input[type="text"], input[type="email"], input[type="number"], select')
    .forEach(el => el.addEventListener('input', debouncedSave));

  $$('input[name="garageType"]').forEach(el => el.addEventListener('change', debouncedSave));

  // ---------- Amenities editor ----------
  const AMENITIES = {
    "Pools": ["Pool", "Resort Style Pool", "Multiple Pools", "Lagoon", "Splash Pad"],
    "Indoor": ["Fitness Center", "Clubhouse", "Amenity Center"],
    "Recreational": ["Tennis", "Pickle Ball", "Volleyball", "Basketball", "Soccer", "Zip Line", "BBQ Grills"],
    "Parks & Trails": ["Playground", "Dog Park", "Community Park", "Green Spaces", "Gardens", "Hiking Trails", "Biking Trails"],
    "Misc.": ["Shops", "Community Cafe", "Golf Course", "Front Yard Maintenance"]
  };

  const openBtn  = $('#openAmenitiesBtn');
  const modal    = $('#amenitiesModal');
  const closeBtn = $('#closeAmenitiesModal');
  const form     = $('#amenitiesForm');
  const container = $('#amenitiesContainer');

  function renderAmenities() {
    container.innerHTML = '';
    Object.entries(AMENITIES).forEach(([category, items]) => {
      const fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = category;
      fs.appendChild(legend);

      items.forEach(item => {
        const label = document.createElement('label');
        label.style.display = 'inline-block';
        label.style.marginRight = '0.75rem';
        label.innerHTML = `
          <input type="checkbox" name="${category}" value="${item}">
          ${item}
        `;
        fs.appendChild(label);
      });

      container.appendChild(fs);
    });
  }

  function preloadAmenities() {
    const saved = window.__COMPETITION__?.amenities || [];
    // Clear all first
    $$('#amenitiesForm input[type="checkbox"]').forEach(cb => cb.checked = false);

    saved.forEach(group => {
      (group.items || []).forEach(item => {
        const box = $(`#amenitiesForm input[name="${CSS.escape(group.category)}"][value="${CSS.escape(item)}"]`);
        if (box) box.checked = true;
      });
    });
  }

  openBtn?.addEventListener('click', () => {
    renderAmenities();
    preloadAmenities();
    modal.style.display = 'block';
  });

  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const checked = $$('#amenitiesForm input[type="checkbox"]:checked');
    const grouped = {};
    checked.forEach(cb => {
      if (!grouped[cb.name]) grouped[cb.name] = [];
      grouped[cb.name].push(cb.value);
    });
    const formatted = Object.entries(grouped).map(([category, items]) => ({ category, items }));

    try {
      const res = await fetch(`/api/competitions/${competitionId}/amenities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityAmenities: formatted })
      });
      if (!res.ok) throw new Error(`Amenities save failed: ${res.status}`);
      modal.style.display = 'none';
      // Reload the page amenities preview without a full page navigation:
      // simplest approach is a reload; if you prefer, fetch competition and patch DOM
      location.reload();
    } catch (err) {
      console.error(err);
      alert('❌ Failed to save amenities');
    }
  });
})();

})();

*/