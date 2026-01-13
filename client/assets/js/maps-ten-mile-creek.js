(() => {
  // Shared tooltip (singleton)
  const tooltip = (() => {
    const existing = document.getElementById('map-tooltip');
    if (existing) return existing;
    const el = document.createElement('div');
    el.id = 'map-tooltip';
    document.body.appendChild(el);
    return el;
  })();

  const PLAN_CLASS_BY_NAME = {
    catalpa: 'plan-catalpa',
    laurel: 'plan-laurel',
    mimosa: 'plan-mimosa',
    hawthorne: 'plan-hawthorne',
    '2261': 'plan-2261',
    '2262': 'plan-2262',
    '2263': 'plan-2263',
    '2260': 'plan-2260'
  };
  const DEFAULT_PLAN_CLASS = 'plan-unknown';
  const UNASSIGNED_CLASS = 'lot-unassigned';

  const normalizePlanClass = (planName) => {
    const norm = (planName || '').trim().toLowerCase();
    return PLAN_CLASS_BY_NAME[norm] || null;
  };

  const extractPlanInfo = (lot, link) => {
    const pickFirst = (list) => list.map((v) => (v == null ? '' : String(v).trim())).find(Boolean) || '';
    const planObj = lot && typeof lot === 'object' && lot.floorPlan && typeof lot.floorPlan === 'object'
      ? lot.floorPlan
      : null;
    const planName = pickFirst([
      lot?.floorPlanName,
      lot?.floorPlan,
      planObj?.name,
      planObj?.title,
      planObj?.code,
      link?.plan,
      link?.floorPlan,
      link?.floorPlanName
    ]);
    const planNumber = pickFirst([
      lot?.floorPlanNumber,
      lot?.planNumber,
      planObj?.planNumber,
      link?.planNumber
    ]);
    return { name: planName, number: planNumber };
  };

  const normalizeSvgViewport = (svgEl) => {
    if (!svgEl) return;
    const parseNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const vb = (() => {
      const raw = svgEl.getAttribute('viewBox');
      if (!raw) return null;
      const parts = raw.trim().split(/\s+/).map(parseNumber);
      return parts.length === 4 ? { width: parts[2], height: parts[3] } : null;
    })();
    const baseWidth = parseNumber(svgEl.getAttribute('width'));
    const baseHeight = parseNumber(svgEl.getAttribute('height'));
    const img = svgEl.querySelector('image');
    const imgWidth = parseNumber(img?.getAttribute('width'));
    const imgHeight = parseNumber(img?.getAttribute('height'));
    const bbox = (() => {
      try { return svgEl.getBBox(); } catch (_) { return null; }
    })();
    const bboxWidth = bbox?.width || 0;
    const bboxHeight = bbox?.height || 0;
    const targetWidth = Math.max(vb?.width || 0, baseWidth, imgWidth, bboxWidth);
    const targetHeight = Math.max(vb?.height || 0, baseHeight, imgHeight, bboxHeight);
    if (targetWidth > 0 && targetHeight > 0) {
      if (!vb || targetWidth !== vb.width || targetHeight !== vb.height) {
        svgEl.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);
      }
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.overflow = 'visible';
    }
  };

  const hideTooltip = () => {
    tooltip.style.opacity = '0';
  };

  const normalizePlanKey = (value) => {
    const raw = value == null ? '' : String(value);
    const base = raw.trim().toLowerCase();
    if (!base) return '';
    const cleaned = base
      .replace(/^floor\s*plan\s*/i, '')
      .replace(/^plan\s*/i, '')
      .replace(/^#/, '')
      .trim();
    return cleaned;
  };

  const normalizeAddress = (value) => {
    if (!value) return '';
    return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
  };

  const normalizeJobNumber = (value) => {
    const s = (value == null ? '' : String(value)).trim();
    if (!s) return '';
    return s.padStart(4, '0');
  };

  const derivePlanClass = (lot, link) => {
    const candidates = [];
    if (lot) {
      candidates.push(
        lot.floorPlanName,
        lot.floorPlanNumber,
        lot.planNumber,
        lot.floorPlanCode,
        lot.floorPlan
      );
      const fp = lot.floorPlan;
      if (fp && typeof fp === 'object') {
        candidates.push(fp.planNumber, fp.name, fp.title, fp.code);
      }
    }
    if (link) {
      candidates.push(link.planNumber, link.plan, link.floorPlan, link.floorPlanName);
    }

    for (const cand of candidates) {
      const key = normalizePlanKey(cand);
      if (!key) continue;
      const mapped = PLAN_CLASS_BY_NAME[key];
      if (mapped) return mapped;
      const byName = normalizePlanClass(key);
      if (byName) return byName;
    }
    return null;
  };

  const isSoldLike = (lot) => {
    const normalize = (v) => (v == null ? '' : String(v)).trim().toLowerCase();
    const tokens = new Set(['sold', 'closed']);
    const candidates = [
      lot?.generalStatus,
      lot?.status,
      lot?.buildingStatus
    ].map(normalize);
    return candidates.some((c) => tokens.has(c));
  };

  const buildAddress = (lot, link) => {
    if (lot?.address) return lot.address;
    if (link?.address) return link.address;
    const parts = [];
    if (lot?.lot) parts.push(`Lot ${lot.lot}`);
    else if (link?.lotNumber) parts.push(`Lot ${link.lotNumber}`);
    if (lot?.block || link?.block) parts.push(`Block ${lot?.block || link?.block}`);
    if (lot?.phase || link?.phase) parts.push(`Phase ${lot?.phase || link?.phase}`);
    return parts.join(' | ') || '';
  };

  const normalizeLinks = (raw) => {
    const map = new Map();

    if (raw && typeof raw === 'object' && Array.isArray(raw.links)) {
      raw = raw.links;
    }

    if (raw && typeof raw === 'object' && raw.data && Array.isArray(raw.data.links)) {
      raw = raw.data.links;
    }

    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (!entry || !entry.regionId) return;
        map.set(String(entry.regionId), entry);
      });
      return map;
    }

    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([regionId, entry]) => {
        if (!regionId) return;
        map.set(String(regionId), { regionId, ...(entry || {}) });
      });
    }
    return map;
  };

  const loadLinks = async (linksUrl) => {
    if (!linksUrl) return new Map();
    const res = await fetch(linksUrl, { cache: 'no-cache' });
    if (res.status === 404) return new Map(); // allow maps without link metadata
    if (!res.ok) throw new Error(`Links fetch failed (${res.status})`);
    const data = await res.json();
    return normalizeLinks(data);
  };

  const loadLotsByAddressOrJob = async (linkMap) => {
    const addresses = [];
    const jobNumbers = [];
    for (const link of linkMap.values()) {
      if (!link) continue;
      if (link.address) addresses.push(link.address);
      const job = link.jobNumber || link.job || link.lotNumber || link.lotId;
      if (job) jobNumbers.push(job);
    }

    if (!addresses.length && !jobNumbers.length) {
      return { byAddress: new Map(), byJob: new Map(), byId: new Map() };
    }

    const res = await fetch('/api/lots/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses, jobNumbers })
    });
    if (!res.ok) throw new Error(`Lot lookup failed (${res.status})`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.lots) ? data.lots : [];

    const byAddress = new Map();
    const byJob = new Map();
    const byId = new Map();
    list.forEach((lot) => {
      if (!lot) return;
      if (lot._id) byId.set(String(lot._id), lot);
      if (lot.address) byAddress.set(normalizeAddress(lot.address), lot);
      if (lot.jobNumber) byJob.set(normalizeJobNumber(lot.jobNumber), lot);
    });
    return { byAddress, byJob, byId };
  };

  const loadOverlay = async (overlayUrl) => {
    if (!overlayUrl) return null;
    const res = await fetch(overlayUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Overlay fetch failed (${res.status})`);
    const svgText = await res.text();
    return svgText;
  };

  const renderDetails = (ctx, regionId, record) => {
    const { selectedTitle, infoEmpty, infoDetails, fields } = ctx;
    const hasRecord = Boolean(record);
    if (!selectedTitle) return;

    selectedTitle.textContent = hasRecord
      ? (record.lotNumber ? `Lot ${record.lotNumber}` : (record.regionId || 'Selected lot'))
      : (regionId ? `Region ${regionId}` : 'No lot selected');

    if (infoEmpty && infoDetails) {
      infoEmpty.classList.toggle('visually-hidden', hasRecord);
      infoDetails.classList.toggle('visually-hidden', !hasRecord);
    }

    if (!hasRecord) {
      Object.values(fields).forEach((el) => el && (el.textContent = '-'));
      return;
    }

    fields.regionId && (fields.regionId.textContent = record.regionId || regionId || '-');
    fields.lotId && (fields.lotId.textContent = record.lotId || '-');
    fields.lotNumber && (fields.lotNumber.textContent = record.lotNumber || '-');
    fields.block && (fields.block.textContent = record.block || '-');
    fields.phase && (fields.phase.textContent = record.phase || '-');
    fields.address && (fields.address.textContent = record.address || '-');
    fields.planName && (fields.planName.textContent = record.planName || record.plan || '-');
    fields.planNumber && (fields.planNumber.textContent = record.planNumber || '-');
  };

  const bindPaths = (ctx, svgEl, linkMap) => {
    const paths = svgEl.querySelectorAll('path[id]');
    if (!paths.length) {
      ctx.setStatus('No path IDs found');
      return;
    }

    paths.forEach((path) => {
      const regionId = path.id;
      const link = linkMap.get(regionId);
      const lot = (() => {
        if (!link) return null;
        const addrKey = normalizeAddress(link.address);
        const jobKey = normalizeJobNumber(link.jobNumber || link.job || link.lotNumber || link.lotId);
        return (
          ctx.lotLookup.byAddress.get(addrKey) ||
          ctx.lotLookup.byJob.get(jobKey) ||
          (link.lotId ? ctx.lotLookup.byId.get(String(link.lotId)) : null) ||
          null
        );
      })();

      if (link) path.classList.add('linked');

      const hasLot = Boolean(lot);
      let planClass = null;
      if (hasLot) {
        planClass = derivePlanClass(lot, link);
        if (planClass) path.classList.add(planClass);
        else path.classList.add(DEFAULT_PLAN_CLASS);
      } else {
        path.classList.add(UNASSIGNED_CLASS);
      }

      const isSold = isSoldLike(lot);
      if (isSold) path.classList.add('lot-sold');

      const planInfo = extractPlanInfo(lot, link);
      const planClassKey = planClass || (hasLot ? DEFAULT_PLAN_CLASS : null);
      if (planClassKey && !ctx.planMetaMap.has(planClassKey)) {
        const label = planClassKey === DEFAULT_PLAN_CLASS
          ? 'Not Avai'
          : (planInfo.name || planInfo.number || planClassKey.replace(/^plan-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
        ctx.planMetaMap.set(planClassKey, {
          className: planClassKey,
          name: planInfo.name || '',
          planNumber: planClassKey === DEFAULT_PLAN_CLASS ? 'N/A' : (planInfo.number || ''),
          label
        });
      }
      path.addEventListener('mouseenter', (evt) => {
        path.classList.add('hovered');
        const addr = buildAddress(lot, link);
        const plan = (() => {
          if (planInfo.name && planInfo.number) return `${planInfo.name} (${planInfo.number})`;
          if (planInfo.name) return planInfo.name;
          if (planInfo.number) return planInfo.number;
          return '';
        })();
        const jobNumber = lot?.jobNumber || link?.jobNumber || link?.lotNumber || '';
        const tooltipLines = [];
        if (addr) tooltipLines.push(addr);
        if (jobNumber) tooltipLines.push(`Job #: ${jobNumber}`);
        if (plan) tooltipLines.push(plan);
        if (tooltipLines.length) showTooltip(tooltipLines.join('<br>'), evt);
      });

      path.addEventListener('mousemove', (evt) => {
        if (tooltip.style.opacity === '1') {
          tooltip.style.left = `${evt.pageX + 14}px`;
          tooltip.style.top = `${evt.pageY + 14}px`;
        }
      });

      path.addEventListener('mouseleave', () => {
        path.classList.remove('hovered');
        hideTooltip();
      });

      path.addEventListener('click', (event) => {
        event.preventDefault();
        if (ctx.activePath && ctx.activePath !== path) ctx.activePath.classList.remove('selected');
        ctx.activePath = path;
        ctx.activePath.classList.add('selected');
        const detail = link ? { ...link } : { regionId };
        detail.planName = detail.planName || planInfo.name || detail.plan;
        detail.planNumber = detail.planNumber || planInfo.number || detail.plan;
        if (lot) {
          detail.lotId = lot._id || detail.lotId;
          detail.address = buildAddress(lot, link) || detail.address;
          detail.floorPlan = lot.floorPlanName || lot.floorPlan || detail.floorPlan || planInfo.name || planInfo.number;
          detail.status = lot.status || lot.generalStatus || detail.status;
          detail.block = lot.block || detail.block;
          detail.phase = lot.phase || detail.phase;
          detail.lotNumber = lot.lot || detail.lotNumber;
        } else if (!detail.address) {
          detail.address = buildAddress(lot, link);
        }
        renderDetails(ctx, regionId, detail);
      });
    });

    ctx.setStatus('Ready');
  };

  const renderMap = async (root) => {
    if (!root) return;
    const overlayContainer = root.querySelector('#overlay');
    if (!overlayContainer) return;
    const infoEmpty = root.querySelector('#map-info-empty');
    const infoDetails = root.querySelector('#map-info-details');
    const selectedTitle = root.querySelector('#map-selected-title');
    const statusEl = root.querySelector('#map-status');
    const fields = {
      regionId: root.querySelector('[data-field="regionId"]'),
      lotId: root.querySelector('[data-field="lotId"]'),
      lotNumber: root.querySelector('[data-field="lotNumber"]'),
      block: root.querySelector('[data-field="block"]'),
      phase: root.querySelector('[data-field="phase"]'),
      address: root.querySelector('[data-field="address"]'),
      planName: root.querySelector('[data-field="planName"]'),
      planNumber: root.querySelector('[data-field="planNumber"]')
    };

    const ctx = {
      activePath: null,
      lotLookup: { byAddress: new Map(), byJob: new Map(), byId: new Map() },
      infoEmpty,
      infoDetails,
      selectedTitle,
      fields,
      planMetaMap: new Map(),
      setStatus: (text) => { if (statusEl) statusEl.textContent = text; }
    };

    const overlayUrl = root.dataset.combinedSrc || root.dataset.overlaySrc;
    const linksUrl = root.dataset.linksSrc;

    ctx.setStatus(overlayUrl ? 'Loading map...' : 'No map uploaded');
    hideTooltip();
    overlayContainer.innerHTML = '';

    if (!overlayUrl) {
      return;
    }

    try {
      const linksPromise = loadLinks(linksUrl);
      const overlayPromise = loadOverlay(overlayUrl);
      const linkMap = await linksPromise;
      ctx.lotLookup = await loadLotsByAddressOrJob(linkMap);
      const svgText = await overlayPromise;
      if (!svgText) {
        ctx.setStatus('No map uploaded');
        return;
      }
      overlayContainer.innerHTML = svgText;
      const svgEl = overlayContainer.querySelector('svg');
      if (!svgEl) throw new Error('Overlay missing <svg>');
      svgEl.classList.add('map-overlay-svg');
      svgEl.setAttribute('aria-hidden', 'true');
      svgEl.setAttribute('focusable', 'false');
      normalizeSvgViewport(svgEl);
      bindPaths(ctx, svgEl, linkMap);
      // Fit to available frame then apply stored zoom if any
      const fitted = fitLotMap(root, svgEl);
      const desiredZoom = parseFloat(root.dataset.zoom || '1') || 1;
      if (desiredZoom !== 1) applyLotMapZoom(root, desiredZoom);
      else applyLotMapZoom(root, fitted);
      const planMeta = Array.from(ctx.planMetaMap.values());
      root.dispatchEvent(new CustomEvent('lotmap:ready', { detail: { root, svgEl, linkMap, planMeta } }));
    } catch (err) {
      console.error('Map overlay setup failed', err);
      if (ctx.infoEmpty) ctx.infoEmpty.classList.remove('visually-hidden');
      if (ctx.infoDetails) ctx.infoDetails.classList.add('visually-hidden');
      ctx.setStatus('Error');
      if (ctx.infoEmpty) ctx.infoEmpty.textContent = err.message || 'Failed to load map assets.';
    }
  };

  window.renderLotMap = (root) => {
    renderMap(root);
  };

  const fitLotMap = (root, svgEl) => {
    if (!root || !svgEl) return 1;
    const frame = root.querySelector('.map-frame');
    if (!frame) return 1;
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const svgWidth = vb && vb.width ? vb.width : (svgEl.getBoundingClientRect().width || frame.clientWidth || 1);
    const svgHeight = vb && vb.height ? vb.height : (svgEl.getBoundingClientRect().height || frame.clientHeight || 1);
    const availableWidth = Math.max(1, frame.clientWidth - 32);
    const availableHeight = Math.max(1, frame.clientHeight - 32);
    const scale = Math.min(availableWidth / svgWidth, availableHeight / svgHeight, 1);
    applyLotMapZoom(root, scale);
    return scale;
  };

  window.applyLotMapZoom = (root, scale) => {
    if (!root) return;
    const overlayContainer = root.querySelector('#overlay');
    const display = root.querySelector('[data-zoom-display]');
    const clamped = Math.max(0.5, Math.min(3, Number(scale) || 1));
    if (overlayContainer) {
      overlayContainer.style.transform = `scale(${clamped})`;
      overlayContainer.style.transformOrigin = 'top left';
    }
    if (display) display.textContent = `${Math.round(clamped * 100)}%`;
  };

  // Auto init if page already has map-root with dataset
  const autoRoot = document.querySelector('#map-root');
  if (autoRoot) renderMap(autoRoot);
})();
