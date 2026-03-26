(() => {
  const els = {
    profileForm: document.getElementById('brzProfileForm'),
    profileStatus: document.getElementById('brzProfileStatus'),
    builderName: document.getElementById('brzBuilderName'),
    builderSlug: document.getElementById('brzBuilderSlug'),
    displayNameOverride: document.getElementById('brzDisplayNameOverride'),
    shortDescription: document.getElementById('brzShortDescription'),
    longDescription: document.getElementById('brzLongDescription'),
    pricingDisclaimer: document.getElementById('brzPricingDisclaimer'),
    ctaWebsite: document.getElementById('brzCtaWebsite'),
    ctaSchedule: document.getElementById('brzCtaSchedule'),
    ctaContact: document.getElementById('brzCtaContact'),
    heroPreview: document.getElementById('brzHeroPreview'),
    heroUpload: document.getElementById('brzHeroUpload'),
    heroUploadBtn: document.getElementById('brzHeroUploadBtn'),
    communitiesBody: document.getElementById('brzCommunitiesBody'),
    bulkSyncBtn: document.getElementById('brzBulkSyncBtn'),
    bulkSyncCount: document.getElementById('brzBulkSyncCount'),
    bulkSyncStatus: document.getElementById('brzBulkSyncStatus'),
    communityFilters: document.querySelectorAll('.brz-community-filter'),
    floorPlansBody: document.getElementById('brzFloorPlansBody'),
    floorPlanSearch: document.getElementById('brzFloorPlanSearch'),
    floorPlanCommunityFilter: document.getElementById('brzFloorPlanCommunityFilter'),
    floorPlanIncludeFilter: document.getElementById('brzFloorPlanIncludeFilter'),
    floorPlanFilterSummary: document.getElementById('brzFloorPlanFilterSummary'),
    packagePublishVersion: document.getElementById('brzPackagePublishVersion'),
    packagePublishAt: document.getElementById('brzPackagePublishAt'),
    packagePublishStatus: document.getElementById('brzPackagePublishStatus'),
    inventoryPublishVersion: document.getElementById('brzInventoryPublishVersion'),
    inventoryPublishAt: document.getElementById('brzInventoryPublishAt'),
    inventoryPublishStatus: document.getElementById('brzInventoryPublishStatus'),
    inventoryWarnings: document.getElementById('brzInventoryWarnings'),
    summaryBuilderStatus: document.getElementById('brzSummaryBuilderStatus'),
    summaryBuilderDetails: document.getElementById('brzSummaryBuilderDetails'),
    summaryCommunityStatus: document.getElementById('brzSummaryCommunityStatus'),
    summaryCommunityDetails: document.getElementById('brzSummaryCommunityDetails'),
    summaryFloorPlanStatus: document.getElementById('brzSummaryFloorPlanStatus'),
    summaryFloorPlanDetails: document.getElementById('brzSummaryFloorPlanDetails'),
    summaryMissingSummary: document.getElementById('brzSummaryMissingSummary'),
    summaryPublishHint: document.getElementById('brzSummaryPublishHint'),
    previewLink: document.getElementById('brzPreviewLink'),
    publishPackageBtn: document.getElementById('brzPublishPackageBtn'),
    publishInventoryBtn: document.getElementById('brzPublishInventoryBtn'),
    publishStatus: document.getElementById('brzPublishStatus'),
    profileSaveBtn: document.getElementById('brzProfileSaveBtn'),
    workflowTabs: Array.from(document.querySelectorAll('[data-brz-workflow-tab]')),
    workflowPanels: Array.from(document.querySelectorAll('[data-brz-workflow-panel]'))
  };

  const state = {
    company: null,
    profileDraft: null,
    communities: [],
    floorPlans: [],
    latestSnapshot: null,
    latestPackageSnapshot: null,
    latestInventorySnapshot: null,
    outOfDateCommunitiesCount: 0,
    communityFilter: 'all',
    floorPlanSearch: '',
    floorPlanCommunityFilter: 'all',
    floorPlanIncludeFilter: 'all'
  };
  const pendingSaves = new Set();
  const WORKFLOW_QUERY_KEY = 'workflow';
  const WORKFLOW_PANELS = new Set(['builder-plans', 'communities', 'publish']);
  let activeWorkflowPanel = 'builder-plans';

  const setActiveWorkflowPanel = (panelKey, { syncUrl = false } = {}) => {
    const normalizedKey = toText(panelKey).toLowerCase();
    const target = WORKFLOW_PANELS.has(normalizedKey) ? normalizedKey : 'builder-plans';
    activeWorkflowPanel = target;

    if (Array.isArray(els.workflowTabs)) {
      els.workflowTabs.forEach((button) => {
        const key = toText(button.dataset.brzWorkflowTab).toLowerCase();
        const isActive = key === target;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    if (Array.isArray(els.workflowPanels)) {
      els.workflowPanels.forEach((panel) => {
        const key = toText(panel.dataset.brzWorkflowPanel).toLowerCase();
        panel.hidden = key !== target;
      });
    }

    if (syncUrl && typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      if (target === 'builder-plans') {
        url.searchParams.delete(WORKFLOW_QUERY_KEY);
      } else {
        url.searchParams.set(WORKFLOW_QUERY_KEY, target);
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const setupWorkflowTabs = () => {
    if (!Array.isArray(els.workflowTabs) || !els.workflowTabs.length) return;
    const params = new URLSearchParams(window.location.search || '');
    const requested = toText(params.get(WORKFLOW_QUERY_KEY)).toLowerCase();
    setActiveWorkflowPanel(requested || 'builder-plans');

    els.workflowTabs.forEach((button) => {
      button.addEventListener('click', () => {
        const key = toText(button.dataset.brzWorkflowTab).toLowerCase();
        setActiveWorkflowPanel(key, { syncUrl: true });
      });
    });
  };

  const escapeHtml = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const toText = (value) => (value == null ? '' : String(value).trim());
  const toNumberOr = (value, fallback = 0) => {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const toNumberOrNull = (value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const formatPercentInput = (value, scale = 100) => {
    const amount = toNumberOrNull(value);
    if (amount == null) return '';
    const scaled = amount * scale;
    return String(Number(scaled.toFixed(3)));
  };
  const formatLegacyPercentInput = (value) => {
    const amount = toNumberOrNull(value);
    if (amount == null) return '';
    return String(Number(amount.toFixed(3)));
  };
  const formatTaxRateInputValue = (entry, webData) => {
    const canonical = formatPercentInput(webData?.taxRate);
    if (canonical) return canonical;
    const profileFallback = formatLegacyPercentInput(entry?.competitionProfileTax);
    if (profileFallback) return profileFallback;
    return formatLegacyPercentInput(entry?.competitionLegacyTax);
  };
  const normalizeAmenityLabels = (value) => {
    if (!Array.isArray(value)) return [];
    const labels = [];
    const seen = new Set();
    value.forEach((entry) => {
      const label = toText(typeof entry === 'string' ? entry : entry?.label);
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      labels.push(label);
    });
    return labels;
  };
  const renderAmenityChips = (value) => {
    const labels = normalizeAmenityLabels(value);
    if (!labels.length) {
      return '<span class="text-muted">—</span>';
    }
    return labels
      .map((label) => `<span class="badge text-bg-light border me-1 mb-1">${escapeHtml(label)}</span>`)
      .join('');
  };
  const renderLabelChips = (value) => renderAmenityChips(value);
  const normalizeLotSizeLabels = (value) => {
    if (!Array.isArray(value)) return [];
    const labels = [];
    const seen = new Set();
    value.forEach((entry) => {
      const parsed = Number(entry);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      const normalized = Number(parsed.toFixed(3));
      if (seen.has(normalized)) return;
      seen.add(normalized);
      labels.push(`${normalized}' Lot`);
    });
    return labels;
  };
  const renderClassificationChips = (productTypes, lotSizes) => {
    const labels = [
      ...normalizeAmenityLabels(productTypes),
      ...normalizeLotSizeLabels(lotSizes)
    ];
    if (!labels.length) {
      return '<span class="text-muted">â€”</span>';
    }
    return labels
      .map((label) => `<span class="badge text-bg-light border me-1 mb-1">${escapeHtml(label)}</span>`)
      .join('');
  };
  const normalizePromo = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const headline = toText(value);
      return headline ? { headline } : null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const promo = {
      headline: toText(value.headline),
      description: toText(value.description),
      disclaimer: toText(value.disclaimer)
    };
    if (!promo.headline && !promo.description && !promo.disclaimer) {
      return null;
    }
    return promo;
  };
  const renderPromoSummary = (value) => {
    const promo = normalizePromo(value);
    if (!promo) {
      return '<span class="text-muted">&mdash;</span>';
    }
    const parts = [
      promo.headline ? `<div class="fw-semibold">${escapeHtml(promo.headline)}</div>` : '',
      promo.description ? `<div class="small text-muted">${escapeHtml(promo.description)}</div>` : '',
      promo.disclaimer ? `<div class="small text-muted fst-italic">${escapeHtml(promo.disclaimer)}</div>` : ''
    ].filter(Boolean);
    return parts.join('');
  };
  const renderPromoModeBadge = (value) => {
    const mode = toText(value).toLowerCase() === 'override' ? 'override' : 'add';
    const label = mode === 'override' ? 'Override' : 'Add';
    const badgeClass = mode === 'override' ? 'text-bg-warning' : 'text-bg-light border';
    return `<span class="badge ${badgeClass}">${label}</span>`;
  };
  const parseTaxRateInput = (value) => {
    const raw = toText(value);
    if (!raw) return null;
    const hasPercentSuffix = raw.endsWith('%');
    const numericText = hasPercentSuffix ? raw.slice(0, -1).trim() : raw;
    const parsed = Number(numericText);
    if (!Number.isFinite(parsed)) {
      throw new Error('Tax Rate must be a valid number');
    }
    if (parsed < 0) {
      throw new Error('Tax Rate cannot be negative');
    }
    const decimalValue = (hasPercentSuffix || parsed >= 1) ? (parsed / 100) : parsed;
    return Number(decimalValue.toFixed(6));
  };
  const formatCurrency = (value) => {
    const amount = toNumberOrNull(value);
    if (amount == null) return '';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      }).format(amount);
    } catch (_) {
      return `$${amount}`;
    }
  };
  const formatPidFeeLabel = (webData) => {
    const amount = formatCurrency(webData?.pidFeeAmount);
    if (!amount) return '-';
    const frequency = toText(webData?.pidFeeFrequency).toLowerCase();
    if (frequency === 'monthly') return `${amount}/mo`;
    if (frequency === 'yearly') return `${amount}/yr`;
    return amount;
  };
  const formatRatePercentLabel = (value) => {
    const amount = toNumberOrNull(value);
    if (amount == null) return '';
    return `${Number((amount * 100).toFixed(3))}%`;
  };
  const renderMudSummary = (webData) => {
    const mudTaxRate = formatRatePercentLabel(webData?.mudTaxRate);
    if (mudTaxRate) {
      return `<span class="text-muted ms-2">MUD:</span> ${escapeHtml(mudTaxRate)}`;
    }
    const legacyAmount = formatCurrency(webData?.mudFeeAmount);
    if (legacyAmount) {
      return `<span class="text-muted ms-2">MUD (legacy):</span> ${escapeHtml(legacyAmount)} <span class="badge text-bg-warning ms-1">Needs rate</span>`;
    }
    return '<span class="text-muted ms-2">MUD:</span> -';
  };
  const renderCommunityFeeSummary = (webData) => (
    `<span class="text-muted">PID:</span> ${escapeHtml(formatPidFeeLabel(webData))}`
    + renderMudSummary(webData)
  );

  const setStatus = (el, message, tone = 'muted') => {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('brz-status-muted', 'brz-status-success', 'brz-status-error', 'text-muted', 'text-success', 'text-danger');
    if (tone === 'success') {
      el.classList.add('brz-status-success', 'text-success');
      return;
    }
    if (tone === 'error') {
      el.classList.add('brz-status-error', 'text-danger');
      return;
    }
    el.classList.add('brz-status-muted', 'text-muted');
  };

  const updateImagePreview = (imgEl, imageMeta) => {
    if (!imgEl) return;
    const url = toText(imageMeta?.url);
    if (!url) {
      imgEl.classList.add('d-none');
      imgEl.removeAttribute('src');
      return;
    }
    imgEl.src = url;
    imgEl.classList.remove('d-none');
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const summarizeCounts = (counts) => {
    if (!counts || typeof counts !== 'object') return '';
    const pairs = Object.entries(counts)
      .filter(([, value]) => typeof value === 'number' || (typeof value === 'string' && value.trim()))
      .slice(0, 8);
    if (!pairs.length) return '';
    return pairs.map(([key, value]) => `${key}: ${value}`).join(' | ');
  };

  const parseJsonResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      },
      ...options
    });
    return parseJsonResponse(response);
  };

  const trackPendingSave = (promise) => {
    pendingSaves.add(promise);
    promise.finally(() => {
      pendingSaves.delete(promise);
    });
    return promise;
  };

  const flushPendingSaves = async () => {
    if (!pendingSaves.size) return;
    const results = await Promise.allSettled(Array.from(pendingSaves));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw (rejected.reason instanceof Error
        ? rejected.reason
        : new Error('One or more draft saves failed'));
    }
  };

  const setPublishSummary = (snapshot, statusEl, atEl) => {
    if (statusEl) {
      const rawStatus = toText(snapshot?.status);
      statusEl.textContent = rawStatus ? rawStatus.toUpperCase() : '-';
    }
    if (atEl) {
      atEl.textContent = formatDate(snapshot?.publishedAt);
    }
  };

  const refreshOutOfDateCommunitiesCount = () => {
    const count = Array.isArray(state.communities)
      ? state.communities.reduce((sum, entry) => {
        const hasCompetitionProfile = entry?.hasCompetitionProfile !== false;
        const needsSync = Boolean(entry?.outOfDate) || !entry?.draftSyncedAt;
        return hasCompetitionProfile && needsSync ? sum + 1 : sum;
      }, 0)
      : 0;
    state.outOfDateCommunitiesCount = count;
    if (els.bulkSyncCount) {
      els.bulkSyncCount.textContent = String(count);
    }
    if (els.bulkSyncBtn) {
      const isLoading = els.bulkSyncBtn.dataset.loading === 'true';
      els.bulkSyncBtn.disabled = isLoading || count === 0;
    }
  };

  const refreshPublishCard = () => {
    setPublishSummary(
      state.latestPackageSnapshot || state.latestSnapshot,
      els.packagePublishVersion,
      els.packagePublishAt
    );
    setPublishSummary(
      state.latestInventorySnapshot,
      els.inventoryPublishVersion,
      els.inventoryPublishAt
    );
    if (els.previewLink) {
      const slug = toText(state.profileDraft?.builderSlug);
      if (!slug) {
        els.previewLink.href = '#';
        els.previewLink.classList.add('disabled');
      } else {
        els.previewLink.href = `/public/brz/builders/${encodeURIComponent(slug)}`;
        els.previewLink.classList.remove('disabled');
      }
    }
  };

  const renderInventoryWarnings = (warnings) => {
    if (!els.inventoryWarnings) return;
    const items = (Array.isArray(warnings) ? warnings : [])
      .map((warning) => toText(warning))
      .filter(Boolean)
      .slice(0, 10);
    if (!items.length) {
      els.inventoryWarnings.innerHTML = '';
      els.inventoryWarnings.classList.add('d-none');
      return;
    }
    const listHtml = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    els.inventoryWarnings.innerHTML = `<div class="fw-semibold mb-1">Warnings</div><ul class="mb-0 ps-3">${listHtml}</ul>`;
    els.inventoryWarnings.classList.remove('d-none');
  };

  const summarizePublishReadiness = () => {
    const profile = state.profileDraft || {};
    const builderMissing = [];
    if (!toText(profile.builderSlug)) builderMissing.push('builder slug');
    if (!toText(profile.shortDescription)) builderMissing.push('short description');
    if (!toText(profile.longDescription)) builderMissing.push('long description');
    if (!toText(profile.heroImage?.url || profile.heroImage)) builderMissing.push('hero image');

    const includedCommunities = (Array.isArray(state.communities) ? state.communities : [])
      .filter((entry) => entry?.draft?.isIncluded !== false);
    const communityIssueCount = includedCommunities.reduce((total, entry) => {
      const flags = getCommunityFlags(entry);
      const requiredGaps = [
        flags.missingContactName,
        flags.missingPhone,
        flags.missingHeroImage,
        flags.missingModelListing
      ].filter(Boolean).length;
      const pricingGap = hasMissingCommunityPrice(entry) ? 1 : 0;
      return total + requiredGaps + pricingGap;
    }, 0);

    const includedFloorPlans = (Array.isArray(state.floorPlans) ? state.floorPlans : [])
      .filter((entry) => entry?.draft?.isIncluded !== false);
    const floorPlanIssueCount = includedFloorPlans.reduce((total, entry) => {
      const draft = entry?.draft || {};
      let issues = 0;
      if (toNumberOrNull(draft.basePriceFrom) == null) issues += 1;
      if (!toText(draft.primaryImage?.url || draft.primaryImage)) issues += 1;
      return total + issues;
    }, 0);

    return {
      builderMissing,
      communityIssueCount,
      floorPlanIssueCount,
      includedCommunityCount: includedCommunities.length,
      includedFloorPlanCount: includedFloorPlans.length
    };
  };

  const setSummaryStatus = (statusEl, detailsEl, { isReady, readyLabel, blockedLabel, details }) => {
    if (!statusEl) return;
    statusEl.textContent = isReady ? readyLabel : blockedLabel;
    statusEl.classList.remove('text-success', 'text-danger', 'text-muted');
    statusEl.classList.add(isReady ? 'text-success' : 'text-danger');
    if (detailsEl) detailsEl.textContent = details;
  };

  const renderPublishSummaryChecklist = () => {
    const summary = summarizePublishReadiness();
    const builderReady = summary.builderMissing.length === 0;
    const communityReady = summary.includedCommunityCount > 0 && summary.communityIssueCount === 0;
    const floorPlanReady = summary.includedFloorPlanCount > 0 && summary.floorPlanIssueCount === 0;
    const totalIssues = summary.builderMissing.length + summary.communityIssueCount + summary.floorPlanIssueCount;

    setSummaryStatus(els.summaryBuilderStatus, els.summaryBuilderDetails, {
      isReady: builderReady,
      readyLabel: 'Ready',
      blockedLabel: 'Needs Info',
      details: builderReady
        ? 'Slug, descriptions, and hero image are set.'
        : `Missing: ${summary.builderMissing.join(', ')}.`
    });

    setSummaryStatus(els.summaryCommunityStatus, els.summaryCommunityDetails, {
      isReady: communityReady,
      readyLabel: 'Ready',
      blockedLabel: 'Needs Review',
      details: summary.includedCommunityCount
        ? `${summary.includedCommunityCount} included, ${summary.communityIssueCount} open requirement${summary.communityIssueCount === 1 ? '' : 's'}.`
        : 'No communities are currently included.'
    });

    setSummaryStatus(els.summaryFloorPlanStatus, els.summaryFloorPlanDetails, {
      isReady: floorPlanReady,
      readyLabel: 'Ready',
      blockedLabel: 'Needs Review',
      details: summary.includedFloorPlanCount
        ? `${summary.includedFloorPlanCount} included, ${summary.floorPlanIssueCount} open requirement${summary.floorPlanIssueCount === 1 ? '' : 's'}.`
        : 'No floor plans are currently included.'
    });

    if (els.summaryMissingSummary) {
      if (totalIssues === 0 && builderReady && communityReady && floorPlanReady) {
        els.summaryMissingSummary.textContent = 'Ready to publish. No missing requirements detected in the configured scope.';
      } else {
        els.summaryMissingSummary.textContent = `${totalIssues} outstanding requirement${totalIssues === 1 ? '' : 's'} across builder profile, communities, and floor plans.`;
      }
    }

    if (els.summaryPublishHint) {
      const allReady = builderReady && communityReady && floorPlanReady;
      els.summaryPublishHint.textContent = allReady ? 'Ready to publish' : 'Review required';
      els.summaryPublishHint.className = `badge ${allReady ? 'text-bg-success' : 'text-bg-warning'}`;
    }
  };

  const applyProfileToForm = () => {
    const profile = state.profileDraft || {};
    if (els.builderName) els.builderName.value = state.company?.name || '';
    if (els.builderSlug) els.builderSlug.value = profile.builderSlug || '';
    if (els.displayNameOverride) els.displayNameOverride.value = profile.displayNameOverride || '';
    if (els.shortDescription) els.shortDescription.value = profile.shortDescription || '';
    if (els.longDescription) els.longDescription.value = profile.longDescription || '';
    if (els.pricingDisclaimer) els.pricingDisclaimer.value = profile.pricingDisclaimer || '';
    if (els.ctaWebsite) els.ctaWebsite.value = profile.ctaLinks?.website || '';
    if (els.ctaSchedule) els.ctaSchedule.value = profile.ctaLinks?.schedule || '';
    if (els.ctaContact) els.ctaContact.value = profile.ctaLinks?.contact || '';
    updateImagePreview(els.heroPreview, profile.heroImage);
    refreshPublishCard();
    renderPublishSummaryChecklist();
  };

  const getCommunityFlags = (entry) => entry?.completeness?.flags || {};

  const getCommunityPlanOfferings = (entry) => (
    Array.isArray(entry?.planOfferings) ? entry.planOfferings : []
  );

  const hasMissingCommunityPrice = (entry) =>
    getCommunityPlanOfferings(entry).some((offering) => {
      const communityPlanDraft = offering?.communityPlanDraft || {};
      const included = communityPlanDraft.isIncluded !== false;
      if (!included) return false;
      return toNumberOrNull(offering?.basePriceFrom) == null;
    });

  const shouldShowCommunity = (entry) => {
    const draft = entry?.draft || {};
    const flags = getCommunityFlags(entry);
    if (state.communityFilter === 'included') return Boolean(draft.isIncluded);
    if (state.communityFilter === 'missing-required') return Boolean(flags.missingContactName || flags.missingPhone);
    if (state.communityFilter === 'missing-hero') return Boolean(flags.missingHeroImage);
    if (state.communityFilter === 'missing-model') return Boolean(flags.missingModelListing);
    if (state.communityFilter === 'missing-community-price') return hasMissingCommunityPrice(entry);
    return true;
  };

  const toCommunityFilterKey = (community) => {
    const id = toText(community?.id);
    if (id) return `id:${id}`;
    const name = toText(community?.name).toLowerCase();
    if (name) return `name:${name}`;
    return '';
  };

  const getFloorPlanCommunityItems = (entry) => {
    const floorPlan = entry?.floorPlan || {};
    const linkedCommunities = Array.isArray(floorPlan.linkedCommunities) ? floorPlan.linkedCommunities : [];
    if (linkedCommunities.length) {
      return linkedCommunities
        .map((community) => {
          const id = toText(community?.id);
          const name = toText(community?.name || id);
          const key = toCommunityFilterKey({ id, name });
          if (!name || !key) return null;
          return { id, name, key };
        })
        .filter(Boolean);
    }

    const fallbackId = toText(floorPlan.communityId || floorPlan.keepupCommunityId);
    const fallbackName = toText(
      floorPlan.communityName
      || floorPlan.community?.name
      || fallbackId
    );
    const key = toCommunityFilterKey({ id: fallbackId, name: fallbackName });
    if (!fallbackName || !key) return [];
    return [{ id: fallbackId, name: fallbackName, key }];
  };

  const refreshFloorPlanCommunityFilterOptions = () => {
    if (!els.floorPlanCommunityFilter) return;
    const optionsByKey = new Map();
    (Array.isArray(state.floorPlans) ? state.floorPlans : []).forEach((entry) => {
      getFloorPlanCommunityItems(entry).forEach((community) => {
        if (!community?.key || !community?.name) return;
        if (!optionsByKey.has(community.key)) {
          optionsByKey.set(community.key, community.name);
        }
      });
    });

    const sortedOptions = Array.from(optionsByKey.entries())
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
    const allowed = new Set(sortedOptions.map(([key]) => key));
    const selected = allowed.has(state.floorPlanCommunityFilter)
      ? state.floorPlanCommunityFilter
      : 'all';
    state.floorPlanCommunityFilter = selected;

    els.floorPlanCommunityFilter.innerHTML = [
      '<option value="all">All communities</option>',
      ...sortedOptions.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
    ].join('');
    els.floorPlanCommunityFilter.value = selected;
  };

  const getFloorPlanSpecsText = (floorPlan) => (
    [floorPlan?.beds, floorPlan?.baths, floorPlan?.sqft].every((value) => value != null)
      ? `${floorPlan.beds} bd ${floorPlan.baths} ba ${floorPlan.sqft} sqft`
      : ''
  );

  const shouldShowFloorPlan = (entry) => {
    const floorPlan = entry?.floorPlan || {};
    const draft = entry?.draft || {};
    const includeFilter = state.floorPlanIncludeFilter;
    if (includeFilter === 'included' && !draft.isIncluded) return false;
    if (includeFilter === 'excluded' && draft.isIncluded) return false;

    if (state.floorPlanCommunityFilter !== 'all') {
      const communityKeys = new Set(getFloorPlanCommunityItems(entry).map((community) => community.key));
      if (!communityKeys.has(state.floorPlanCommunityFilter)) {
        return false;
      }
    }

    const query = toText(state.floorPlanSearch).toLowerCase();
    if (query) {
      const searchableText = [
        toText(floorPlan.name),
        toText(floorPlan.planNumber),
        toText(floorPlan.communityName),
        getFloorPlanSpecsText(floorPlan),
        ...getFloorPlanCommunityItems(entry).map((community) => toText(community.name))
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchableText.includes(query)) {
        return false;
      }
    }

    return true;
  };

  const getCommunityMissingLabels = (flags) => {
    const labels = [];
    if (flags.missingHeroImage) labels.push('Hero');
    if (flags.missingContactName) labels.push('Contact');
    if (flags.missingPhone) labels.push('Phone');
    if (flags.missingHOA) labels.push('HOA');
    if (flags.missingSchools) labels.push('Schools');
    if (flags.missingModelListing) labels.push('Model');
    return labels;
  };

  const renderCommunityMissingSummary = (flags) => {
    const labels = getCommunityMissingLabels(flags);
    if (!labels.length) {
      return '<span class="brz-community-soft-chip is-ok">No missing items</span>';
    }
    const visible = labels.slice(0, 3);
    const remaining = labels.length - visible.length;
    const chips = visible
      .map((label) => `<span class="brz-community-soft-chip is-warn">${escapeHtml(label)}</span>`)
      .join('');
    const more = remaining > 0
      ? `<span class="brz-community-soft-chip is-neutral">+${remaining} more</span>`
      : '';
    return `<span class="text-muted">Missing:</span>${chips}${more}`;
  };

  const renderLinkedPlansSummary = (linkedPlans) => {
    const normalized = Array.isArray(linkedPlans)
      ? linkedPlans.map((name) => toText(name)).filter(Boolean)
      : [];
    if (!normalized.length) {
      return '<span class="text-muted">Plans: none linked</span>';
    }
    const visible = normalized.slice(0, 3);
    const remaining = normalized.length - visible.length;
    const chips = visible
      .map((name) => `<span class="brz-community-soft-chip is-neutral">${escapeHtml(name)}</span>`)
      .join('');
    const more = remaining > 0
      ? `<span class="brz-community-soft-chip is-neutral">+${remaining} more</span>`
      : '';
    return `<span class="text-muted">Plans:</span>${chips}${more}`;
  };

  const renderSyncBadge = ({ outOfDate, draftSyncedAt }) => {
    if (!draftSyncedAt) return '<span class="badge badge-never-synced">Never synced</span>';
    if (outOfDate) return '<span class="badge badge-out-of-date">Out of date</span>';
    return '<span class="badge badge-up-to-date">Up to date</span>';
  };

  const renderCommunityPlanOfferingsTable = (entry) => {
    const offerings = getCommunityPlanOfferings(entry);
    const includedCount = offerings.filter((offering) => offering?.communityPlanDraft?.isIncluded !== false).length;
    const pricedCount = offerings.filter((offering) => toNumberOrNull(offering?.communityPlanDraft?.basePriceFrom) != null).length;
    const hiddenCount = offerings.filter((offering) => toText(offering?.communityPlanDraft?.basePriceVisibility || 'public').toLowerCase() === 'hidden').length;
    if (!offerings.length) {
      return `
        <section class="brz-editor-section brz-editor-section--plan-pricing mt-3">
          <div class="brz-editor-section-heading-wrap">
            <h3 class="h6 mb-0">Plans &amp; Pricing</h3>
          </div>
          <div class="small text-muted">No offered floor plans found for this community.</div>
        </section>
      `;
    }

    const rows = offerings
      .map((offering) => {
        const floorPlan = offering?.floorPlan || {};
        const planDraft = offering?.planDraft || {};
        const communityPlanDraft = offering?.communityPlanDraft || {};
        const floorPlanId = toText(floorPlan.id || floorPlan.floorPlanId);
        if (!floorPlanId) return '';

        const specs = [floorPlan.beds, floorPlan.baths, floorPlan.sqft].every((value) => value != null)
          ? `${floorPlan.beds} bd | ${floorPlan.baths} ba | ${floorPlan.sqft} sqft`
          : '';
        const visibility = toText(communityPlanDraft.basePriceVisibility || 'public').toLowerCase() === 'hidden'
          ? 'hidden'
          : 'public';
        const communityPricePreview = formatCurrency(communityPlanDraft.basePriceFrom);
        const fallbackPricePreview = formatCurrency(planDraft.basePriceFrom);
        const resolvedPricePreview = formatCurrency(offering?.basePriceFrom);
        const asOfDate = offering?.basePriceAsOf || communityPlanDraft.basePriceAsOf;
        const asOf = asOfDate ? `As of ${formatDate(asOfDate)}` : '';

        return `
          <tr data-community-floorplan-id="${escapeHtml(floorPlanId)}">
            <td>
              <div class="fw-semibold brz-community-plan-name">${escapeHtml(floorPlan.name || 'Floor Plan')}</div>
              <div class="small text-muted brz-community-plan-meta-row">
                ${floorPlan.planNumber ? `<span class="brz-community-plan-meta-chip">Plan ${escapeHtml(floorPlan.planNumber)}</span>` : ''}
                ${specs ? `<span class="brz-community-plan-meta-chip">${escapeHtml(specs)}</span>` : ''}
              </div>
            </td>
            <td>
              <input class="form-check-input brz-community-plan-include" type="checkbox" ${communityPlanDraft.isIncluded !== false ? 'checked' : ''} />
            </td>
            <td>
              <input class="form-control form-control-sm brz-community-plan-baseprice" type="number" min="0" step="1" placeholder="e.g., 399900" value="${communityPlanDraft.basePriceFrom == null ? '' : escapeHtml(communityPlanDraft.basePriceFrom)}" />
              <div class="small text-muted brz-community-plan-preview">${escapeHtml(communityPricePreview || '')}</div>
              <div class="small text-muted brz-community-plan-fallback">${fallbackPricePreview ? `Fallback: ${escapeHtml(fallbackPricePreview)} (default)` : 'Fallback: none'}</div>
              <div class="small text-muted brz-community-plan-publishing">Publishing: ${escapeHtml(resolvedPricePreview || '-')}</div>
              <div class="small text-muted brz-community-plan-asof">${escapeHtml(asOf)}</div>
            </td>
            <td>
              <select class="form-select form-select-sm brz-community-plan-visibility">
                <option value="public" ${visibility === 'public' ? 'selected' : ''}>Public</option>
                <option value="hidden" ${visibility === 'hidden' ? 'selected' : ''}>Hidden</option>
              </select>
            </td>
            <td>
              <textarea class="form-control form-control-sm brz-community-plan-description" rows="1">${escapeHtml(communityPlanDraft.descriptionOverride || '')}</textarea>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary brz-community-plan-save">Save</button>
                <small class="brz-row-status brz-status-muted brz-community-plan-status"></small>
              </div>
            </td>
          </tr>
        `;
      })
      .filter(Boolean)
      .join('');

    return `
      <section class="brz-editor-section brz-editor-section--plan-pricing mt-3">
        <div class="brz-editor-section-heading-wrap">
          <h3 class="h6 mb-0">Plans &amp; Pricing</h3>
          <p class="small text-muted mb-0">${includedCount}/${offerings.length} included | ${pricedCount} priced | ${hiddenCount} hidden</p>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle brz-community-plan-table brz-community-plan-table--compact">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Include</th>
                <th>Community Price</th>
                <th>Visibility</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  };

  const renderCommunityLotOpsInlineMetrics = (entry) => {
    const lots = Array.isArray(entry?.inventoryLots) ? entry.inventoryLots : [];
    const communityId = toText(entry?.community?.id);
    const toDateMs = (value) => {
      if (!value) return 0;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const inferNeedsSync = (lot) => {
      const isPublished = Boolean(lot?.isPublished);
      if (!isPublished) return false;
      const status = toText(lot?.lastPublishStatus).toLowerCase();
      if (status === 'error') return true;
      const syncMs = toDateMs(lot?.syncDate);
      if (!syncMs) return true;
      const updatedMs = toDateMs(lot?.updatedAt);
      return Boolean(updatedMs && updatedMs > syncMs);
    };
    const isQmiOrSpec = (lot) => {
      const status = toText(lot?.status).toLowerCase();
      return status.includes('spec') || status.includes('qmi');
    };
    const needsUpdate = (lot) => {
      const hasPrice = toNumberOrNull(lot?.salesPrice ?? lot?.listPrice) != null;
      const hasLocation = !Boolean(lot?.missingLocation);
      const hasFloorPlan = Boolean(toText(lot?.floorPlanId || lot?.floorPlanName));
      return !hasPrice || !hasLocation || !hasFloorPlan;
    };

    const publishedCount = lots.filter((lot) => Boolean(lot?.isPublished)).length;
    const qmiSpecCount = lots.filter(isQmiOrSpec).length;
    const notPublishedCount = Math.max(lots.length - publishedCount, 0);
    const needsSyncCount = lots.filter(inferNeedsSync).length;
    const needsUpdatesCount = lots.filter(needsUpdate).length;
    const lotOpsHref = communityId
      ? `/admin/brz/lot-operations?communityId=${encodeURIComponent(communityId)}`
      : '/admin/brz/lot-operations';

    const renderMetric = (label, value, tone = 'is-muted') => `
      <span class="brz-community-metric-pill ${tone}">
        <span class="brz-community-metric-label">${escapeHtml(label)}</span>
        <span class="brz-community-metric-value">${escapeHtml(String(value))}</span>
      </span>
    `;
    const metricTokens = [
      renderMetric('Lots', lots.length, 'is-muted'),
      renderMetric('QMI', qmiSpecCount, 'is-muted'),
      renderMetric('Published', publishedCount, 'is-muted'),
      renderMetric('Needs Updates', needsUpdatesCount, needsUpdatesCount > 0 ? 'is-warn' : 'is-ok'),
      renderMetric('Needs Sync', needsSyncCount, needsSyncCount > 0 ? 'is-alert' : 'is-ok'),
      notPublishedCount > 0 ? renderMetric('Not Published', notPublishedCount, 'is-quiet') : ''
    ].filter(Boolean).join('');

    return `
      <div class="brz-community-lotops-zone">
        <div class="brz-community-lotops-metrics" role="group" aria-label="Lot operations metrics">
          ${metricTokens}
        </div>
        <a class="brz-community-lotops-link" href="${escapeHtml(lotOpsHref)}">Open Lot Operations</a>
      </div>
    `;
  };

  const renderCommunities = () => {
    refreshOutOfDateCommunitiesCount();
    if (!els.communitiesBody) return;
    if (!Array.isArray(state.communities) || !state.communities.length) {
      els.communitiesBody.innerHTML = '<div class="brz-community-empty text-muted">No linked communities found.</div>';
      return;
    }

    const filtered = state.communities.filter(shouldShowCommunity);
    if (!filtered.length) {
      els.communitiesBody.innerHTML = '<div class="brz-community-empty text-muted">No communities match this filter.</div>';
      return;
    }

    els.communitiesBody.innerHTML = filtered
      .map((entry) => {
        const community = entry.community || {};
        const draft = entry.draft || {};
        const webData = entry.webData || entry.competitionProfileWebData || draft.competitionWebData || {};
        const modelListings = Array.isArray(entry.modelListings) ? entry.modelListings : [];
        const flags = getCommunityFlags(entry);
        const completenessScore = Math.max(0, Math.min(100, Number(entry?.completeness?.score ?? 0)));
        const linkedPlans = getCommunityPlanOfferings(entry)
          .map((offering) => toText(offering?.floorPlan?.name || offering?.floorPlan?.planNumber))
          .filter(Boolean);
        const linkedPlansSummary = renderLinkedPlansSummary(linkedPlans);
        const missingSummary = renderCommunityMissingSummary(flags);
        const resolvedCity = toText(webData.city) || toText(community.city);
        const resolvedState = toText(webData.state) || toText(community.state);
        const resolvedPostalCode = toText(webData.postalCode);
        const resolvedStatePostal = [resolvedState, resolvedPostalCode].filter(Boolean).join(' ');
        const resolvedLocation = [resolvedCity, resolvedStatePostal].filter(Boolean).join(', ') || '-';
        const feeSummaryHtml = renderCommunityFeeSummary(webData);
        const plansAndPricingHtml = renderCommunityPlanOfferingsTable(entry);
        const lotOpsMetricsHtml = renderCommunityLotOpsInlineMetrics(entry);
        const draftSyncedAt = entry?.draftSyncedAt || draft?.draftSyncedAt || null;
        const webDataUpdatedAt = entry?.webDataUpdatedAt || null;
        const outOfDate = Boolean(entry?.outOfDate);
        const hasCompetitionProfile = entry?.hasCompetitionProfile !== false;
        const syncBadge = renderSyncBadge({ outOfDate, draftSyncedAt });
        const syncDisabled = hasCompetitionProfile ? '' : 'disabled';
        const syncTitle = hasCompetitionProfile ? 'Sync canonical competition web data into BRZ draft' : 'No competition profile found';
        const competitionLink = `/my-community-competition?communityId=${encodeURIComponent(entry.keepupCommunityId || community.id || '')}`;
        const readinessToneClass = completenessScore >= 90
          ? 'is-ready'
          : (completenessScore >= 70 ? 'is-warning' : 'is-risk');

        return `
          <article class="brz-community-item" data-community-id="${escapeHtml(community.id)}">
            <div class="brz-community-item-summary">
              <div class="brz-community-header-bar">
                <div class="brz-community-zone brz-community-zone--identity">
                  <div class="brz-community-main">
                    <label class="brz-community-include-wrap" title="Include community in publishing">
                      <input class="form-check-input brz-community-include" type="checkbox" ${draft.isIncluded ? 'checked' : ''} />
                    </label>
                    <div class="brz-community-title-wrap">
                      <div class="fw-semibold brz-community-name">${escapeHtml(community.name || 'Community')}</div>
                      <div class="small text-muted">${escapeHtml(resolvedLocation)}</div>
                    </div>
                  </div>
                </div>
                <div class="brz-community-zone brz-community-zone--lotops">
                  ${lotOpsMetricsHtml}
                </div>
                <div class="brz-community-zone brz-community-zone--controls">
                  <div class="brz-community-readiness" title="Community readiness">
                    <span class="brz-community-readiness-pill ${readinessToneClass}">${escapeHtml(`${completenessScore}% ready`)}</span>
                    <div class="progress brz-community-readiness-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(String(completenessScore))}">
                      <div class="progress-bar ${readinessToneClass}" style="width: ${escapeHtml(String(completenessScore))}%"></div>
                    </div>
                  </div>
                  <div class="brz-community-actions">
                    <button type="button" class="btn btn-sm btn-primary brz-community-toggle-details" aria-expanded="false">
                      Edit Community <span class="brz-community-toggle-chevron" aria-hidden="true">v</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary brz-community-save-draft">Save Draft</button>
                    <button type="button" class="btn btn-sm btn-outline-warning brz-community-sync-from-competition" ${syncDisabled} title="${escapeHtml(syncTitle)}">Sync</button>
                    <details class="brz-community-overflow">
                      <summary class="btn btn-sm btn-outline-secondary brz-community-overflow-toggle">More</summary>
                      <div class="brz-community-overflow-menu">
                        <button type="button" class="btn btn-sm btn-outline-dark brz-community-apply-location">Apply Location to Missing Listings</button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
              <div class="brz-community-header-secondary">
                <div class="brz-community-secondary-context">
                  <div class="small text-muted brz-community-sync-line">
                    ${syncBadge}
                    <span>Competition updated ${escapeHtml(formatDate(webDataUpdatedAt))}</span>
                    <span class="brz-community-meta-separator">|</span>
                    <span>Draft synced ${escapeHtml(formatDate(draftSyncedAt))}</span>
                  </div>
                  <div class="small brz-community-support-line">
                    <div class="brz-community-missing">${missingSummary}</div>
                    <div class="brz-community-linked">${linkedPlansSummary}</div>
                  </div>
                </div>
                <div class="small text-muted brz-community-status-line">
                  <small class="brz-row-status brz-status-muted brz-draft-status"></small>
                  <small class="brz-row-status brz-status-muted brz-community-sync-status"></small>
                  <small class="brz-row-status brz-status-muted brz-community-location-status"></small>
                </div>
              </div>
            </div>
            <section class="brz-community-details-row d-none" data-community-details-id="${escapeHtml(community.id)}">
              <div class="brz-community-web-card">
                <div class="mb-3">
                  <label class="form-label mb-1">Description Override</label>
                  <textarea class="form-control form-control-sm brz-community-description" rows="2">${escapeHtml(draft.descriptionOverride || '')}</textarea>
                </div>
                <div class="row g-2">
                  <div class="col-12 brz-editor-subsection">
                    <h4 class="h6 mb-0">Public Contact</h4>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">Primary Contact Name</label>
                    <input type="text" class="form-control form-control-sm brz-web-contact-name" value="${escapeHtml(webData.primaryContact?.name || '')}" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">Primary Contact Phone</label>
                    <input type="text" class="form-control form-control-sm brz-web-contact-phone" value="${escapeHtml(webData.primaryContact?.phone || '')}" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">Primary Contact Email</label>
                    <input type="email" class="form-control form-control-sm brz-web-contact-email" value="${escapeHtml(webData.primaryContact?.email || '')}" />
                  </div>
                  <div class="col-12 d-flex flex-wrap gap-3">
                    <label><input type="checkbox" class="form-check-input brz-web-show-name" ${webData.contactVisibility?.showName ? 'checked' : ''}> Show Name</label>
                    <label><input type="checkbox" class="form-check-input brz-web-show-phone" ${webData.contactVisibility?.showPhone ? 'checked' : ''}> Show Phone</label>
                    <label><input type="checkbox" class="form-check-input brz-web-show-email" ${webData.contactVisibility?.showEmail ? 'checked' : ''}> Show Email (default off)</label>
                  </div>
                  <div class="col-md-12">
                    <label class="form-label mb-1">Model Addresses (from Listing status = Model)</label>
                    <div class="brz-model-listing-block">
                      ${modelListings.length
                        ? modelListings.map((model) => `<div class="small border rounded px-2 py-1 mb-1"><strong>${escapeHtml(model.address || 'Model Listing')}</strong>${model.floorPlanName ? ` <span class="text-muted">| Plan ${escapeHtml(model.floorPlanName)}</span>` : ''}</div>`).join('')
                        : '<span class="text-muted small">No model-status listings found in this community.</span>'}
                    </div>
                  </div>
                  <div class="col-12 brz-editor-subsection">
                    <h4 class="h6 mb-0">Location &amp; Community Basics</h4>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">City</label>
                    <div class="form-control form-control-sm bg-light">${escapeHtml(resolvedCity || '-')}</div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">State</label>
                    <div class="form-control form-control-sm bg-light">${escapeHtml(resolvedState || '-')}</div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-1">ZIP</label>
                    <div class="form-control form-control-sm bg-light">${escapeHtml(resolvedPostalCode || '-')}</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Total Lots</label>
                    <input type="number" class="form-control form-control-sm brz-web-total-lots" value="${webData.totalLots == null ? '' : escapeHtml(webData.totalLots)}" />
                  </div>
                  <div class="col-md-9">
                    <label class="form-label mb-1">Product / Lot Width</label>
                    <div class="d-flex flex-wrap">${renderClassificationChips(webData.productTypes, webData.lotSizes)}</div>
                  </div>
                  <div class="col-12 brz-editor-subsection">
                    <h4 class="h6 mb-0">Schools</h4>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">School: Elementary</label>
                    <input type="text" class="form-control form-control-sm brz-web-school-elementary" value="${escapeHtml(webData.schools?.elementary || '')}" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">School: Middle</label>
                    <input type="text" class="form-control form-control-sm brz-web-school-middle" value="${escapeHtml(webData.schools?.middle || '')}" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">School: High</label>
                    <input type="text" class="form-control form-control-sm brz-web-school-high" value="${escapeHtml(webData.schools?.high || '')}" />
                  </div>
                  <div class="col-12 brz-editor-subsection">
                    <h4 class="h6 mb-0">Fees &amp; Financial Details</h4>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">HOA Amount</label>
                    <input type="number" class="form-control form-control-sm brz-web-hoa-amount" value="${webData.hoa?.amount == null ? '' : escapeHtml(webData.hoa.amount)}" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">HOA Cadence</label>
                    <select class="form-select form-select-sm brz-web-hoa-cadence">
                      <option value="monthly" ${(webData.hoa?.cadence === 'monthly') ? 'selected' : ''}>Monthly</option>
                      <option value="annual" ${(webData.hoa?.cadence === 'annual') ? 'selected' : ''}>Annual</option>
                      <option value="unknown" ${(webData.hoa?.cadence || 'unknown') === 'unknown' ? 'selected' : ''}>Unknown</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Tax Rate (%)</label>
                    <input type="text" class="form-control form-control-sm brz-web-tax-rate" placeholder="e.g. 2.15" value="${escapeHtml(formatTaxRateInputValue(entry, webData))}" />
                  </div>
                  <div class="col-md-3 d-flex align-items-end gap-3">
                    <label><input type="checkbox" class="form-check-input brz-web-has-pid" ${webData.hasPID ? 'checked' : ''}> Has PID</label>
                    <label><input type="checkbox" class="form-check-input brz-web-has-mud" ${webData.hasMUD ? 'checked' : ''}> Has MUD</label>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label mb-1">Fees &amp; Districts</label>
                    <div class="form-control form-control-sm bg-light">${feeSummaryHtml}</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Earnest Amount</label>
                    <input type="number" class="form-control form-control-sm brz-web-earnest-amount" value="${webData.earnestMoney?.amount == null ? '' : escapeHtml(webData.earnestMoney.amount)}" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Earnest Visibility</label>
                    <select class="form-select form-select-sm brz-web-earnest-visibility">
                      <option value="hidden" ${(webData.earnestMoney?.visibility || 'hidden') === 'hidden' ? 'selected' : ''}>Hidden</option>
                      <option value="public" ${(webData.earnestMoney?.visibility || 'hidden') === 'public' ? 'selected' : ''}>Public</option>
                      <option value="gated" ${(webData.earnestMoney?.visibility || 'hidden') === 'gated' ? 'selected' : ''}>Gated</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Realtor Commission Amount</label>
                    <input type="number" class="form-control form-control-sm brz-web-commission-amount" value="${webData.realtorCommission?.amount == null ? '' : escapeHtml(webData.realtorCommission.amount)}" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Commission Unit</label>
                    <select class="form-select form-select-sm brz-web-commission-unit">
                      <option value="percent" ${(webData.realtorCommission?.unit || 'unknown') === 'percent' ? 'selected' : ''}>Percent</option>
                      <option value="flat" ${(webData.realtorCommission?.unit || 'unknown') === 'flat' ? 'selected' : ''}>Flat</option>
                      <option value="unknown" ${(webData.realtorCommission?.unit || 'unknown') === 'unknown' ? 'selected' : ''}>Unknown</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-1">Commission Visibility</label>
                    <select class="form-select form-select-sm brz-web-commission-visibility">
                      <option value="hidden" ${(webData.realtorCommission?.visibility || 'hidden') === 'hidden' ? 'selected' : ''}>Hidden</option>
                      <option value="public" ${(webData.realtorCommission?.visibility || 'hidden') === 'public' ? 'selected' : ''}>Public</option>
                      <option value="gated" ${(webData.realtorCommission?.visibility || 'hidden') === 'gated' ? 'selected' : ''}>Gated</option>
                    </select>
                  </div>
                  <div class="col-12 brz-editor-subsection">
                    <h4 class="h6 mb-0">Marketing Content</h4>
                  </div>
                  <div class="col-12">
                    <label class="form-label mb-1">Community Promo</label>
                    <div class="border rounded p-2 bg-light">
                      ${renderPromoSummary(webData.promo)}
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                      <label class="form-label mb-0">Community Amenities</label>
                      <a class="btn btn-outline-secondary btn-sm" href="${escapeHtml(competitionLink)}">Open in My Community Competition</a>
                    </div>
                    <div class="d-flex flex-wrap">${renderAmenityChips(webData.amenities)}</div>
                  </div>
                  <div class="col-12">
                    <label class="form-label mb-1">Internal Notes (Never Published)</label>
                    <textarea class="form-control form-control-sm brz-web-notes-internal" rows="2">${escapeHtml(webData.notesInternal || '')}</textarea>
                  </div>
                  <div class="col-12 d-flex align-items-center gap-2 justify-content-end">
                    <small class="brz-row-status brz-status-muted brz-web-status"></small>
                    <button type="button" class="btn btn-sm btn-primary brz-community-save-web">Save Community Web Info</button>
                  </div>
                </div>
                ${plansAndPricingHtml}
              </div>
            </section>
          </article>
        `;
      })
      .join('');

    els.communitiesBody.querySelectorAll('[data-community-id]').forEach((row) => {
      const communityId = row.getAttribute('data-community-id');
      const selector = `[data-community-details-id="${communityId}"]`;
      const detailsRow = row.querySelector(selector);
      const draftStatusEl = row.querySelector('.brz-draft-status');
      const syncStatusEl = row.querySelector('.brz-community-sync-status');
      const locationStatusEl = row.querySelector('.brz-community-location-status');
      const saveDraftBtn = row.querySelector('.brz-community-save-draft');
      const syncFromCompetitionBtn = row.querySelector('.brz-community-sync-from-competition');
      const applyLocationBtn = row.querySelector('.brz-community-apply-location');
      const toggleDetailsBtn = row.querySelector('.brz-community-toggle-details');
      const includeEl = row.querySelector('.brz-community-include');
      const descriptionEl = detailsRow?.querySelector('.brz-community-description');

      if (toggleDetailsBtn && detailsRow) {
        const updateToggleButtonState = (expanded) => {
          toggleDetailsBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          toggleDetailsBtn.innerHTML = expanded
            ? 'Close Editor <span class="brz-community-toggle-chevron" aria-hidden="true">^</span>'
            : 'Edit Community <span class="brz-community-toggle-chevron" aria-hidden="true">v</span>';
        };
        updateToggleButtonState(false);
        toggleDetailsBtn.addEventListener('click', () => {
          const isExpanded = detailsRow.classList.toggle('d-none') === false;
          updateToggleButtonState(isExpanded);
        });
      }

      if (saveDraftBtn) {
        const persistCommunityDraft = async (source = 'button') => {
          saveDraftBtn.disabled = true;
          if (includeEl) includeEl.disabled = true;
          setStatus(draftStatusEl, source === 'toggle' ? 'Saving community include...' : 'Saving draft...', 'muted');
          try {
            const payload = {
              isIncluded: Boolean(includeEl?.checked),
              descriptionOverride: descriptionEl
                ? toText(descriptionEl.value)
                : toText(draft.descriptionOverride)
            };
            const data = await fetchJson(`/api/brz/publishing/community/${encodeURIComponent(communityId)}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            const idx = state.communities.findIndex((item) => item.community?.id === communityId);
            if (idx >= 0) {
              state.communities[idx] = {
                ...state.communities[idx],
                community: data.community || state.communities[idx].community,
                draft: data.draft || state.communities[idx].draft
              };
            }
            setStatus(draftStatusEl, source === 'toggle' ? 'Community include saved' : 'Draft saved', 'success');
            setStatus(els.publishStatus, source === 'toggle' ? 'Community include saved' : 'Community draft saved', 'success');
            renderCommunities();
            return data;
          } catch (err) {
            setStatus(draftStatusEl, err.message || 'Save failed', 'error');
            throw err;
          } finally {
            saveDraftBtn.disabled = false;
            if (includeEl) includeEl.disabled = false;
          }
        };

        saveDraftBtn.addEventListener('click', async () => {
          try {
            await trackPendingSave(persistCommunityDraft('button'));
          } catch (_) {
            // status already set in persistCommunityDraft
          }
        });

        if (includeEl) {
          includeEl.addEventListener('change', () => {
            trackPendingSave(persistCommunityDraft('toggle')).catch(() => {});
          });
        }
      }

      if (syncFromCompetitionBtn && !syncFromCompetitionBtn.disabled) {
        syncFromCompetitionBtn.addEventListener('click', async () => {
          syncFromCompetitionBtn.disabled = true;
          setStatus(syncStatusEl, 'Syncing from competition...', 'muted');
          try {
            const data = await fetchJson(
              `/api/brz/publishing/community/${encodeURIComponent(communityId)}/sync-from-competition`,
              { method: 'POST' }
            );
            const idx = state.communities.findIndex((item) => item.community?.id === communityId);
            if (idx >= 0) {
              state.communities[idx] = {
                ...state.communities[idx],
                draft: data.draft || state.communities[idx].draft,
                webDataUpdatedAt: data.webDataUpdatedAt || state.communities[idx].webDataUpdatedAt,
                draftSyncedAt: data.draftSyncedAt || state.communities[idx].draftSyncedAt,
                outOfDate: Boolean(data.outOfDate),
                hasCompetitionProfile: data.hasCompetitionProfile !== false
              };
            }
            setStatus(syncStatusEl, 'Synced', 'success');
            setStatus(els.publishStatus, 'Synced from competition', 'success');
            renderCommunities();
          } catch (err) {
            setStatus(syncStatusEl, err.message || 'Sync failed', 'error');
          } finally {
            syncFromCompetitionBtn.disabled = false;
          }
        });
      }

      if (applyLocationBtn) {
        applyLocationBtn.addEventListener('click', async () => {
          applyLocationBtn.disabled = true;
          setStatus(locationStatusEl, 'Applying community location...', 'muted');
          setStatus(els.publishStatus, 'Applying community location...', 'muted');
          try {
            const data = await fetchJson(
              `/api/brz/publishing/community/${encodeURIComponent(communityId)}/apply-location-to-listings`,
              { method: 'POST' }
            );
            const updatedCount = Number(data?.updatedCount || 0);
            const skippedCount = Number(data?.skippedCount || 0);
            const summary = `Applied location to ${updatedCount} listing(s); skipped ${skippedCount}`;
            await loadBootstrap();
            setStatus(locationStatusEl, summary, 'success');
            setStatus(els.publishStatus, summary, 'success');
          } catch (err) {
            setStatus(locationStatusEl, err.message || 'Apply failed', 'error');
            setStatus(els.publishStatus, err.message || 'Apply failed', 'error');
          } finally {
            applyLocationBtn.disabled = false;
          }
        });
      }

      if (!detailsRow) return;
      const saveWebBtn = detailsRow.querySelector('.brz-community-save-web');
      const webStatusEl = detailsRow.querySelector('.brz-web-status');
      if (!saveWebBtn) return;

      saveWebBtn.addEventListener('click', async () => {
        saveWebBtn.disabled = true;
        setStatus(webStatusEl, 'Saving community web info...', 'muted');
        try {
          const payload = {
            primaryContact: {
              name: toText(detailsRow.querySelector('.brz-web-contact-name')?.value),
              phone: toText(detailsRow.querySelector('.brz-web-contact-phone')?.value),
              email: toText(detailsRow.querySelector('.brz-web-contact-email')?.value)
            },
            contactVisibility: {
              showName: Boolean(detailsRow.querySelector('.brz-web-show-name')?.checked),
              showPhone: Boolean(detailsRow.querySelector('.brz-web-show-phone')?.checked),
              showEmail: Boolean(detailsRow.querySelector('.brz-web-show-email')?.checked)
            },
            totalLots: toNumberOrNull(detailsRow.querySelector('.brz-web-total-lots')?.value),
            schools: {
              elementary: toText(detailsRow.querySelector('.brz-web-school-elementary')?.value),
              middle: toText(detailsRow.querySelector('.brz-web-school-middle')?.value),
              high: toText(detailsRow.querySelector('.brz-web-school-high')?.value)
            },
            hoa: {
              amount: toNumberOrNull(detailsRow.querySelector('.brz-web-hoa-amount')?.value),
              cadence: toText(detailsRow.querySelector('.brz-web-hoa-cadence')?.value) || 'unknown'
            },
            taxRate: parseTaxRateInput(detailsRow.querySelector('.brz-web-tax-rate')?.value),
            hasPID: Boolean(detailsRow.querySelector('.brz-web-has-pid')?.checked),
            hasMUD: Boolean(detailsRow.querySelector('.brz-web-has-mud')?.checked),
            earnestMoney: {
              amount: toNumberOrNull(detailsRow.querySelector('.brz-web-earnest-amount')?.value),
              visibility: toText(detailsRow.querySelector('.brz-web-earnest-visibility')?.value) || 'hidden'
            },
            realtorCommission: {
              amount: toNumberOrNull(detailsRow.querySelector('.brz-web-commission-amount')?.value),
              unit: toText(detailsRow.querySelector('.brz-web-commission-unit')?.value) || 'unknown',
              visibility: toText(detailsRow.querySelector('.brz-web-commission-visibility')?.value) || 'hidden'
            },
            notesInternal: toText(detailsRow.querySelector('.brz-web-notes-internal')?.value)
          };

          const data = await fetchJson(`/api/brz/publishing/community/${encodeURIComponent(communityId)}/web`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });

          const idx = state.communities.findIndex((item) => item.community?.id === communityId);
          if (idx >= 0) {
            state.communities[idx] = {
              ...state.communities[idx],
              webData: data.webData || state.communities[idx].webData,
              competitionProfileTax: data.competitionProfileTax ?? state.communities[idx].competitionProfileTax,
              competitionLegacyTax: data.competitionLegacyTax ?? state.communities[idx].competitionLegacyTax,
              competitionProfileWebData: data.competitionProfileWebData || state.communities[idx].competitionProfileWebData,
              modelListings: Array.isArray(data.modelListings) ? data.modelListings : state.communities[idx].modelListings,
              completeness: data.completeness || state.communities[idx].completeness,
              listingOptions: Array.isArray(data.listingOptions) ? data.listingOptions : state.communities[idx].listingOptions,
              floorPlanOptions: Array.isArray(data.floorPlanOptions) ? data.floorPlanOptions : state.communities[idx].floorPlanOptions,
              planOfferings: Array.isArray(data.planOfferings) ? data.planOfferings : state.communities[idx].planOfferings,
              webDataUpdatedAt: data.webDataUpdatedAt || state.communities[idx].webDataUpdatedAt,
              draftSyncedAt: data.draftSyncedAt || state.communities[idx].draftSyncedAt,
              outOfDate: typeof data.outOfDate === 'boolean' ? data.outOfDate : state.communities[idx].outOfDate,
              hasCompetitionProfile: data.hasCompetitionProfile !== false
            };
          }

          setStatus(webStatusEl, 'Community web info saved', 'success');
          setStatus(els.publishStatus, 'Community web info saved', 'success');
          renderCommunities();
        } catch (err) {
          setStatus(webStatusEl, err.message || 'Save failed', 'error');
        } finally {
          saveWebBtn.disabled = false;
        }
      });

      detailsRow.querySelectorAll('tr[data-community-floorplan-id]').forEach((planRow) => {
        const floorPlanId = planRow.getAttribute('data-community-floorplan-id');
        const savePlanBtn = planRow.querySelector('.brz-community-plan-save');
        const includePlanEl = planRow.querySelector('.brz-community-plan-include');
        const basePricePlanEl = planRow.querySelector('.brz-community-plan-baseprice');
        const visibilityPlanEl = planRow.querySelector('.brz-community-plan-visibility');
        const descriptionPlanEl = planRow.querySelector('.brz-community-plan-description');
        const planStatusEl = planRow.querySelector('.brz-community-plan-status');
        const previewPlanEl = planRow.querySelector('.brz-community-plan-preview');
        const asOfPlanEl = planRow.querySelector('.brz-community-plan-asof');

        if (!floorPlanId || !savePlanBtn) return;

        if (basePricePlanEl && previewPlanEl) {
          const refreshCommunityPreview = () => {
            previewPlanEl.textContent = formatCurrency(basePricePlanEl.value);
          };
          basePricePlanEl.addEventListener('input', refreshCommunityPreview);
          refreshCommunityPreview();
        }

        const persistCommunityPlanDraft = async (source = 'button') => {
          savePlanBtn.disabled = true;
          if (includePlanEl) includePlanEl.disabled = true;
          setStatus(
            planStatusEl,
            source === 'toggle' ? 'Saving plan include...' : 'Saving plan pricing...',
            'muted'
          );
          try {
            const payload = {
              isIncluded: Boolean(includePlanEl?.checked),
              basePriceFrom: toNumberOrNull(basePricePlanEl?.value),
              basePriceVisibility: toText(visibilityPlanEl?.value || 'public'),
              descriptionOverride: toText(descriptionPlanEl?.value)
            };
            const data = await fetchJson(
              `/api/brz/publishing/community/${encodeURIComponent(communityId)}/floorplan/${encodeURIComponent(floorPlanId)}`,
              {
                method: 'PUT',
                body: JSON.stringify(payload)
              }
            );

            const communityIdx = state.communities.findIndex((item) => item.community?.id === communityId);
            if (communityIdx >= 0) {
              const offerings = Array.isArray(state.communities[communityIdx].planOfferings)
                ? state.communities[communityIdx].planOfferings.slice()
                : [];
              const offeringIdx = offerings.findIndex((item) => item.floorPlan?.id === floorPlanId);
              if (offeringIdx >= 0) {
                offerings[offeringIdx] = {
                  ...offerings[offeringIdx],
                  floorPlan: data.floorPlan || offerings[offeringIdx].floorPlan,
                  planDraft: data.planDraft || offerings[offeringIdx].planDraft,
                  communityPlanDraft: data.communityPlanDraft || offerings[offeringIdx].communityPlanDraft
                };
              } else {
                offerings.push({
                  floorPlan: data.floorPlan || {},
                  planDraft: data.planDraft || {},
                  communityPlanDraft: data.communityPlanDraft || {}
                });
              }
              state.communities[communityIdx] = {
                ...state.communities[communityIdx],
                planOfferings: offerings
              };
            }

            if (basePricePlanEl) {
              basePricePlanEl.value = data?.communityPlanDraft?.basePriceFrom ?? '';
            }
            if (visibilityPlanEl) {
              visibilityPlanEl.value = data?.communityPlanDraft?.basePriceVisibility || 'public';
            }
            if (previewPlanEl) {
              previewPlanEl.textContent = formatCurrency(data?.communityPlanDraft?.basePriceFrom);
            }
            if (asOfPlanEl) {
              asOfPlanEl.textContent = data?.communityPlanDraft?.basePriceAsOf
                ? `As of ${formatDate(data.communityPlanDraft.basePriceAsOf)}`
                : '';
            }
            setStatus(
              planStatusEl,
              source === 'toggle' ? 'Plan include saved' : 'Plan pricing saved',
              'success'
            );
            setStatus(
              els.publishStatus,
              source === 'toggle' ? 'Community plan include saved' : 'Community plan pricing saved',
              'success'
            );

            if (state.communityFilter === 'missing-community-price') {
              renderCommunities();
            }
            return data;
          } catch (err) {
            setStatus(planStatusEl, err.message || 'Save failed', 'error');
            throw err;
          } finally {
            savePlanBtn.disabled = false;
            if (includePlanEl) includePlanEl.disabled = false;
          }
        };

        savePlanBtn.addEventListener('click', async () => {
          try {
            await trackPendingSave(persistCommunityPlanDraft('button'));
          } catch (_) {
            // status already set in persistCommunityPlanDraft
          }
        });

        if (includePlanEl) {
          includePlanEl.addEventListener('change', () => {
            trackPendingSave(persistCommunityPlanDraft('toggle')).catch(() => {});
          });
        }
      });

    });

    renderPublishSummaryChecklist();
  };

  const renderFloorPlans = () => {
    if (!els.floorPlansBody) return;
    const allFloorPlans = Array.isArray(state.floorPlans) ? state.floorPlans : [];
    refreshFloorPlanCommunityFilterOptions();

    if (!allFloorPlans.length) {
      if (els.floorPlanFilterSummary) {
        els.floorPlanFilterSummary.textContent = 'No linked floor plans available.';
      }
      els.floorPlansBody.innerHTML = '<tr><td colspan="7" class="text-muted">No linked floor plans found.</td></tr>';
      return;
    }

    const filteredFloorPlans = allFloorPlans.filter(shouldShowFloorPlan);
    if (els.floorPlanFilterSummary) {
      els.floorPlanFilterSummary.textContent = `Showing ${filteredFloorPlans.length} of ${allFloorPlans.length} floor plans.`;
    }

    if (!filteredFloorPlans.length) {
      els.floorPlansBody.innerHTML = '<tr><td colspan="7" class="text-muted">No floor plans match the current filters.</td></tr>';
      return;
    }

    els.floorPlansBody.innerHTML = filteredFloorPlans
      .map((entry) => {
        const floorPlan = entry.floorPlan || {};
        const draft = entry.draft || {};
        const previewUrl = draft.primaryImage?.url || floorPlan.uploadedPreviewUrl || '';
        const basePricePreview = formatCurrency(draft.basePriceFrom);
        const basePriceAsOfText = draft.basePriceAsOf ? formatDate(draft.basePriceAsOf) : '';
        const basePriceVisibility = toText(draft.basePriceVisibility || 'public').toLowerCase() === 'hidden' ? 'hidden' : 'public';
        const specs = [floorPlan.beds, floorPlan.baths, floorPlan.sqft].every((value) => value != null)
          ? `${floorPlan.beds} bd | ${floorPlan.baths} ba | ${floorPlan.sqft} sqft`
          : '';
        const communityItems = getFloorPlanCommunityItems(entry);
        const communityLabel = communityItems.length
          ? communityItems.map((community) => community.name).join(', ')
          : '-';
        return `
          <tr data-floorplan-id="${escapeHtml(floorPlan.id)}">
            <td>
              <div class="fw-semibold">${escapeHtml(floorPlan.name || 'Floor Plan')}</div>
              <div class="small text-muted">${escapeHtml(floorPlan.planNumber || '')}</div>
              <div class="small text-muted">${escapeHtml(specs)}</div>
            </td>
            <td>${escapeHtml(communityLabel)}</td>
            <td>
              <input class="form-check-input brz-floorplan-include" type="checkbox" ${draft.isIncluded ? 'checked' : ''} />
            </td>
            <td>
              <textarea class="form-control form-control-sm brz-floorplan-description" rows="2">${escapeHtml(draft.descriptionOverride || '')}</textarea>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <input class="form-control form-control-sm brz-floorplan-baseprice" type="number" min="0" step="1" placeholder="e.g., 399900" value="${draft.basePriceFrom == null ? '' : escapeHtml(draft.basePriceFrom)}" />
                <select class="form-select form-select-sm brz-floorplan-baseprice-visibility">
                  <option value="public" ${basePriceVisibility === 'public' ? 'selected' : ''}>Public</option>
                  <option value="hidden" ${basePriceVisibility === 'hidden' ? 'selected' : ''}>Hidden</option>
                </select>
                <div class="small text-muted brz-floorplan-baseprice-preview">${escapeHtml(basePricePreview || '')}</div>
                <div class="small text-muted brz-floorplan-baseprice-asof">${basePriceAsOfText ? `As of ${escapeHtml(basePriceAsOfText)}` : ''}</div>
              </div>
            </td>
            <td>
              <div class="d-flex flex-column gap-2">
                <img class="brz-image-preview ${previewUrl ? '' : 'd-none'}" src="${escapeHtml(previewUrl)}" alt="Primary floor plan image" />
                <input class="form-control form-control-sm brz-floorplan-upload" type="file" accept="image/*" />
                <button type="button" class="btn btn-sm btn-outline-secondary brz-floorplan-upload-btn">Upload</button>
              </div>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary brz-floorplan-save">Save</button>
                <small class="brz-row-status brz-status-muted"></small>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    els.floorPlansBody.querySelectorAll('tr[data-floorplan-id]').forEach((row) => {
      const floorPlanId = row.getAttribute('data-floorplan-id');
      const saveBtn = row.querySelector('.brz-floorplan-save');
      const uploadBtn = row.querySelector('.brz-floorplan-upload-btn');
      const uploadInput = row.querySelector('.brz-floorplan-upload');
      const includeEl = row.querySelector('.brz-floorplan-include');
      const descriptionEl = row.querySelector('.brz-floorplan-description');
      const basePriceEl = row.querySelector('.brz-floorplan-baseprice');
      const basePriceVisibilityEl = row.querySelector('.brz-floorplan-baseprice-visibility');
      const basePricePreviewEl = row.querySelector('.brz-floorplan-baseprice-preview');
      const basePriceAsOfEl = row.querySelector('.brz-floorplan-baseprice-asof');
      const statusEl = row.querySelector('.brz-row-status');
      const imageEl = row.querySelector('.brz-image-preview');

      if (basePriceEl && basePricePreviewEl) {
        const refreshPreview = () => {
          basePricePreviewEl.textContent = formatCurrency(basePriceEl.value);
        };
        basePriceEl.addEventListener('input', refreshPreview);
        refreshPreview();
      }

      if (saveBtn) {
        const persistFloorPlanDraft = async (source = 'button') => {
          saveBtn.disabled = true;
          if (includeEl) includeEl.disabled = true;
          setStatus(statusEl, source === 'toggle' ? 'Saving include...' : 'Saving...', 'muted');
          try {
            const payload = {
              isIncluded: Boolean(includeEl?.checked),
              descriptionOverride: toText(descriptionEl?.value),
              basePriceFrom: toNumberOrNull(basePriceEl?.value),
              basePriceVisibility: toText(basePriceVisibilityEl?.value || 'public')
            };
            const data = await fetchJson(`/api/brz/publishing/floorplan/${encodeURIComponent(floorPlanId)}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            const idx = state.floorPlans.findIndex((item) => item.floorPlan?.id === floorPlanId);
            if (idx >= 0) {
              state.floorPlans[idx] = {
                floorPlan: data.floorPlan || state.floorPlans[idx].floorPlan,
                draft: data.draft || state.floorPlans[idx].draft
              };
              if (basePriceEl) {
                basePriceEl.value = state.floorPlans[idx].draft?.basePriceFrom ?? '';
              }
              if (basePriceVisibilityEl) {
                basePriceVisibilityEl.value = state.floorPlans[idx].draft?.basePriceVisibility || 'public';
              }
              if (basePricePreviewEl) {
                basePricePreviewEl.textContent = formatCurrency(state.floorPlans[idx].draft?.basePriceFrom);
              }
              if (basePriceAsOfEl) {
                const asOf = state.floorPlans[idx].draft?.basePriceAsOf;
                basePriceAsOfEl.textContent = asOf ? `As of ${formatDate(asOf)}` : '';
              }
            }
            setStatus(statusEl, source === 'toggle' ? 'Include saved' : 'Saved', 'success');
            setStatus(
              els.publishStatus,
              source === 'toggle' ? 'Floor plan include saved' : 'Floor plan draft saved',
              'success'
            );
            return data;
          } catch (err) {
            setStatus(statusEl, err.message || 'Save failed', 'error');
            throw err;
          } finally {
            saveBtn.disabled = false;
            if (includeEl) includeEl.disabled = false;
          }
        };

        saveBtn.addEventListener('click', async () => {
          try {
            await trackPendingSave(persistFloorPlanDraft('button'));
          } catch (_) {
            // status already set in persistFloorPlanDraft
          }
        });

        if (includeEl) {
          includeEl.addEventListener('change', () => {
            trackPendingSave(persistFloorPlanDraft('toggle')).catch(() => {});
          });
        }
      }

      if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
          const file = uploadInput?.files?.[0];
          if (!file) {
            setStatus(statusEl, 'Choose an image first', 'error');
            return;
          }
          uploadBtn.disabled = true;
          setStatus(statusEl, 'Uploading...', 'muted');
          try {
            const formData = new FormData();
            formData.append('file', file);
            const data = await fetchJson(
              `/api/brz/publishing/upload?type=floorplan&floorPlanId=${encodeURIComponent(floorPlanId)}`,
              { method: 'POST', body: formData }
            );
            const floorPlanPayload = data?.floorPlan || null;
            const idx = state.floorPlans.findIndex((item) => item.floorPlan?.id === floorPlanId);
            if (idx >= 0 && floorPlanPayload) state.floorPlans[idx] = floorPlanPayload;
            updateImagePreview(imageEl, data?.image || floorPlanPayload?.draft?.primaryImage);
            if (uploadInput) uploadInput.value = '';
            setStatus(statusEl, 'Uploaded', 'success');
          } catch (err) {
            setStatus(statusEl, err.message || 'Upload failed', 'error');
          } finally {
            uploadBtn.disabled = false;
          }
        });
      }
    });

    renderPublishSummaryChecklist();
  };

  const saveProfile = async () => {
    if (!els.profileSaveBtn) return;
    els.profileSaveBtn.disabled = true;
    setStatus(els.profileStatus, 'Saving...', 'muted');
    try {
      const payload = {
        builderSlug: toText(els.builderSlug?.value),
        displayNameOverride: toText(els.displayNameOverride?.value),
        shortDescription: toText(els.shortDescription?.value),
        longDescription: toText(els.longDescription?.value),
        pricingDisclaimer: toText(els.pricingDisclaimer?.value),
        ctaLinks: {
          website: toText(els.ctaWebsite?.value),
          schedule: toText(els.ctaSchedule?.value),
          contact: toText(els.ctaContact?.value)
        }
      };
      const data = await fetchJson('/api/brz/publishing/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.profileDraft = data.profileDraft || payload;
      applyProfileToForm();
      setStatus(els.profileStatus, 'Saved', 'success');
    } catch (err) {
      setStatus(els.profileStatus, err.message || 'Save failed', 'error');
    } finally {
      els.profileSaveBtn.disabled = false;
    }
  };

  const uploadHero = async () => {
    const file = els.heroUpload?.files?.[0];
    if (!file) {
      setStatus(els.profileStatus, 'Choose an image first', 'error');
      return;
    }
    if (els.heroUploadBtn) els.heroUploadBtn.disabled = true;
    setStatus(els.profileStatus, 'Uploading hero image...', 'muted');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await fetchJson('/api/brz/publishing/upload?type=hero', {
        method: 'POST',
        body: formData
      });
      if (data?.profileDraft) {
        state.profileDraft = data.profileDraft;
      } else {
        state.profileDraft = {
          ...(state.profileDraft || {}),
          heroImage: data?.image || null
        };
      }
      applyProfileToForm();
      if (els.heroUpload) els.heroUpload.value = '';
      setStatus(els.profileStatus, 'Hero image uploaded', 'success');
    } catch (err) {
      setStatus(els.profileStatus, err.message || 'Upload failed', 'error');
    } finally {
      if (els.heroUploadBtn) els.heroUploadBtn.disabled = false;
    }
  };

  const renderSnapshotSummary = (snapshot, fallbackMessage) => {
    const countsSummary = summarizeCounts(snapshot?.counts);
    const warnings = Array.isArray(snapshot?.warnings) ? snapshot.warnings : [];
    const warningSummary = warnings.length ? `Warnings: ${warnings.slice(0, 3).join(' | ')}` : '';
    return [
      toText(snapshot?.message) || fallbackMessage,
      countsSummary ? `Counts: ${countsSummary}.` : '',
      warningSummary
    ]
      .filter(Boolean)
      .join(' ');
  };

  const publishSnapshot = async (type) => {
    const isInventory = type === 'inventory';
    const buttonEl = isInventory ? els.publishInventoryBtn : els.publishPackageBtn;
    const statusEl = isInventory ? els.inventoryPublishStatus : els.packagePublishStatus;
    if (!buttonEl) return;

    buttonEl.disabled = true;
    setStatus(
      statusEl,
      isInventory ? 'Publishing inventory to BuildRootz...' : 'Publishing package to BuildRootz...',
      'muted'
    );
    setStatus(els.publishStatus, 'Publishing...', 'muted');
    try {
      if (pendingSaves.size) {
        setStatus(els.publishStatus, 'Waiting for pending draft saves...', 'muted');
        await flushPendingSaves();
      }
      const data = await fetchJson(
        isInventory ? '/api/brz/publishing/publish-inventory' : '/api/brz/publishing/publish-package',
        { method: 'POST' }
      );
      const snapshot = {
        status: toText(data.status || 'success'),
        publishedAt: data.publishedAt,
        message: data.message || '',
        counts: data.counts || null,
        warnings: Array.isArray(data.warnings) ? data.warnings : []
      };
      if (isInventory) {
        state.latestInventorySnapshot = snapshot;
        renderInventoryWarnings(snapshot.warnings);
      } else {
        state.latestPackageSnapshot = snapshot;
        state.latestSnapshot = snapshot;
      }
      refreshPublishCard();
      const summary = renderSnapshotSummary(
        snapshot,
        isInventory ? 'Inventory published.' : 'Package published.'
      );
      setStatus(statusEl, summary, 'success');
      setStatus(els.publishStatus, summary, 'success');
    } catch (err) {
      setStatus(statusEl, err.message || 'Publish failed', 'error');
      setStatus(els.publishStatus, err.message || 'Publish failed', 'error');
    } finally {
      buttonEl.disabled = false;
    }
  };

  const applyCommunitySyncResult = (result) => {
    const communityId = toText(result?.communityId);
    if (!communityId) return;
    const idx = state.communities.findIndex((entry) => entry.community?.id === communityId);
    if (idx < 0) return;

    const current = state.communities[idx];
    const next = { ...current };
    if (result?.webDataUpdatedAt) {
      next.webDataUpdatedAt = result.webDataUpdatedAt;
    }
    if (result?.draftSyncedAt) {
      next.draftSyncedAt = result.draftSyncedAt;
    }
    if (result?.status === 'synced') {
      next.outOfDate = false;
      next.hasCompetitionProfile = true;
    } else if (result?.message === 'NO_COMPETITION_PROFILE') {
      next.hasCompetitionProfile = false;
    } else if (result?.message === 'ALREADY_UP_TO_DATE') {
      next.outOfDate = false;
    }
    state.communities[idx] = next;
  };

  const bulkSyncFromCompetition = async () => {
    if (!els.bulkSyncBtn) return;

    els.bulkSyncBtn.dataset.loading = 'true';
    refreshOutOfDateCommunitiesCount();
    setStatus(els.bulkSyncStatus, 'Syncing out-of-date communities...', 'muted');
    setStatus(els.publishStatus, 'Syncing out-of-date communities...', 'muted');
    try {
      const data = await fetchJson('/api/brz/publishing/sync-from-competition/bulk', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const results = Array.isArray(data?.results) ? data.results : [];
      results.forEach((result) => applyCommunitySyncResult(result));
      renderCommunities();

      const syncedCount = Number(data?.syncedCount || 0);
      const failedCount = Number(data?.failedCount || 0);
      const skippedCount = Number(data?.skippedCount || 0);
      const summary = `Synced ${syncedCount}, failed ${failedCount}, skipped ${skippedCount}`;
      const failures = results
        .filter((result) => result?.status === 'failed')
        .slice(0, 5)
        .map((result) => {
          const name = toText(result?.communityName)
            || state.communities.find((entry) => entry.community?.id === result?.communityId)?.community?.name
            || toText(result?.communityId);
          return `${name}: ${toText(result?.message) || 'FAILED'}`;
        });
      const withFailureSummary = failures.length ? `${summary}. ${failures.join(' | ')}` : summary;
      setStatus(els.bulkSyncStatus, withFailureSummary, failedCount ? 'error' : 'success');
      setStatus(els.publishStatus, summary, failedCount ? 'error' : 'success');
    } catch (err) {
      setStatus(els.bulkSyncStatus, err.message || 'Bulk sync failed', 'error');
      setStatus(els.publishStatus, err.message || 'Bulk sync failed', 'error');
    } finally {
      delete els.bulkSyncBtn.dataset.loading;
      refreshOutOfDateCommunitiesCount();
    }
  };

  const hydrateFromBootstrap = (payload) => {
    const sectioned = payload?.sections || {};
    const builderProfile = payload?.builderProfile || sectioned.builderProfile || {};
    const communityPublishing = payload?.communityPublishing || sectioned.communityPublishing || {};
    const floorPlanCatalog = payload?.floorPlanCatalog || sectioned.floorPlanCatalog || {};
    const publishSummary = payload?.publishSummary || sectioned.publishSummary || {};

    state.company = builderProfile?.company || payload?.company || null;
    state.profileDraft = builderProfile?.profileDraft || payload?.profileDraft || {};
    state.communities = Array.isArray(communityPublishing?.communities)
      ? communityPublishing.communities
      : (Array.isArray(payload?.communities) ? payload.communities : []);
    state.floorPlans = Array.isArray(floorPlanCatalog?.floorPlans)
      ? floorPlanCatalog.floorPlans
      : (Array.isArray(payload?.floorPlans) ? payload.floorPlans : []);
    state.latestSnapshot = publishSummary?.latestSnapshot
      || payload?.latestSnapshot
      || payload?.latestPackageSnapshot
      || null;
    state.latestPackageSnapshot = publishSummary?.latestPackageSnapshot
      || payload?.latestPackageSnapshot
      || payload?.latestSnapshot
      || null;
    state.latestInventorySnapshot = publishSummary?.latestInventorySnapshot
      || payload?.latestInventorySnapshot
      || null;
    state.outOfDateCommunitiesCount = toNumberOr(
      communityPublishing?.outOfDateCommunitiesCount ?? payload?.outOfDateCommunitiesCount,
      0
    );

    applyProfileToForm();
    renderCommunities();
    renderFloorPlans();
    if (state.latestPackageSnapshot?.message) {
      const summary = renderSnapshotSummary(state.latestPackageSnapshot, 'Package publish history loaded.');
      setStatus(els.packagePublishStatus, summary, toText(state.latestPackageSnapshot.status) === 'error' ? 'error' : 'muted');
      setStatus(els.publishStatus, summary, toText(state.latestPackageSnapshot.status) === 'error' ? 'error' : 'muted');
    } else {
      setStatus(els.packagePublishStatus, '', 'muted');
    }
    if (state.latestInventorySnapshot?.message) {
      const summary = renderSnapshotSummary(state.latestInventorySnapshot, 'Inventory publish history loaded.');
      setStatus(
        els.inventoryPublishStatus,
        summary,
        toText(state.latestInventorySnapshot.status) === 'error' ? 'error' : 'muted'
      );
      renderInventoryWarnings(state.latestInventorySnapshot.warnings);
    } else {
      setStatus(els.inventoryPublishStatus, '', 'muted');
      renderInventoryWarnings([]);
    }
    if (!state.latestPackageSnapshot?.message && !state.latestInventorySnapshot?.message) {
      setStatus(
        els.publishStatus,
        '',
        'muted'
      );
    }
  };

  const readInitialBootstrapPayload = () => {
    const payloadEl = document.getElementById('brzPublishingBootstrap');
    if (!payloadEl) return null;
    try {
      const parsed = JSON.parse(payloadEl.textContent || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  };

  const loadBootstrap = async () => {
    const initialPayload = readInitialBootstrapPayload();
    if (initialPayload) {
      hydrateFromBootstrap(initialPayload);
      if (!state.latestPackageSnapshot?.message && !state.latestInventorySnapshot?.message) {
        setStatus(els.publishStatus, '', 'muted');
      }
      return;
    }

    setStatus(els.publishStatus, 'Loading publishing data...', 'muted');
    try {
      const payload = await fetchJson('/api/brz/publishing/bootstrap');
      hydrateFromBootstrap(payload);
      if (!state.latestPackageSnapshot?.message && !state.latestInventorySnapshot?.message) {
        setStatus(els.publishStatus, '', 'muted');
      }
    } catch (err) {
      setStatus(els.publishStatus, err.message || 'Failed to load publishing data', 'error');
      if (els.communitiesBody) {
        els.communitiesBody.innerHTML = '<div class="brz-community-empty text-danger">Failed to load communities.</div>';
      }
      if (els.floorPlansBody) {
        els.floorPlansBody.innerHTML = '<tr><td colspan="7" class="text-danger">Failed to load floor plans.</td></tr>';
      }
    }
  };

  if (els.profileForm) {
    els.profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProfile();
    });
  }

  if (els.heroUploadBtn) {
    els.heroUploadBtn.addEventListener('click', () => {
      uploadHero();
    });
  }

  if (els.publishPackageBtn) {
    els.publishPackageBtn.addEventListener('click', () => {
      publishSnapshot('package');
    });
  }

  if (els.publishInventoryBtn) {
    els.publishInventoryBtn.addEventListener('click', () => {
      publishSnapshot('inventory');
    });
  }

  if (els.bulkSyncBtn) {
    els.bulkSyncBtn.addEventListener('click', () => {
      bulkSyncFromCompetition();
    });
  }

  if (els.communityFilters?.length) {
    els.communityFilters.forEach((button) => {
      button.addEventListener('click', () => {
        const filter = toText(button.dataset.filter) || 'all';
        state.communityFilter = filter;
        els.communityFilters.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        renderCommunities();
      });
    });
  }

  if (els.floorPlanSearch) {
    els.floorPlanSearch.addEventListener('input', () => {
      state.floorPlanSearch = toText(els.floorPlanSearch.value);
      renderFloorPlans();
    });
  }

  if (els.floorPlanCommunityFilter) {
    els.floorPlanCommunityFilter.addEventListener('change', () => {
      state.floorPlanCommunityFilter = toText(els.floorPlanCommunityFilter.value || 'all') || 'all';
      renderFloorPlans();
    });
  }

  if (els.floorPlanIncludeFilter) {
    els.floorPlanIncludeFilter.addEventListener('change', () => {
      state.floorPlanIncludeFilter = toText(els.floorPlanIncludeFilter.value || 'all').toLowerCase() || 'all';
      renderFloorPlans();
    });
  }

  setupWorkflowTabs();
  refreshOutOfDateCommunitiesCount();
  loadBootstrap();
})();

