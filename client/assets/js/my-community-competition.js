/*

(function () {
  const selectEl = document.getElementById('communitySelect');
  const editorArea = document.getElementById('editorArea');

  const promotionEl = document.getElementById('promotion');
  const tp1 = document.getElementById('topPlan1');
  const tp2 = document.getElementById('topPlan2');
  const tp3 = document.getElementById('topPlan3');

  const lotsTotal = document.getElementById('lotsTotal');
  const lotsSold = document.getElementById('lotsSold');
  const lotsRemaining = document.getElementById('lotsRemaining');
  const lotsQMI = document.getElementById('lotsQMI');

  const prosList = document.getElementById('prosList');
  const consList = document.getElementById('consList');
  const newPro = document.getElementById('newPro');
  const newCon = document.getElementById('newCon');

  let currentCommunityId = null;
  let pros = [];
  let cons = [];
  let saveTimer;

  // helper
  function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function enableEditor(enabled) {
    if (enabled) {
      editorArea.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      editorArea.classList.add('opacity-50', 'pointer-events-none');
    }
  }
  function renderList(container, items, removeFn) {
    container.innerHTML = '';
    (items || []).forEach((text, idx) => {
      const div = document.createElement('div');
      div.className = 'list-group-item d-flex justify-content-between align-items-center';
      div.textContent = text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline-danger';
      btn.textContent = 'Remove';
      btn.onclick = () => removeFn(idx);
      div.appendChild(btn);
      container.appendChild(div);
    });
  }
  function bindAutosave() {
    [promotionEl, tp1, tp2, tp3, lotsTotal, lotsSold, lotsRemaining, lotsQMI].forEach(el => {
      el.addEventListener('input', autosave);
    });
    newPro.addEventListener('keydown', e => {
      if (e.key === 'Enter' && newPro.value.trim()) {
        pros.push(newPro.value.trim());
        newPro.value = '';
        renderList(prosList, pros, removePro);
        autosave();
      }
    });
    newCon.addEventListener('keydown', e => {
      if (e.key === 'Enter' && newCon.value.trim()) {
        cons.push(newCon.value.trim());
        newCon.value = '';
        renderList(consList, cons, removeCon);
        autosave();
      }
    });
  }
  function removePro(index) {
    pros.splice(index, 1);
    renderList(prosList, pros, removePro);
    autosave();
  }
  function removeCon(index) {
    cons.splice(index, 1);
    renderList(consList, cons, removeCon);
    autosave();
  }
  async function autosave() {
    if (!currentCommunityId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = {
        promotion: promotionEl.value,
        topPlans: { plan1: tp1.value, plan2: tp2.value, plan3: tp3.value },
        prosCons: { pros, cons },
        lotCounts: {
          total: numOrNull(lotsTotal.value),
          sold: numOrNull(lotsSold.value),
          remaining: numOrNull(lotsRemaining.value),
          quickMoveInLots: numOrNull(lotsQMI.value),
        }
      };
      await fetch(`/api/my-community-competition/${currentCommunityId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
    }, 350);
  }

  // Load dropdown
  (async function loadCommunities() {
    try {
      const list = await fetch('/api/communities/select-options').then(r => r.json());
      list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c._id;
        opt.textContent = c.name || c._id;
        selectEl.appendChild(opt);
      });

      // Optional deep-link: if URL has ?communityId, preselect it
      const params = new URLSearchParams(window.location.search);
      const preId = params.get('communityId');
      if (preId && list.find(x => x._id === preId)) {
        selectEl.value = preId;
        await onSelectCommunity(preId);
      }
    } catch (err) {
      console.error('Failed to load communities', err);
    }
  })();

  // When user picks a community, fetch + render its profile (upsert if missing)
  selectEl.addEventListener('change', async () => {
    const id = selectEl.value;
    if (!id) {
      currentCommunityId = null;
      enableEditor(false);
      return;
    }
    await onSelectCommunity(id);
  });

  async function onSelectCommunity(id) {
    currentCommunityId = id;
    try {
      const { community, profile } = await fetch(`/api/my-community-competition/${id}`).then(r => r.json());

      // Fill the read-only prefill
      document.getElementById('commName').textContent = community.name || '';
      document.getElementById('commAddress').textContent = community.address || '';
      document.getElementById('commHoa').textContent = community.hoa || '';

      // Fill the editable profile
      promotionEl.value = profile.promotion || '';
      tp1.value = profile.topPlans?.plan1 || '';
      tp2.value = profile.topPlans?.plan2 || '';
      tp3.value = profile.topPlans?.plan3 || '';

      lotsTotal.value = profile.lotCounts?.total ?? '';
      lotsSold.value = profile.lotCounts?.sold ?? '';
      lotsRemaining.value = profile.lotCounts?.remaining ?? '';
      lotsQMI.value = profile.lotCounts?.quickMoveInLots ?? '';

      [lotsTotal, lotsSold, lotsRemaining, lotsQMI].forEach(el => el.setAttribute('readonly', 'readonly'));

      statTotalLots.textContent     = profile.lotCounts?.total ?? '—';
      statLotsSold.textContent      = profile.lotCounts?.sold ?? '—';
      statLotsRemaining.textContent = profile.lotCounts?.remaining ?? '—';
      statQmiAvailable.textContent  = profile.lotCounts?.quickMoveInLots ?? '—';

      // Pros/Cons
      pros = Array.isArray(profile.prosCons?.pros) ? [...profile.prosCons.pros] : [];
      cons = Array.isArray(profile.prosCons?.cons) ? [...profile.prosCons.cons] : [];
      renderList(prosList, pros, removePro);
      renderList(consList, cons, removeCon);

      // Linked competitors section (reuse your prior code if you already wrote it)
      await renderLinkedCompetitors(profile);

      enableEditor(true);
      if (!saveTimer) bindAutosave();
    } catch (err) {
      console.error('Failed to load community profile', err);
      enableEditor(false);
    }
  }

  async function renderLinkedCompetitors(profile) {
    const linkedContainer = document.getElementById('linkedCompetitors');
    const compResults = document.getElementById('competitionResults');
    const compSearch = document.getElementById('competitionSearch');

    let linked = (profile.linkedCompetitions || []).map(c => ({
      _id: c._id, name: c.name, builder: c.builder, market: c.market
    }));

    function drawLinked() {
      linkedContainer.innerHTML = '';
      linked.forEach(c => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `<div>
          <div><strong>${c.name}</strong></div>
          <small>${c.builder || ''} ${c.market ? '— ' + c.market : ''}</small>
        </div>`;
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-danger';
        btn.textContent = 'Remove';
        btn.onclick = async () => {
          linked = linked.filter(x => x._id !== c._id);
          await saveLinked(linked);
          drawLinked();
        };
        item.appendChild(btn);
        linkedContainer.appendChild(item);
      });
    }
    async function saveLinked(list) {
      if (!currentCommunityId) return;
      await fetch(`/api/my-community-competition/${currentCommunityId}/linked-competitions`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ competitionIds: list.map(x => x._id) })
      });
    }

    compSearch.oninput = async () => {
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
            await saveLinked(linked);
            drawLinked();
          }
        };
        compResults.appendChild(btn);
      });
    };

    drawLinked();
  }
})();

*/