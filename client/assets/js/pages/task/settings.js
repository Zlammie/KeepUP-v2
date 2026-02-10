/* assets/js/task/settings.js
 * Controls the task settings page: builder interactions + API calls.
 */

(function taskSettingsController() {
  const DATA_NODE_ID = 'task-settings-data';
  const DEFAULT_ENDPOINTS = {
    schedules: '/api/task-schedules',
    assignments: '/api/task-schedules/assignments'
  };
  const DEFAULT_EMAIL_ENDPOINTS = {
    templates: '/api/email/templates',
    rules: '/api/email/rules',
    queue: '/api/email/queue',
    settings: '/api/email/settings',
    audiencePreview: '/api/email/audience/preview',
    schedulesApply: '/api/email/schedules/apply',
    suppressions: '/api/email/suppressions',
    contacts: '/api/contacts',
    commonAutomations: '/api/email/common-automations',
    health: '/api/email/health'
  };
  const RULE_VALUE_MAP = {
    MANUAL: 'manual',
    ON_REPLY: 'reply',
    AFTER_DUE: 'after_due'
  };
  const getEmailErrorLabel =
    typeof window !== 'undefined' && typeof window.getEmailErrorLabel === 'function'
      ? window.getEmailErrorLabel
      : (value) => (value ? String(value) : null);

  function parseInitialData() {
    const node = document.getElementById(DATA_NODE_ID);
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (err) {
      console.error('[task-settings] failed to parse initial data', err);
      return {};
    } finally {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  async function apiRequest(url, options = {}) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
      },
      body: options.body
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error((payload && payload.error) || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  function showToast(region, message, variant = 'info') {
    if (!region) return;
    region.textContent = message;
    region.dataset.variant = variant;
    region.dataset.timestamp = Date.now().toString();
  }

  function ensureOption(select, value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some((option) => option.value === value);
    if (exists) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  function uppercase(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.trim().toUpperCase() || fallback;
  }

  function mapAutoRuleForSelect(step) {
    const rule = uppercase(step?.autoCompleteRule);
    if (rule && RULE_VALUE_MAP[rule]) {
      return RULE_VALUE_MAP[rule];
    }
    return step?.waitForReply ? 'reply' : 'manual';
  }

  function mapAutoRuleForPayload(value, waitFlag) {
    const normalized = uppercase(value);
    if (normalized === 'REPLY' || normalized === 'ON_REPLY') return 'ON_REPLY';
    if (normalized === 'AFTER_DUE') return 'AFTER_DUE';
    if (normalized === 'MANUAL') return 'MANUAL';
    return waitFlag ? 'ON_REPLY' : 'MANUAL';
  }

  function setLoading(button, isLoading, label) {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }
      button.disabled = true;
      if (label) button.textContent = label;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const initialData = parseInitialData();
    const builderForm = document.querySelector('[data-task-settings-form]');
    const stepList = document.querySelector('[data-step-list]');
    const addStepButtons = document.querySelectorAll('[data-add-step]');
    const saveButton = document.querySelector('[data-save-schedule]');
    const newScheduleButton = document.querySelector('[data-new-schedule]');
    const builderTitle = document.querySelector('[data-builder-title]');
    const toastRegion = document.querySelector('[data-apply-toast]');
    const assignmentTable = document.querySelector('[data-assignment-table]');
    const tabButtons = document.querySelectorAll('[data-automation-tab]');
    const tabPanels = document.querySelectorAll('[data-automation-panel]');
    const refreshButton = document.querySelector('[data-refresh-automation]');
    const templateForm = document.querySelector('[data-template-form]');
    const templateList = document.querySelector('[data-template-list]');
    const templateToast = document.querySelector('[data-template-toast]');
    const templateReset = document.querySelector('[data-template-reset]');
    const templateNew = document.querySelector('[data-template-new]');
    const templateSearch = document.querySelector('[data-template-search]');
    const templateFilters = document.querySelectorAll('[data-template-filter]');
    const templateDuplicate = document.querySelector('[data-template-duplicate]');
    const templateSendTest = document.querySelector('[data-template-send-test]');
    const templateArchive = document.querySelector('[data-template-archive]');
    const templateRestore = document.querySelector('[data-template-restore]');
    const templateShowArchived = document.querySelector('[data-template-show-archived]');
    const templateSaved = document.querySelector('[data-template-saved]');
    const templatePreviewSearch = document.querySelector('[data-template-preview-search]');
    const templatePreviewSearchBtn = document.querySelector('[data-template-preview-search-btn]');
    const templatePreviewContact = document.querySelector('[data-template-preview-contact]');
    const templatePreviewRecipient = document.querySelector('[data-template-preview-recipient]');
    const templatePreviewRun = document.querySelector('[data-template-preview-run]');
    const templatePreviewSubject = document.querySelector('[data-template-preview-subject]');
    const templatePreviewText = document.querySelector('[data-template-preview-text]');
    const templatePreviewHtml = document.querySelector('[data-template-preview-html]');
    const templatePreviewMissing = document.querySelector('[data-template-preview-missing]');
    const templatePreviewMissingList = document.querySelector('[data-template-preview-missing-list]');
    const templateTokenOpen = document.querySelector('[data-template-token-open]');
    const tokenModal = document.getElementById('templateTokenModal');
    const tokenSearch = document.querySelector('[data-token-search]');
    const tokenList = document.querySelector('[data-token-list]');
    const tokenRecentWrap = document.querySelector('[data-token-recent]');
    const tokenRecentList = document.querySelector('[data-token-recent-list]');
    const tokenModalClose = document.querySelector('[data-token-modal-close]');
    const templateImageOpen = document.querySelector('[data-template-image-open]');
    const imageModal = document.getElementById('templateImageModal');
    const imageModalClose = document.querySelector('[data-image-modal-close]');
    const imageTabs = document.querySelectorAll('[data-image-tab]');
    const imagePanels = document.querySelectorAll('[data-image-panel]');
    const imageFileInput = document.querySelector('[data-image-file]');
    const imagePreviewWrap = document.querySelector('[data-image-preview-wrap]');
    const imagePreview = document.querySelector('[data-image-preview]');
    const imageUploadBtn = document.querySelector('[data-image-upload]');
    const imageLibrary = document.querySelector('[data-image-library]');
    const templateAdvancedToggle = document.querySelector('[data-template-advanced-toggle]');
    const templateAdvancedFields = document.querySelectorAll('[data-template-advanced-fields]');
    const templateEditorWrap = document.querySelector('[data-template-editor]');
    const commonAutomationList = document.querySelector('[data-common-automation-list]');
    const commonAutomationToast = document.querySelector('[data-common-automation-toast]');
    const commonAutomationRefresh = document.querySelector('[data-common-refresh]');
    const healthRefresh = document.querySelector('[data-health-refresh]');
    const healthEnabled = document.querySelector('[data-health-enabled]');
    const healthPoll = document.querySelector('[data-health-poll]');
    const healthStale = document.querySelector('[data-health-stale]');
    const healthMaxJobs = document.querySelector('[data-health-maxjobs]');
    const healthMaxAttempts = document.querySelector('[data-health-maxattempts]');
    const healthLogLevel = document.querySelector('[data-health-loglevel]');
    const healthCounts = document.querySelector('[data-health-counts]');
    const healthFailures = document.querySelector('[data-health-failures]');
    const healthStuck = document.querySelector('[data-health-stuck]');
    const healthToast = document.querySelector('[data-health-toast]');
    const healthStuckAlert = document.querySelector('[data-health-stuck-alert]');
    const healthStuckMessage = document.querySelector('[data-health-stuck-message]');
    const healthStuckLink = document.querySelector('[data-health-stuck-link]');
    const healthStuckSection = document.querySelector('[data-health-stuck-section]');
    const ruleForm = document.querySelector('[data-rule-form]');
    const ruleList = document.querySelector('[data-rule-list]');
    const ruleToast = document.querySelector('[data-rule-toast]');
    const ruleReset = document.querySelector('[data-rule-reset]');
    const ruleNew = document.querySelector('[data-rule-new]');
    const ruleTestButton = document.querySelector('[data-rule-test]');
    const ruleTestModal = document.getElementById('ruleTestModal');
    const ruleTestClose = document.querySelector('[data-rule-test-close]');
    const ruleTestSearch = document.querySelector('[data-rule-test-search]');
    const ruleTestSearchBtn = document.querySelector('[data-rule-test-search-btn]');
    const ruleTestContact = document.querySelector('[data-rule-test-contact]');
    const ruleTestStatus = document.querySelector('[data-rule-test-status]');
    const ruleTestRun = document.querySelector('[data-rule-test-run]');
    const ruleTestClear = document.querySelector('[data-rule-test-clear]');
    const ruleTestResult = document.querySelector('[data-rule-test-result]');
    const ruleTestOutcome = document.querySelector('[data-rule-test-outcome]');
    const ruleTestSchedule = document.querySelector('[data-rule-test-schedule]');
    const ruleTestNotes = document.querySelector('[data-rule-test-notes]');
    const ruleTestReasons = document.querySelector('[data-rule-test-reasons]');
    const ruleTestActions = document.querySelector('[data-rule-test-actions]');
    const ruleTestViewContact = document.querySelector('[data-rule-test-view-contact]');
    const ruleTestOpenQueue = document.querySelector('[data-rule-test-open-queue]');
    const ruleDelayMode = ruleForm?.querySelector('[data-rule-delay-mode]');
    const ruleDelayValue = ruleForm?.querySelector('[data-rule-delay-value]');
    const ruleCooldownValue = ruleForm?.querySelector('[data-rule-cooldown-value]');
    const ruleCooldownUnit = ruleForm?.querySelector('[data-rule-cooldown-unit]');
    const ruleTimeline = document.querySelector('[data-rule-timeline]');
    const ruleTemplatePreview = document.querySelector('[data-rule-template-preview]');
    const queueList = document.querySelector('[data-queue-list]');
    const queueFilters = document.querySelectorAll('[data-queue-filter]');
    const queueStatusSelect = document.querySelector('[data-queue-status]');
    const queueFilterChips = document.querySelector('[data-queue-filter-chips]');
    const queueFilterEmpty = document.querySelector('[data-queue-filter-empty]');
    const queueClearAll = document.querySelector('[data-queue-clear-all]');
    const queueSummary = document.querySelector('[data-queue-summary]');
    const queueSummaryQueued = document.querySelector('[data-queue-summary-queued]');
    const queueSummaryProcessing = document.querySelector('[data-queue-summary-processing]');
    const queueSummarySent = document.querySelector('[data-queue-summary-sent]');
    const queueSummaryFailed = document.querySelector('[data-queue-summary-failed]');
    const queueSummarySkipped = document.querySelector('[data-queue-summary-skipped]');
    const queueSummaryCanceled = document.querySelector('[data-queue-summary-canceled]');
    const queueToast = document.querySelector('[data-queue-toast]');
      const blastForm = document.querySelector('[data-blast-form]');
      const blastAudienceType = blastForm?.elements.audienceType || document.querySelector('[data-blast-audience-type]');
      const blastAudiencePanels = document.querySelectorAll('[data-blast-audience]');
      const realtorCommunitySelect = blastForm?.elements.realtorCommunityId || document.querySelector('[data-realtor-community-select]');
      const realtorManagerSelect = blastForm?.elements.realtorManagerId || document.querySelector('[data-realtor-manager-select]');
    const blastTemplateSelect = document.querySelector('[data-blast-template]');
    const blastPreviewButton = document.querySelector('[data-blast-preview]');
    const blastPreviewTotal = document.querySelector('[data-blast-preview-total]');
    const blastPreviewExcluded = document.querySelector('[data-blast-preview-excluded]');
    const blastPreviewSuppressed = document.querySelector('[data-blast-preview-suppressed]');
    const blastPreviewPaused = document.querySelector('[data-blast-preview-paused]');
    const blastPreviewInvalid = document.querySelector('[data-blast-preview-invalid]');
    const blastPreviewNoEmail = document.querySelector('[data-blast-preview-no-email]');
    const blastPreviewFinal = document.querySelector('[data-blast-preview-final]');
    const blastPreviewFirst = document.querySelector('[data-blast-preview-first]');
    const blastPreviewLast = document.querySelector('[data-blast-preview-last]');
    const blastPreviewDays = document.querySelector('[data-blast-preview-days]');
    const blastPreviewSample = document.querySelector('[data-blast-preview-sample]');
    const blastPreviewHelp = document.querySelector('[data-blast-preview-help]');
    const blastStepCompleteBadges = document.querySelectorAll('[data-blast-step-complete]');
    const blastWindowNote = document.querySelector('[data-blast-window-note]');
    const blastPacingNote = document.querySelector('[data-blast-pacing-note]');
    const blastScheduleEstimate = document.querySelector('[data-blast-schedule-estimate]');
    const blastScheduleFirst = document.querySelector('[data-blast-schedule-first]');
    const blastScheduleLast = document.querySelector('[data-blast-schedule-last]');
    const blastScheduleDays = document.querySelector('[data-blast-schedule-days]');
    const blastSummaryAudience = document.querySelector('[data-blast-summary-audience]');
    const blastSummaryFinal = document.querySelector('[data-blast-summary-final]');
    const blastSummaryTemplate = document.querySelector('[data-blast-summary-template]');
    const blastSummarySchedule = document.querySelector('[data-blast-summary-schedule]');
    const blastSummaryPacing = document.querySelector('[data-blast-summary-pacing]');
    const blastSummaryFirst = document.querySelector('[data-blast-summary-first]');
    const blastSummaryLast = document.querySelector('[data-blast-summary-last]');
    const blastSuccessLinks = document.querySelector('[data-blast-success-links]');
    const blastViewQueue = document.querySelector('[data-blast-view-queue]');
    const blastViewDetails = document.querySelector('[data-blast-view-details]');
    const blastCopySummary = document.querySelector('[data-blast-copy-summary]');
    const blastRecipientToggle = document.querySelector('[data-blast-recipient-toggle]');
    const blastRecipientPanel = document.querySelector('[data-blast-recipient-panel]');
    const blastRecipientType = document.querySelector('[data-blast-recipient-type]');
    const blastRecipientSample = document.querySelector('[data-blast-recipient-sample]');
    const blastRecipientSearch = document.querySelector('[data-blast-recipient-search]');
    const blastRecipientSearchBtn = document.querySelector('[data-blast-recipient-search-btn]');
    const blastRecipientResults = document.querySelector('[data-blast-recipient-results]');
    const blastRecipientRender = document.querySelector('[data-blast-recipient-render]');
    const blastRecipientPreview = document.querySelector('[data-blast-recipient-preview]');
    const blastRecipientSubject = document.querySelector('[data-blast-recipient-subject]');
    const blastRecipientText = document.querySelector('[data-blast-recipient-text]');
    const blastRecipientHtml = document.querySelector('[data-blast-recipient-html]');
    const blastRecipientMissing = document.querySelector('[data-blast-recipient-missing]');
    const blastEmailPreviewButton = document.querySelector('[data-blast-email-preview]');
    const blastEmailPreviewSubject = document.querySelector('[data-blast-email-subject]');
    const blastEmailPreviewText = document.querySelector('[data-blast-email-text]');
    const blastCommunityList = document.querySelector('[data-blast-community-pills]');
    const blastStatusList = document.querySelector('[data-blast-status-pills]');
    const blastStatusCountNodes = document.querySelectorAll('[data-blast-status-count]');
    const blastConfirmation = document.querySelector('[data-blast-confirmation]');
    const blastList = document.querySelector('[data-blast-list]');
    const blastToast = document.querySelector('[data-blast-toast]');
    const blastReset = document.querySelector('[data-blast-reset]');
    const emailSettingsForm = document.querySelector('[data-email-settings-form]');
    const settingsToast = document.querySelector('[data-settings-toast]');
    const settingsRefresh = document.querySelector('[data-email-settings-refresh]');
    const suppressionsList = document.querySelector('[data-suppression-list]');
    const suppressionEmailInput = document.querySelector('[data-suppression-email]');
    const suppressionAddButton = document.querySelector('[data-suppression-add]');
    const audienceForm = document.querySelector('[data-audience-form]');
    const audienceTotal = document.querySelector('[data-audience-total]');
    const audienceExcluded = document.querySelector('[data-audience-excluded]');
    const audienceSample = document.querySelector('[data-audience-sample]');
    const stopSelect = builderForm
      ? builderForm.querySelector('[data-stop-select]') || builderForm.elements.stopOnStatuses
      : null;
    const stopPillList = document.querySelector('[data-stop-pill-list]');
    const workflowTabs = document.querySelectorAll('[data-schedule-step]');
    const workflowPanels = document.querySelectorAll('[data-schedule-step-panel]');
    const workflowNextButtons = document.querySelectorAll('[data-workflow-next]');
    const workflowBackButtons = document.querySelectorAll('[data-workflow-back]');
    let workflowOrder = [];
    let currentWorkflowStep = null;
    const blastWorkflowTabs = document.querySelectorAll('[data-blast-step]');
    const blastWorkflowPanels = document.querySelectorAll('[data-blast-step-panel]');
    const blastWorkflowNextButtons = document.querySelectorAll('[data-blast-workflow-next]');
    const blastWorkflowBackButtons = document.querySelectorAll('[data-blast-workflow-back]');
    let blastWorkflowOrder = [];
    let currentBlastWorkflowStep = null;
    let blastPreviewTimer = null;
    let templateEditor = null;
    let templateEditorTarget = 'body';

    if (!builderForm || !stepList) return;

    const baseStepTemplate = stepList.querySelector('.builder-step')
      ? stepList.querySelector('.builder-step').cloneNode(true)
      : null;

    const state = {
      schedules: Array.isArray(initialData.schedules) ? initialData.schedules : [],
      builderPreset: initialData.builderPreset || {},
      assignments: Array.isArray(initialData.teamAssignments) ? initialData.teamAssignments : [],
      currentUserEmail: initialData.currentUserEmail || '',
      endpoints: {
        ...DEFAULT_ENDPOINTS,
        ...(initialData.endpoints || {})
      },
      emailEndpoints: {
        ...DEFAULT_EMAIL_ENDPOINTS,
        ...(initialData.emailEndpoints || {})
      },
      commonAutomations: [],
      canManageAutomations: Boolean(initialData.canManageAutomations),
        templates: [],
        rules: [],
        queue: [],
        ruleDirty: false,
      templateFilter: 'all',
      templateSearch: '',
      templateDirty: false,
      templateLastSavedAt: null,
      templateShowArchived: false,
      activeScheduleId: null,
      activeTemplateId: null,
        activeRuleId: null,
        currentQueueFilter: 'today',
        currentQueueBlastId: null,
        currentQueueContactId: null,
        currentQueueRealtorId: null,
        currentQueueStatus: '',
        blastPreview: null,
        blasts: [],
        blastRequestId: null,
        currentTab: 'schedules',
        initialTab: null,
        emailAssets: [],
        blastStepVisited: new Set()
      };

    const urlParams = new URLSearchParams(window.location.search);
      const requestedTab = urlParams.get('tab');
      const requestedBlastId = urlParams.get('blastId');
      const requestedContactId = urlParams.get('contactId');
      const requestedRealtorId = urlParams.get('realtorId');
      const requestedStatus = urlParams.get('status');
      if (requestedBlastId) {
        state.currentQueueBlastId = requestedBlastId;
      }
      if (requestedContactId) {
        state.currentQueueContactId = requestedContactId;
      }
      if (requestedRealtorId) {
        state.currentQueueRealtorId = requestedRealtorId;
      }
      if (requestedStatus) {
        state.currentQueueStatus = requestedStatus;
      }
    if (requestedTab) {
      state.initialTab = requestedTab;
    }

    const scheduleMap = new Map();
    state.schedules.forEach((schedule) => {
      if (schedule && schedule.id) {
        scheduleMap.set(String(schedule.id), schedule);
      }
    });

    function getDefaultChannel() {
      const list = state.builderPreset?.channelOptions;
      if (Array.isArray(list) && list.length) return list[0];
      const select = stepList.querySelector('[data-step-field="channel"]');
      return select?.options?.[0]?.value || 'SMS';
    }

    function getDefaultOwnerRole() {
      const list = state.builderPreset?.ownerOptions;
      if (Array.isArray(list) && list.length) return list[0];
      const select = builderForm.querySelector('select[name="owner"]');
      return select?.value || 'Team Member';
    }

    function renderTemplateOptions(select, selectedId) {
      if (!select) return;
      const current = selectedId || select.dataset.selectedTemplate || select.value || '';
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select template (email only)';
      select.appendChild(placeholder);
      state.templates.forEach((template) => {
        const option = document.createElement('option');
        option.value = template._id || template.id;
        option.textContent = template.name || 'Untitled Template';
        if (current && String(option.value) === String(current)) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    function refreshTemplateSelects() {
      stepList.querySelectorAll('[data-step-field="template"]').forEach((select) => {
        renderTemplateOptions(select);
      });
      if (ruleForm) {
        const ruleTemplate = ruleForm.querySelector('[data-rule-template]');
        if (ruleTemplate) {
          const current = ruleTemplate.value;
          ruleTemplate.innerHTML = '<option value="">Select a template</option>';
          state.templates.forEach((template) => {
            const option = document.createElement('option');
            option.value = template._id || template.id;
            option.textContent = template.name || 'Untitled Template';
            if (current && String(option.value) === String(current)) option.selected = true;
            ruleTemplate.appendChild(option);
          });
        }
      }
      if (blastTemplateSelect) {
        const current = blastTemplateSelect.value;
        blastTemplateSelect.innerHTML = '<option value="">Select a template</option>';
        state.templates.forEach((template) => {
          const option = document.createElement('option');
          option.value = template._id || template.id;
          option.textContent = `${template.name || 'Untitled'}${template.type ? ` (${template.type})` : ''}`;
          if (current && String(option.value) === String(current)) option.selected = true;
          blastTemplateSelect.appendChild(option);
        });
      }
    }

    function createStepElement(step = {}, index = 0) {
      const el = baseStepTemplate ? baseStepTemplate.cloneNode(true) : document.createElement('div');
      if (!baseStepTemplate) {
        el.className = 'builder-step p-3 mb-3';
        el.innerHTML = `
          <div class="text-muted small">Step ${index + 1}</div>
        `;
      }
      el.dataset.stepId = step.id || step.stepId || `step-${index + 1}`;

      el.querySelectorAll('[data-step-field]').forEach((field) => {
        const fieldName = field.getAttribute('data-step-field');
        if (!fieldName) return;
        if (fieldName === 'day') {
          const offset = Number.isFinite(step.dayOffset) ? step.dayOffset : index * 2;
          field.value = offset;
          return;
        }
        if (fieldName === 'channel') {
          const channelValue = step.channel || getDefaultChannel();
          ensureOption(field, channelValue);
          field.value = channelValue;
          return;
        }
        if (fieldName === 'template') {
          field.dataset.selectedTemplate =
            step.templateId || step.templateRef || step.template || '';
          return;
        }
        if (fieldName === 'title') {
          field.value = step.title || `Touchpoint ${index + 1}`;
          return;
        }
        if (fieldName === 'owner') {
          const ownerValue = step.ownerRole || getDefaultOwnerRole();
          ensureOption(field, ownerValue);
          field.value = ownerValue;
          return;
        }
        if (fieldName === 'rule') {
          field.value = mapAutoRuleForSelect(step);
          return;
        }
        if (fieldName === 'instructions') {
          field.value = step.instructions || '';
          return;
        }
        if (fieldName === 'wait') {
          field.checked = Boolean(step.waitForReply);
        }
      });

      return el;
    }

    function renderSteps(steps) {
      if (!stepList) return;
      stepList.innerHTML = '';
      const safeSteps = Array.isArray(steps) && steps.length
        ? steps
        : [
            {
              dayOffset: 0,
              channel: getDefaultChannel(),
              title: 'Initial touchpoint',
              ownerRole: getDefaultOwnerRole(),
              waitForReply: false
            }
          ];

      safeSteps.forEach((step, index) => {
        const element = createStepElement(step, index);
        stepList.appendChild(element);
      });

      refreshTemplateSelects();
    }

    function setBuilderMode(isEditing, scheduleName) {
      if (builderTitle) {
        builderTitle.textContent = isEditing
          ? `Editing: ${scheduleName || 'Schedule'}`
          : 'Schedule Canvas';
      }
      if (saveButton) {
        saveButton.textContent = isEditing ? 'Update Schedule' : 'Save Schedule';
      }
    }

    function syncStopPillsFromSelect() {
      if (!stopSelect || !stopPillList) return;
      const selected = new Set(
        Array.from(stopSelect.options || [])
          .filter((option) => option.selected)
          .map((option) => option.value)
      );
      stopPillList.querySelectorAll('[data-stop-pill]').forEach((pill) => {
        const value = pill.dataset.stopPill || '';
        const isSelected = selected.has(value);
        pill.classList.toggle('is-muted', isSelected);
        pill.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
    }

    function syncBlastPillsFromInputs() {
      if (!blastForm) return;
      const communityInput = blastForm.querySelector('[data-blast-community-input]') || blastForm.elements.communityIds;
      const statusInput = blastForm.querySelector('[data-blast-status-input]') || blastForm.elements.statuses;
      const selectedCommunities = new Set(parseCsv(communityInput?.value || ''));
      const selectedStatuses = parseCsv(statusInput?.value || '');
      const hasStatusSelection = selectedStatuses.length > 0;
      const selectedSet = new Set(selectedStatuses);

      blastCommunityList?.querySelectorAll('[data-community-id]').forEach((pill) => {
        const value = pill.dataset.communityId || '';
        const isSelected = selectedCommunities.has(value);
        pill.classList.toggle('is-selected', isSelected);
        pill.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      blastStatusList?.querySelectorAll('[data-blast-status-pill]').forEach((pill) => {
        const value = pill.dataset.blastStatusPill || '';
        const isActive = !hasStatusSelection || selectedSet.has(value);
        const isMuted = !isActive;
        pill.classList.toggle('is-muted', isMuted);
        pill.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
      });
    }

    function syncBlastInputsFromPills() {
      if (!blastForm) return;
      const communityInput = blastForm.querySelector('[data-blast-community-input]') || blastForm.elements.communityIds;
      const statusInput = blastForm.querySelector('[data-blast-status-input]') || blastForm.elements.statuses;

      const communities = blastCommunityList
        ? Array.from(blastCommunityList.querySelectorAll('[data-community-id].is-selected'))
            .map((pill) => pill.dataset.communityId)
            .filter(Boolean)
        : [];

      const statuses = blastStatusList
        ? Array.from(blastStatusList.querySelectorAll('[data-blast-status-pill]'))
            .filter((pill) => !pill.classList.contains('is-muted'))
            .map((pill) => pill.dataset.blastStatusPill)
            .filter(Boolean)
        : [];
      const mutedCount = blastStatusList
        ? blastStatusList.querySelectorAll('[data-blast-status-pill].is-muted').length
        : 0;

      if (communityInput) communityInput.value = communities.join(', ');
      if (statusInput) statusInput.value = mutedCount ? statuses.join(', ') : '';
    }

    function renderBlastCommunities(list) {
      if (!blastCommunityList) return;
      if (!Array.isArray(list) || !list.length) {
        blastCommunityList.innerHTML = '<span class="text-muted small">No communities available.</span>';
        return;
      }
      blastCommunityList.innerHTML = '';
      list.forEach((community) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'filter-pill';
        pill.dataset.communityId = String(community._id || community.id || '');
        pill.setAttribute('aria-pressed', 'false');
        pill.textContent = community.name || 'Community';
        blastCommunityList.appendChild(pill);
      });
      syncBlastPillsFromInputs();
    }

    async function loadBlastCommunities() {
      if (!blastCommunityList) return;
      try {
        const communities = await apiRequest('/api/contacts/my/communities');
        renderBlastCommunities(communities);
      } catch (err) {
        console.error('[blasts] community load failed', err);
        blastCommunityList.innerHTML = '<span class="text-muted small">Unable to load communities.</span>';
      }
    }

    function renderSelectOptions(select, options, { includeAll = false, allLabel = 'All' } = {}) {
      if (!select) return;
      const list = Array.isArray(options) ? options : [];
      select.innerHTML = '';
      if (includeAll) {
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = allLabel;
        select.appendChild(allOption);
      }
      if (!list.length) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = includeAll ? 'No options available' : 'No options available';
        select.appendChild(empty);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      list.forEach((item) => {
        const option = document.createElement('option');
        option.value = String(item.id || item._id || '');
        option.textContent = item.label || item.name || 'User';
        select.appendChild(option);
      });
    }

    async function loadRealtorCommunities() {
      if (!realtorCommunitySelect) return;
      const url = state.canManageAutomations
        ? '/api/communities/select-options?scope=company'
        : '/api/contacts/my/communities';
      try {
        const communities = await apiRequest(url);
        renderSelectOptions(realtorCommunitySelect, communities, {
          includeAll: true,
          allLabel: 'All communities'
        });
      } catch (err) {
        console.error('[blasts] realtor community load failed', err);
        renderSelectOptions(realtorCommunitySelect, [], { includeAll: true, allLabel: 'All communities' });
      }
    }

    async function loadRealtorManagers() {
      if (!realtorManagerSelect) return;
      try {
        const payload = await apiRequest('/api/users/select-options');
        const options = payload?.users || [];
        const includeAll = state.canManageAutomations;
        renderSelectOptions(realtorManagerSelect, options, {
          includeAll,
          allLabel: 'All managers'
        });
        if (!includeAll && options.length) {
          realtorManagerSelect.value = options[0].id || '';
        }
      } catch (err) {
        console.error('[blasts] realtor manager load failed', err);
        renderSelectOptions(realtorManagerSelect, [], {
          includeAll: state.canManageAutomations,
          allLabel: 'All managers'
        });
      }
    }

    async function loadRealtorBlastFilters() {
      await Promise.all([
        loadRealtorCommunities(),
        loadRealtorManagers()
      ]);
    }

    function resetBuilderForm() {
      state.activeScheduleId = null;
      builderForm.reset();
      if (builderForm.elements.stopOnStatuses) {
        Array.from(builderForm.elements.stopOnStatuses.options || []).forEach((option) => {
          option.selected = false;
        });
      }
      syncStopPillsFromSelect();
      renderSteps(state.builderPreset?.steps || []);
      setBuilderMode(false);
    }

    function populateFormFromSchedule(schedule) {
      if (!schedule) return;
      state.activeScheduleId = schedule.id || schedule._id || null;
      if (builderForm.elements.scheduleName) {
        builderForm.elements.scheduleName.value = schedule.name || '';
      }
      if (builderForm.elements.pipelineStage) {
        ensureOption(builderForm.elements.pipelineStage, schedule.targetStage || schedule.stage);
        builderForm.elements.pipelineStage.value = schedule.targetStage || schedule.stage || builderForm.elements.pipelineStage.value;
      }
      if (builderForm.elements.owner) {
        ensureOption(builderForm.elements.owner, schedule.defaultOwner || schedule.defaultOwnerRole);
        builderForm.elements.owner.value =
          schedule.defaultOwner || schedule.defaultOwnerRole || builderForm.elements.owner.value;
      }
      if (builderForm.elements.escalationOwner && schedule.fallbackOwnerRole) {
        ensureOption(builderForm.elements.escalationOwner, schedule.fallbackOwnerRole);
        builderForm.elements.escalationOwner.value = schedule.fallbackOwnerRole;
      }
      if (builderForm.elements.description) {
        builderForm.elements.description.value = schedule.summary || schedule.description || '';
      }
      if (builderForm.elements.stopOnStatuses) {
        const selected = Array.isArray(schedule.stopOnStatuses) ? schedule.stopOnStatuses : [];
        Array.from(builderForm.elements.stopOnStatuses.options || []).forEach((option) => {
          option.selected = selected.includes(option.value);
        });
      }
      syncStopPillsFromSelect();
      renderSteps(schedule.steps || []);
      setBuilderMode(true, schedule.name);
    }

    function collectSchedulePayload() {
      const scheduleName = (builderForm.elements.scheduleName?.value || '').trim();
      if (!scheduleName) {
        showToast(toastRegion, 'Schedule name is required', 'error');
        return null;
      }

      const steps = [];
      const stepElements = stepList.querySelectorAll('.builder-step');
      if (!stepElements.length) {
        showToast(toastRegion, 'Add at least one follow-up step', 'error');
        return null;
      }

      const stopOnStatuses = builderForm.elements.stopOnStatuses
        ? Array.from(builderForm.elements.stopOnStatuses.selectedOptions || []).map((opt) => opt.value)
        : [];

      stepElements.forEach((stepEl, index) => {
        const getFieldValue = (name) =>
          stepEl.querySelector(`[data-step-field="${name}"]`);

        const dayField = getFieldValue('day');
        const channelField = getFieldValue('channel');
        const titleField = getFieldValue('title');
        const ownerField = getFieldValue('owner');
        const ruleField = getFieldValue('rule');
        const instructionsField = getFieldValue('instructions');
        const waitField = getFieldValue('wait');
        const templateField = getFieldValue('template');

        const dayValue = parseInt(dayField?.value || index * 2 || '0', 10);
        const titleValue = (titleField?.value || '').trim() || `Touchpoint ${index + 1}`;
        const ownerRole = (ownerField?.value || '').trim();
        const channelValue = (channelField?.value || '').trim() || getDefaultChannel();
        const waitFlag = Boolean(waitField?.checked);
        const ruleValue = ruleField?.value || '';
        const instructions = (instructionsField?.value || '').trim();
        const templateId = (templateField?.value || '').trim();

        steps.push({
          stepId: stepEl.dataset.stepId || `step-${index + 1}`,
          order: index,
          dayOffset: Number.isNaN(dayValue) ? index * 2 : dayValue,
          channel: uppercase(channelValue, getDefaultChannel()),
          title: titleValue,
          ownerRole: ownerRole || undefined,
          instructions: instructions || undefined,
          waitForReply: waitFlag,
          autoCompleteRule: mapAutoRuleForPayload(ruleValue, waitFlag),
          templateId: templateId || undefined
        });
      });

      return {
        name: scheduleName,
        summary: builderForm.elements.description?.value || '',
        description: builderForm.elements.description?.value || '',
        stage: builderForm.elements.pipelineStage?.value || null,
        defaultOwnerRole: builderForm.elements.owner?.value || null,
        fallbackOwnerRole: builderForm.elements.escalationOwner?.value || null,
        stopOnStatuses,
        steps
      };
    }

    async function handleSaveSchedule(event) {
      event?.preventDefault();
      const payload = collectSchedulePayload();
      if (!payload) return;

      const isEditing = Boolean(state.activeScheduleId);
      const url = isEditing
        ? `${state.endpoints.schedules}/${state.activeScheduleId}`
        : state.endpoints.schedules;

      try {
        setLoading(saveButton, true, isEditing ? 'Saving...' : 'Saving...');
        await apiRequest(url, {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        showToast(toastRegion, isEditing ? 'Schedule updated.' : 'Schedule created.', 'success');
        window.location.reload();
      } catch (err) {
        console.error('[task-settings] save failed', err);
        showToast(toastRegion, err.message || 'Unable to save schedule', 'error');
      } finally {
        setLoading(saveButton, false);
      }
    }

    async function handleAssignment(row, button) {
      if (!row) return;
      const select = row.querySelector('[data-schedule-select]');
      const userId = row.dataset.memberId;
      if (!select || !userId) return;
      if (!select.value) {
        row.classList.add('table-warning');
        setTimeout(() => row.classList.remove('table-warning'), 1500);
        return;
      }

      const scheduleId = select.value;
      try {
        setLoading(button, true, 'Assigning...');
        const response = await apiRequest(`${state.endpoints.schedules}/${scheduleId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ userId })
        });

        setLoading(button, false);

        const label = row.querySelector('[data-current-schedule]');
        const scheduleName = response.assignment?.scheduleName || select.options[select.selectedIndex].textContent.trim();
        if (label) label.textContent = scheduleName;

        showToast(
          toastRegion,
          `${scheduleName} assigned to ${row.dataset.memberName || 'teammate'}.`,
          'success'
        );

        row.classList.add('table-success');
        setTimeout(() => row.classList.remove('table-success'), 1500);
        button.textContent = 'Assigned';
        setTimeout(() => {
          button.textContent = button.dataset.originalText || 'Apply';
        }, 1500);
      } catch (err) {
        console.error('[task-settings] assignment failed', err);
        setLoading(button, false);
        row.classList.add('table-danger');
        setTimeout(() => row.classList.remove('table-danger'), 1500);
        showToast(toastRegion, err.message || 'Unable to assign schedule', 'error');
      }
    }

      function setActiveTab(tabName) {
        if (!tabName) return;
        state.currentTab = tabName;
      tabButtons.forEach((button) => {
        const isActive = button.dataset.automationTab === tabName;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      tabPanels.forEach((panel) => {
        const match = panel.dataset.automationPanel === tabName;
        panel.hidden = !match;
        panel.setAttribute('aria-hidden', match ? 'false' : 'true');
      });
        if (tabName === 'queue') {
          startHealthPolling();
        } else {
          stopHealthPolling();
        }
        if (tabName === 'blasts') {
          scheduleBlastPreviewRefresh(true);
        }
      }

    function initTabs() {
      if (!tabButtons.length) return;
      const validTabs = Array.from(tabButtons)
        .map((button) => button.dataset.automationTab)
        .filter(Boolean);
      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setActiveTab(button.dataset.automationTab);
        });
      });
      const initial = state.initialTab && validTabs.includes(state.initialTab) ? state.initialTab : 'schedules';
      setActiveTab(initial);
    }

    function setWorkflowStep(stepName) {
      if (!workflowOrder.length) return;
      const nextStep = workflowOrder.includes(stepName) ? stepName : workflowOrder[0];
      currentWorkflowStep = nextStep;
      workflowTabs.forEach((button) => {
        const isActive = button.dataset.scheduleStep === nextStep;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      workflowPanels.forEach((panel) => {
        const match = panel.dataset.scheduleStepPanel === nextStep;
        panel.hidden = !match;
        panel.setAttribute('aria-hidden', match ? 'false' : 'true');
      });
      const index = workflowOrder.indexOf(nextStep);
      const isFirst = index <= 0;
      const isLast = index >= workflowOrder.length - 1;
      workflowBackButtons.forEach((button) => {
        button.disabled = isFirst;
      });
      workflowNextButtons.forEach((button) => {
        button.disabled = isLast;
      });
    }

    function initWorkflow() {
      if (!workflowTabs.length || !workflowPanels.length) return;
      workflowOrder = Array.from(workflowTabs)
        .map((button) => button.dataset.scheduleStep)
        .filter(Boolean);
      workflowTabs.forEach((button) => {
        button.addEventListener('click', () => {
          setWorkflowStep(button.dataset.scheduleStep);
        });
      });
      workflowNextButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const index = workflowOrder.indexOf(currentWorkflowStep);
          if (index >= 0 && index < workflowOrder.length - 1) {
            setWorkflowStep(workflowOrder[index + 1]);
          }
        });
      });
      workflowBackButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const index = workflowOrder.indexOf(currentWorkflowStep);
          if (index > 0) {
            setWorkflowStep(workflowOrder[index - 1]);
          }
        });
      });
      setWorkflowStep(workflowOrder[0]);
    }

    function setBlastWorkflowStep(stepName) {
      if (!blastWorkflowOrder.length) return;
      const desiredStep = blastWorkflowOrder.includes(stepName) ? stepName : blastWorkflowOrder[0];
      const desiredIndex = blastWorkflowOrder.indexOf(desiredStep);
      const maxIndex = getBlastMaxStepIndex();
      const nextStep = blastWorkflowOrder[Math.min(desiredIndex, maxIndex)] || blastWorkflowOrder[0];
      currentBlastWorkflowStep = nextStep;
      state.blastStepVisited.add(nextStep);
      blastWorkflowTabs.forEach((button) => {
        const isActive = button.dataset.blastStep === nextStep;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      blastWorkflowPanels.forEach((panel) => {
        const match = panel.dataset.blastStepPanel === nextStep;
        panel.hidden = !match;
        panel.setAttribute('aria-hidden', match ? 'false' : 'true');
      });
      updateBlastStepState();
    }

    function initBlastWorkflow() {
      if (!blastWorkflowTabs.length || !blastWorkflowPanels.length) return;
      blastWorkflowOrder = Array.from(blastWorkflowTabs)
        .map((button) => button.dataset.blastStep)
        .filter(Boolean);
      blastWorkflowTabs.forEach((button) => {
        button.addEventListener('click', () => {
          setBlastWorkflowStep(button.dataset.blastStep);
        });
      });
      blastWorkflowNextButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const index = blastWorkflowOrder.indexOf(currentBlastWorkflowStep);
          if (index >= 0 && index < blastWorkflowOrder.length - 1) {
            setBlastWorkflowStep(blastWorkflowOrder[index + 1]);
          }
        });
      });
      blastWorkflowBackButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const index = blastWorkflowOrder.indexOf(currentBlastWorkflowStep);
          if (index > 0) {
            setBlastWorkflowStep(blastWorkflowOrder[index - 1]);
          }
        });
      });
      setBlastWorkflowStep(blastWorkflowOrder[0]);
    }

    function getCommonAutomationStatus(item) {
      if (!item || !item.exists) {
        return { label: 'Not Configured', className: 'bg-secondary-subtle text-secondary' };
      }
      if (item.enabled) {
        return { label: 'Enabled', className: 'bg-success-subtle text-success' };
      }
      return { label: 'Disabled', className: 'bg-warning-subtle text-warning' };
    }

    function renderCommonAutomations() {
      if (!commonAutomationList) return;
      if (!state.commonAutomations.length) {
        commonAutomationList.innerHTML = '<div class="text-muted small">No common automations available.</div>';
        return;
      }

      const manageDisabled = state.canManageAutomations ? '' : 'disabled';
      const manageTitle = state.canManageAutomations ? '' : 'title="Company admin required"';

      commonAutomationList.innerHTML = state.commonAutomations
        .map((item) => {
          const status = getCommonAutomationStatus(item);
          const ruleId = item.ruleId || '';
          const hasRule = Boolean(ruleId);
          const enableButton = item.enabled
            ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-common-disable="${item.key}" ${manageDisabled} ${manageTitle}>Disable</button>`
            : `<button type="button" class="btn btn-sm btn-outline-primary" data-common-enable="${item.key}" ${manageDisabled} ${manageTitle}>Enable</button>`;
          const editButton = hasRule
            ? `<button type="button" class="btn btn-sm btn-outline-dark" data-common-edit="${ruleId}">Edit</button>`
            : '';

          return `
            <div class="common-automation-card">
              <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${item.title || 'Automation'}</div>
                  <div class="text-muted small">${item.description || ''}</div>
                </div>
                <span class="badge ${status.className}">${status.label}</span>
              </div>
              <div class="d-flex gap-2 mt-3">
                ${enableButton}
                ${editButton}
              </div>
            </div>
          `;
        })
        .join('');
    }

    async function loadCommonAutomations() {
      if (!state.emailEndpoints.commonAutomations) return;
      if (!commonAutomationList) return;
      try {
        const response = await apiRequest(state.emailEndpoints.commonAutomations);
        state.commonAutomations = Array.isArray(response.automations) ? response.automations : [];
        renderCommonAutomations();
      } catch (err) {
        console.error('[automations] common automations load failed', err);
        commonAutomationList.innerHTML = '<div class="text-muted small">Unable to load common automations.</div>';
      }
    }

    function formatDurationMs(value) {
      if (!Number.isFinite(value)) return '--';
      const minutes = Math.round(value / 60000);
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.round(minutes / 60);
      return `${hours}h`;
    }

    function renderHealthCounts(counts) {
      if (!healthCounts) return;
      const items = [
        { label: 'Due now', value: counts?.dueNow ?? 0 },
        { label: 'Queued', value: counts?.queued ?? 0 },
        { label: 'Processing', value: counts?.processing ?? 0 },
        { label: 'Stuck processing', value: counts?.stuckProcessing ?? 0 },
        { label: 'Retrying', value: counts?.retrying ?? 0 },
        { label: 'Sent (24h)', value: counts?.sent24h ?? 0 },
        { label: 'Failed (24h)', value: counts?.failed24h ?? 0 },
        { label: 'Skipped (24h)', value: counts?.skipped24h ?? 0 }
      ];
      healthCounts.innerHTML = items
        .map(
          (item) => `
            <span class="badge bg-light text-dark border">
              ${item.label}: <span class="fw-semibold">${item.value}</span>
            </span>
          `
        )
        .join('');
    }

    function renderHealthFailures(items) {
      if (!healthFailures) return;
      if (!Array.isArray(items) || !items.length) {
        healthFailures.textContent = 'No failures in the last 48 hours.';
        return;
      }
      healthFailures.innerHTML = items
        .map((item) => {
          const time = item.updatedAt ? formatDateTime(item.updatedAt) : '--';
          return `<div class="mb-2">
            <div class="fw-semibold">${item.to || 'Recipient'}</div>
            <div class="text-muted">${time} • ${getEmailErrorLabel(item.lastError) || 'Failed'} • Attempts: ${item.attempts ?? 0}</div>
          </div>`;
        })
        .join('');
    }

    function renderHealthStuck(items) {
      if (!healthStuck) return;
      if (!Array.isArray(items) || !items.length) {
        healthStuck.textContent = 'No stuck jobs.';
        return;
      }
      healthStuck.innerHTML = items
        .map((item) => {
          const time = item.processingAt ? formatDateTime(item.processingAt) : '--';
          return `<div class="mb-2">
            <div class="fw-semibold">${item.to || 'Recipient'}</div>
            <div class="text-muted">${time} • Attempts: ${item.attempts ?? 0}</div>
          </div>`;
        })
        .join('');
    }

    function updateHealthAlert(count) {
      if (!healthStuckAlert) return;
      if (count && count > 0) {
        healthStuckAlert.classList.remove('d-none');
        if (healthStuckMessage) {
          healthStuckMessage.textContent = `Stuck jobs detected (${count}).`;
        }
      } else {
        healthStuckAlert.classList.add('d-none');
      }
    }

    function collectBlastFilters() {
      if (!blastForm) return {};
      const audienceType = blastForm.elements.audienceType?.value === 'realtors' ? 'realtors' : 'contacts';
      if (audienceType === 'realtors') {
        return {
          communityId: blastForm.elements.realtorCommunityId?.value || '',
          managerId: blastForm.elements.realtorManagerId?.value || '',
          textSearch: blastForm.elements.realtorTextSearch?.value || '',
          includeInactive: Boolean(blastForm.elements.realtorIncludeInactive?.checked)
        };
      }
      return {
        communityIds: parseCsv(blastForm.elements.communityIds?.value || ''),
        statuses: parseCsv(blastForm.elements.statuses?.value || ''),
        tags: parseCsv(blastForm.elements.tags?.value || ''),
        linkedLot: Boolean(blastForm.elements.linkedLot?.checked)
      };
    }

      function normalizeStatusKey(value) {
        return String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '');
      }

      function getBlastAudienceType() {
        if (!blastForm?.elements.audienceType) return 'contacts';
        return blastForm.elements.audienceType.value === 'realtors' ? 'realtors' : 'contacts';
      }

      function updateBlastAudienceUI() {
        if (!blastAudiencePanels?.length) return;
        const audienceType = getBlastAudienceType();
        blastAudiencePanels.forEach((panel) => {
          const panelType = panel.dataset.blastAudience || 'contacts';
          panel.classList.toggle('d-none', panelType !== audienceType);
        });
      }

    function updateBlastStatusCounts(counts) {
      if (!blastStatusCountNodes || !blastStatusCountNodes.length) return;
      if (!counts || typeof counts !== 'object') {
        blastStatusCountNodes.forEach((node) => {
          node.textContent = '--';
        });
        return;
      }
      const normalized = {};
      Object.entries(counts).forEach(([key, value]) => {
        const normalizedKey = normalizeStatusKey(key);
        if (normalizedKey) normalized[normalizedKey] = value;
      });
      blastStatusCountNodes.forEach((node) => {
        const key = normalizeStatusKey(node.dataset.blastStatusCount);
        node.textContent = normalized[key] != null ? normalized[key] : '0';
      });
    }

    function updateBlastPreviewUI(preview) {
      const hasPreview = preview && typeof preview.finalToSend !== 'undefined';
      if (blastPreviewHelp) {
        if (!hasPreview) {
          blastPreviewHelp.textContent = 'Run preview to see who will receive this.';
        } else {
          const days = Number(preview?.estimatedDaysSpanned || 0);
          if (days > 1) {
            blastPreviewHelp.textContent = `This blast will send over ${days} days.`;
          } else {
            blastPreviewHelp.textContent = 'Preview ready. Review exclusions before continuing.';
          }
        }
      }
      if (blastPreviewTotal) blastPreviewTotal.textContent = preview?.totalMatched ?? '--';
      const excludedTotal = preview?.excludedTotal ?? '--';
      if (blastPreviewExcluded) blastPreviewExcluded.textContent = excludedTotal;
      if (blastPreviewSuppressed) blastPreviewSuppressed.textContent = preview?.excludedSuppressed ?? '--';
      if (blastPreviewPaused) blastPreviewPaused.textContent = preview?.excludedPaused ?? '--';
      if (blastPreviewInvalid) blastPreviewInvalid.textContent = preview?.excludedInvalidEmail ?? '--';
      if (blastPreviewNoEmail) blastPreviewNoEmail.textContent = preview?.excludedNoEmail ?? '--';
      if (blastPreviewFinal) blastPreviewFinal.textContent = preview?.finalToSend ?? '--';
      if (blastPreviewFirst) {
        blastPreviewFirst.textContent = preview?.estimatedFirstSendAt
          ? formatDateTime(preview.estimatedFirstSendAt)
          : '--';
      }
      if (blastPreviewLast) {
        blastPreviewLast.textContent = preview?.estimatedLastSendAt
          ? formatDateTime(preview.estimatedLastSendAt)
          : '--';
      }
      if (blastPreviewDays) {
        blastPreviewDays.textContent =
          preview?.estimatedDaysSpanned != null ? preview.estimatedDaysSpanned : '--';
      }
      if (blastPreviewSample) {
        const samples = (preview?.sampleRecipients || [])
          .map((r) => `${r.name || r.email}`)
          .join(', ');
        blastPreviewSample.textContent = samples || 'No sample recipients available.';
      }

      updateBlastStatusCounts(preview?.statusCounts);

      if (blastConfirmation) {
        const thresholdHit = Number(preview?.finalToSend || 0) >= 200;
        blastConfirmation.classList.toggle('d-none', !thresholdHit);
        if (thresholdHit && blastForm?.elements.confirmationText) {
          blastForm.elements.confirmationText.placeholder = `Type: SEND ${preview.finalToSend}`;
        }
      }

      if (blastPacingNote) {
        const days = Number(preview?.estimatedDaysSpanned || 0);
        blastPacingNote.classList.toggle('d-none', !(days > 1));
      }
      if (blastScheduleEstimate) {
        const hasTiming = Boolean(preview?.estimatedFirstSendAt || preview?.estimatedLastSendAt);
        blastScheduleEstimate.classList.toggle('d-none', !hasTiming);
        if (hasTiming) {
          if (blastScheduleFirst) {
            blastScheduleFirst.textContent = preview?.estimatedFirstSendAt
              ? formatDateTime(preview.estimatedFirstSendAt)
              : '--';
          }
          if (blastScheduleLast) {
            blastScheduleLast.textContent = preview?.estimatedLastSendAt
              ? formatDateTime(preview.estimatedLastSendAt)
              : '--';
          }
          if (blastScheduleDays) {
            blastScheduleDays.textContent =
              preview?.estimatedDaysSpanned != null ? preview.estimatedDaysSpanned : '--';
          }
        }
      }

      renderBlastRecipientSampleOptions(preview?.sampleRecipients || []);

      updateBlastStepState();
      updateBlastConfirmationSummary();
    }

    function renderBlastRecipientSampleOptions(recipients) {
      if (!blastRecipientSample) return;
      const list = Array.isArray(recipients) ? recipients.slice(0, 10) : [];
      blastRecipientSample.innerHTML = '<option value="">Select a recipient</option>';
      list.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.contactId || item.realtorId || item.id || '';
        option.dataset.recipientType = item.realtorId ? 'realtor' : 'contact';
        option.textContent = item.name || item.email || 'Recipient';
        if (option.value) {
          blastRecipientSample.appendChild(option);
        }
      });
    }

    function getBlastPreviewFinalCount() {
      return Number(state.blastPreview?.finalToSend || 0);
    }

    function isBlastPreviewReady() {
      return Boolean(state.blastPreview) && getBlastPreviewFinalCount() > 0;
    }

    function isBlastContentReady() {
      const name = blastForm?.elements.name?.value?.trim() || '';
      const templateId = blastForm?.elements.templateId?.value || '';
      return Boolean(name) && Boolean(templateId);
    }

    function isBlastScheduleReady() {
      const sendMode = blastForm?.elements.sendMode?.value === 'scheduled' ? 'scheduled' : 'now';
      if (sendMode === 'scheduled') {
        const value = blastForm?.elements.scheduledFor?.value;
        if (!value) return false;
        const date = new Date(value);
        return !Number.isNaN(date.getTime());
      }
      return true;
    }

    function getBlastMaxStepIndex() {
      if (!isBlastPreviewReady()) return 0;
      if (!isBlastContentReady()) return 1;
      if (!isBlastScheduleReady()) return 2;
      return 3;
    }

    function updateBlastStepState() {
      if (!blastWorkflowTabs.length) return;
      const maxIndex = getBlastMaxStepIndex();
      blastWorkflowTabs.forEach((button) => {
        const step = button.dataset.blastStep;
        const index = blastWorkflowOrder.indexOf(step);
        button.disabled = index > maxIndex;
        const visited = state.blastStepVisited.has(step);
        const isComplete = index >= 0 && index < maxIndex && visited;
        button.classList.toggle('is-complete', isComplete);
      });
      blastStepCompleteBadges.forEach((badge) => {
        const step = badge.dataset.blastStepComplete;
        const index = blastWorkflowOrder.indexOf(step);
        const visited = state.blastStepVisited.has(step);
        badge.classList.toggle('d-none', !(index >= 0 && index < maxIndex && visited));
      });
      updateBlastNavigationControls();
      updateBlastSubmitState();
    }

    function updateBlastNavigationControls() {
      if (!blastWorkflowOrder.length) return;
      const index = blastWorkflowOrder.indexOf(currentBlastWorkflowStep);
      const maxIndex = getBlastMaxStepIndex();
      blastWorkflowBackButtons.forEach((button) => {
        button.disabled = index <= 0;
      });
      blastWorkflowNextButtons.forEach((button) => {
        button.disabled = index < 0 || index >= maxIndex;
      });
    }

    function updateBlastConfirmationSummary() {
      if (!blastForm) return;
      const audienceType = getBlastAudienceType();
      if (blastSummaryAudience) {
        blastSummaryAudience.textContent = audienceType === 'realtors' ? 'Realtors' : 'Contacts';
      }
      if (blastSummaryFinal) {
        blastSummaryFinal.textContent = isBlastPreviewReady()
          ? getBlastPreviewFinalCount()
          : '--';
      }
      if (blastSummaryTemplate) {
        const templateId = blastForm.elements.templateId?.value || '';
        blastSummaryTemplate.textContent = templateId ? getRuleTemplateName(templateId) : '--';
      }
      if (blastSummarySchedule) {
        const sendMode = blastForm.elements.sendMode?.value === 'scheduled' ? 'Scheduled' : 'Now';
        const scheduledFor = blastForm.elements.scheduledFor?.value || '';
        blastSummarySchedule.textContent =
          sendMode === 'Scheduled' && scheduledFor ? formatDateTime(scheduledFor) : sendMode;
      }
      if (blastSummaryPacing) {
        const days = Number(state.blastPreview?.estimatedDaysSpanned || 0);
        blastSummaryPacing.textContent = days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '--';
      }
      if (blastSummaryFirst) {
        blastSummaryFirst.textContent = state.blastPreview?.estimatedFirstSendAt
          ? formatDateTime(state.blastPreview.estimatedFirstSendAt)
          : '--';
      }
      if (blastSummaryLast) {
        blastSummaryLast.textContent = state.blastPreview?.estimatedLastSendAt
          ? formatDateTime(state.blastPreview.estimatedLastSendAt)
          : '--';
      }
    }

    function getBlastRecipientType() {
      if (blastRecipientType?.value) return blastRecipientType.value;
      return getBlastAudienceType() === 'realtors' ? 'realtor' : 'contact';
    }

    function syncBlastRecipientType() {
      if (!blastRecipientType) return;
      blastRecipientType.value = getBlastAudienceType() === 'realtors' ? 'realtor' : 'contact';
    }

    function toggleBlastRecipientPanel(forceOpen = null) {
      if (!blastRecipientPanel) return;
      const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : blastRecipientPanel.classList.contains('d-none');
      blastRecipientPanel.classList.toggle('d-none', !shouldOpen);
      if (shouldOpen) {
        syncBlastRecipientType();
        blastRecipientSearch?.focus();
      }
    }

    function clearBlastRecipientPreview() {
      if (blastRecipientPreview) blastRecipientPreview.classList.add('d-none');
      if (blastRecipientSubject) blastRecipientSubject.textContent = '--';
      if (blastRecipientText) blastRecipientText.textContent = '--';
      if (blastRecipientHtml) blastRecipientHtml.innerHTML = '--';
      if (blastRecipientMissing) {
        blastRecipientMissing.classList.add('d-none');
        blastRecipientMissing.textContent = '--';
      }
    }

    async function searchBlastRecipients() {
      if (!blastRecipientResults || !blastRecipientSearch) return;
      const query = blastRecipientSearch.value.trim();
      if (!query) return;
      blastRecipientResults.innerHTML = '<option value="">Searching...</option>';
      const recipientType = getBlastRecipientType();
      const endpoint = recipientType === 'realtor' ? '/api/realtors/search' : '/api/contacts/search';
      try {
        const response = await apiRequest(`${endpoint}?q=${encodeURIComponent(query)}`);
        const list = Array.isArray(response?.contacts || response?.realtors)
          ? (response.contacts || response.realtors)
          : Array.isArray(response) ? response : [];
        if (!list.length) {
          blastRecipientResults.innerHTML = '<option value="">No matches found</option>';
          return;
        }
        blastRecipientResults.innerHTML = '<option value="">Select a recipient</option>';
        list.forEach((item) => {
          const option = document.createElement('option');
          option.value = item._id || item.id || '';
          option.textContent = `${item.firstName || ''} ${item.lastName || ''}`.trim()
            || item.email
            || 'Recipient';
          if (option.value) blastRecipientResults.appendChild(option);
        });
      } catch (err) {
        console.error('[blasts] recipient search failed', err);
        blastRecipientResults.innerHTML = '<option value="">Search failed</option>';
      }
    }

    async function renderBlastRecipientPreview() {
      if (!blastTemplateSelect?.value) {
        showToast(blastToast, 'Select a template first.', 'error');
        return;
      }
      const templateId = blastTemplateSelect.value;
      const recipientType = getBlastRecipientType();
      const recipientId = blastRecipientSample?.value || blastRecipientResults?.value || '';
      if (!recipientId) {
        showToast(blastToast, 'Select a recipient for preview.', 'error');
        return;
      }
      try {
        const response = await apiRequest(`${state.emailEndpoints.templates}/${templateId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ recipientType, recipientId })
        });
        blastRecipientPreview?.classList.remove('d-none');
        if (blastRecipientSubject) blastRecipientSubject.textContent = response?.rendered?.subject || '--';
        if (blastRecipientText) blastRecipientText.textContent = response?.rendered?.text || '--';
        if (blastRecipientHtml) blastRecipientHtml.innerHTML = response?.rendered?.html || '--';
        if (blastRecipientMissing) {
          const missing = Array.isArray(response?.missingTokens) ? response.missingTokens : [];
          blastRecipientMissing.textContent = missing.length
            ? `Missing tokens: ${missing.join(', ')}`
            : 'All tokens resolved.';
          blastRecipientMissing.classList.remove('d-none');
        }
      } catch (err) {
        console.error('[blasts] recipient preview failed', err);
        showToast(blastToast, err.message || 'Unable to render preview.', 'error');
      }
    }

    function buildBlastSummaryText() {
      if (!blastForm) return '';
      const audienceType = getBlastAudienceType() === 'realtors' ? 'Realtors' : 'Contacts';
      const name = blastForm.elements.name?.value?.trim() || 'Untitled';
      const templateName = getRuleTemplateName(blastForm.elements.templateId?.value) || '--';
      const sendMode = blastForm.elements.sendMode?.value === 'scheduled' ? 'Scheduled' : 'Now';
      const scheduledFor = blastForm.elements.scheduledFor?.value || '';
      const scheduleText = sendMode === 'Scheduled' && scheduledFor
        ? formatDateTime(scheduledFor)
        : 'Send now';
      const preview = state.blastPreview || {};
      const excluded = {
        suppressed: preview.excludedSuppressed || 0,
        paused: preview.excludedPaused || 0,
        invalid: preview.excludedInvalidEmail || 0,
        missing: preview.excludedNoEmail || 0,
        duplicates: preview.excludedDuplicates || 0
      };
      const filters = collectBlastFilters();
      const filterParts = [];
      if (audienceType === 'Realtors') {
        if (filters.communityId) filterParts.push(`communityId=${filters.communityId}`);
        if (filters.managerId) filterParts.push(`managerId=${filters.managerId}`);
        if (filters.textSearch) filterParts.push(`search=${filters.textSearch}`);
        if (filters.includeInactive) filterParts.push('includeInactive=true');
      } else {
        if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
          filterParts.push(`communities=${filters.communityIds.join('|')}`);
        }
        if (Array.isArray(filters.statuses) && filters.statuses.length) {
          filterParts.push(`statuses=${filters.statuses.join('|')}`);
        }
        if (Array.isArray(filters.tags) && filters.tags.length) {
          filterParts.push(`tags=${filters.tags.join('|')}`);
        }
        if (filters.linkedLot) filterParts.push('linkedLot=true');
      }

      const lines = [
        `Blast: ${name}`,
        `Audience: ${audienceType}`,
        `Filters: ${filterParts.length ? filterParts.join(', ') : 'none'}`,
        `Preview: matched ${preview.totalMatched ?? 0}, final ${preview.finalToSend ?? 0}`,
        `Excluded: suppressed ${excluded.suppressed}, paused ${excluded.paused}, invalid ${excluded.invalid}, missing ${excluded.missing}, deduped ${excluded.duplicates}`,
        `Template: ${templateName}`,
        `Schedule: ${scheduleText}`,
        `Pacing: days ${preview.estimatedDaysSpanned ?? '--'}, first ${preview.estimatedFirstSendAt ? formatDateTime(preview.estimatedFirstSendAt) : '--'}, last ${preview.estimatedLastSendAt ? formatDateTime(preview.estimatedLastSendAt) : '--'}`
      ];
      return lines.join('\n');
    }

    async function copyBlastSummary() {
      const text = buildBlastSummaryText();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast(blastToast, 'Copied summary.', 'success');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(blastToast, 'Copied summary.', 'success');
      }
    }

    function updateBlastSubmitState() {
      const submitButton = blastForm?.querySelector('[data-blast-create]');
      if (!submitButton) return;
      const previewReady = isBlastPreviewReady();
      let ready = previewReady && isBlastContentReady() && isBlastScheduleReady();
      const finalCount = getBlastPreviewFinalCount();
      const needsConfirm = previewReady && finalCount >= 200;
      if (needsConfirm && blastForm?.elements.confirmationText) {
        const expected = `SEND ${finalCount}`;
        ready = ready && blastForm.elements.confirmationText.value.trim() === expected;
      }
      submitButton.disabled = !ready;
    }

    function scheduleBlastPreviewRefresh(immediate = false) {
      if (!blastForm || !state.emailEndpoints.blasts) return;
      if (blastPreviewTimer) {
        clearTimeout(blastPreviewTimer);
        blastPreviewTimer = null;
      }
      state.blastPreview = null;
      updateBlastPreviewUI({});
      if (immediate) {
        loadBlastPreview();
        return;
      }
      blastPreviewTimer = setTimeout(() => {
        loadBlastPreview();
      }, 350);
    }

      async function loadBlastPreview() {
        if (!blastForm) return;
        if (!state.emailEndpoints.blasts) return;
        const payload = {
          templateId: blastForm.elements.templateId?.value || null,
          audienceType: blastForm.elements.audienceType?.value || 'contacts',
          filters: collectBlastFilters(),
          sendMode: blastForm.elements.sendMode?.value === 'scheduled' ? 'scheduled' : 'now',
          scheduledFor: blastForm.elements.scheduledFor?.value || null
        };
      try {
        const response = await apiRequest(`${state.emailEndpoints.blasts}/preview`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        state.blastPreview = response;
        updateBlastPreviewUI(response);
      } catch (err) {
        console.error('[blasts] preview failed', err);
        updateBlastStatusCounts(null);
        if (blastToast) {
          showToast(blastToast, err.message || 'Unable to preview blast.', 'error');
        }
      }
    }

    async function handleBlastEmailPreview() {
      if (!blastTemplateSelect || !state.emailEndpoints.templates) return;
      const templateId = blastTemplateSelect.value || '';
      if (!templateId) {
        showToast(blastToast, 'Select a template first.', 'error');
        return;
      }
      try {
        const response = await apiRequest(`${state.emailEndpoints.templates}/${templateId}/preview`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        if (blastEmailPreviewSubject) {
          blastEmailPreviewSubject.textContent = response.rendered?.subject || '--';
        }
        if (blastEmailPreviewText) {
          blastEmailPreviewText.textContent = response.rendered?.text || '--';
        }
      } catch (err) {
        console.error('[blasts] email preview failed', err);
        showToast(blastToast, err.message || 'Unable to preview email.', 'error');
      }
    }

    function renderBlasts() {
      if (!blastList) return;
      if (!state.blasts.length) {
        blastList.innerHTML = '<div class="text-muted small">No blasts yet.</div>';
        return;
      }
      blastList.innerHTML = state.blasts
        .map((blast) => {
          const statusValue = String(blast.status || 'scheduled').toLowerCase();
          const statusClassMap = {
            paused: 'bg-warning-subtle text-warning',
            canceled: 'bg-secondary-subtle text-secondary',
            completed: 'bg-success-subtle text-success',
            sending: 'bg-primary-subtle text-primary',
            scheduled: 'bg-primary-subtle text-primary',
            draft: 'bg-light text-dark border'
          };
          const statusClass = statusClassMap[statusValue] || 'bg-light text-dark border';
          const canPause = ['scheduled', 'sending'].includes(statusValue);
          const canResume = statusValue === 'paused';
          return `
          <div class="border rounded-3 p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${blast.name || 'Blast'}</div>
                <div class="text-muted small">${formatDateTime(blast.createdAt)}</div>
              </div>
              <span class="badge ${statusClass}">
                ${statusValue}
              </span>
            </div>
            <div class="small text-muted mt-2">
              Scheduled: ${blast.scheduledFor ? formatDateTime(blast.scheduledFor) : 'Now'} | Final: ${blast.finalToSend ?? 0}
            </div>
            <div class="d-flex gap-2 mt-3 flex-wrap">
              <a class="btn btn-sm btn-outline-primary" href="/email/blasts/${blast._id}">View</a>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-blast-view="${blast._id}">
                Open Queue
              </button>
              ${
                canPause
                  ? `<button type="button" class="btn btn-sm btn-outline-warning" data-blast-pause="${blast._id}">Pause</button>`
                  : ''
              }
              ${
                canResume
                  ? `<button type="button" class="btn btn-sm btn-outline-success" data-blast-resume="${blast._id}">Resume</button>`
                  : ''
              }
              ${
                blast.status === 'scheduled'
                  ? `<button type="button" class="btn btn-sm btn-outline-danger" data-blast-cancel="${blast._id}">Cancel</button>`
                  : ''
              }
            </div>
          </div>
        `;
        })
        .join('');
    }

    async function loadBlasts() {
      if (!state.emailEndpoints.blasts || !state.canManageAutomations) return;
      try {
        const response = await apiRequest(state.emailEndpoints.blasts);
        state.blasts = Array.isArray(response.blasts) ? response.blasts : [];
        renderBlasts();
      } catch (err) {
        console.error('[blasts] load failed', err);
        if (blastList) blastList.innerHTML = '<div class="text-muted small">Unable to load blasts.</div>';
      }
    }

      function resetBlastForm() {
        if (!blastForm) return;
        blastForm.reset();
        state.blastPreview = null;
        state.blastStepVisited = new Set();
        updateBlastPreviewUI({});
        updateBlastStatusCounts(null);
        if (blastConfirmation) blastConfirmation.classList.add('d-none');
        if (blastSuccessLinks) blastSuccessLinks.classList.add('d-none');
        const communityInput = blastForm.querySelector('[data-blast-community-input]') || blastForm.elements.communityIds;
        const statusInput = blastForm.querySelector('[data-blast-status-input]') || blastForm.elements.statuses;
        if (communityInput) communityInput.value = '';
        if (statusInput) statusInput.value = '';
        syncBlastPillsFromInputs();
        if (blastEmailPreviewSubject) blastEmailPreviewSubject.textContent = '--';
        if (blastEmailPreviewText) blastEmailPreviewText.textContent = '--';
        updateBlastAudienceUI();
        syncBlastRecipientType();
        clearBlastRecipientPreview();
        if (blastRecipientPanel) blastRecipientPanel.classList.add('d-none');
        updateBlastStepState();
        updateBlastConfirmationSummary();
        setBlastWorkflowStep('audience');
      }

    async function handleBlastCreate(event) {
      event.preventDefault();
      if (!blastForm) return;
      const submitButton = blastForm.querySelector('[data-blast-create]');
      const name = blastForm.elements.name.value.trim();
      const templateId = blastForm.elements.templateId.value;
      if (!isBlastPreviewReady()) {
        showToast(blastToast, 'Run preview to confirm your audience.', 'error');
        return;
      }
      if (!name) {
        showToast(blastToast, 'Blast name is required.', 'error');
        return;
      }
      if (!templateId) {
        showToast(blastToast, 'Select a template.', 'error');
        return;
      }
      if (!isBlastScheduleReady()) {
        showToast(blastToast, 'Select a valid schedule time.', 'error');
        return;
      }

      const sendMode = blastForm.elements.sendMode?.value === 'scheduled' ? 'scheduled' : 'now';
      const scheduledFor = blastForm.elements.scheduledFor?.value || null;

      if (!state.blastRequestId) {
        if (window.crypto?.randomUUID) {
          state.blastRequestId = window.crypto.randomUUID();
        } else {
          state.blastRequestId = `blast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
      }

        const payload = {
          name,
          templateId,
          audienceType: blastForm.elements.audienceType?.value || 'contacts',
          filters: collectBlastFilters(),
          sendMode,
          scheduledFor: sendMode === 'scheduled' ? scheduledFor : null,
          confirmationText: blastForm.elements.confirmationText?.value || '',
          requestId: state.blastRequestId
      };

      try {
        setLoading(submitButton, true, 'Creating...');
        const response = await apiRequest(state.emailEndpoints.blasts, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast(
          blastToast,
          response?.idempotent ? 'Blast already created; opening existing blast.' : 'Blast queued.',
          'success'
        );
        resetBlastForm();
        state.blastRequestId = null;
        await loadBlasts();
        if (response?.blastId) {
          if (blastViewQueue) {
            blastViewQueue.href = `/task?view=settings&tab=queue&blastId=${encodeURIComponent(response.blastId)}`;
          }
          if (blastViewDetails) {
            blastViewDetails.href = `/email/blasts/${encodeURIComponent(response.blastId)}`;
          }
          blastSuccessLinks?.classList.remove('d-none');
        }
      } catch (err) {
        console.error('[blasts] create failed', err);
        showToast(blastToast, err.message || 'Unable to create blast.', 'error');
      } finally {
        setLoading(submitButton, false);
      }
    }

    async function handleBlastCancel(blastId) {
      if (!blastId) return;
      try {
        await apiRequest(`${state.emailEndpoints.blasts}/${blastId}/cancel`, { method: 'POST' });
        showToast(blastToast, 'Blast canceled.', 'success');
        await loadBlasts();
      } catch (err) {
        console.error('[blasts] cancel failed', err);
        showToast(blastToast, err.message || 'Unable to cancel blast.', 'error');
      }
    }

    async function handleBlastPause(blastId) {
      if (!blastId) return;
      const blast = state.blasts.find((item) => String(item._id) === String(blastId));
      if (String(blast?.status || '').toLowerCase() === 'paused') {
        await loadBlasts();
        return;
      }
      const confirmed = window.confirm(
        'Pausing will stop remaining scheduled emails from sending. Emails already sent are not affected.'
      );
      if (!confirmed) return;
      if (blastList) {
        const btn = blastList.querySelector(`[data-blast-pause="${blastId}"]`);
        if (btn) btn.disabled = true;
      }
      try {
        await apiRequest(`${state.emailEndpoints.blasts}/${blastId}/pause`, { method: 'POST' });
        showToast(blastToast, 'Blast paused.', 'success');
        await loadBlasts();
      } catch (err) {
        console.error('[blasts] pause failed', err);
        showToast(blastToast, err.message || 'Unable to pause blast.', 'error');
      } finally {
        if (blastList) {
          const btn = blastList.querySelector(`[data-blast-pause="${blastId}"]`);
          if (btn) btn.disabled = false;
        }
      }
    }

    async function handleBlastResume(blastId) {
      if (!blastId) return;
      const blast = state.blasts.find((item) => String(item._id) === String(blastId));
      if (String(blast?.status || '').toLowerCase() !== 'paused') {
        await loadBlasts();
        return;
      }
      const confirmed = window.confirm(
        'Resuming will continue sending remaining emails using the original pacing and schedule.'
      );
      if (!confirmed) return;
      if (blastList) {
        const btn = blastList.querySelector(`[data-blast-resume="${blastId}"]`);
        if (btn) btn.disabled = true;
      }
      try {
        await apiRequest(`${state.emailEndpoints.blasts}/${blastId}/resume`, { method: 'POST' });
        showToast(blastToast, 'Blast resumed.', 'success');
        await loadBlasts();
      } catch (err) {
        console.error('[blasts] resume failed', err);
        showToast(blastToast, err.message || 'Unable to resume blast.', 'error');
      } finally {
        if (blastList) {
          const btn = blastList.querySelector(`[data-blast-resume="${blastId}"]`);
          if (btn) btn.disabled = false;
        }
      }
    }

    function handleBlastView(blastId) {
      if (!blastId) return;
      setActiveTab('queue');
      loadQueue(state.currentQueueFilter, blastId, null, null, state.currentQueueStatus);
    }

    async function loadProcessorHealth() {
      if (!state.emailEndpoints.health || !healthEnabled) return;
      if (!state.canManageAutomations) return;
      try {
        const response = await apiRequest(state.emailEndpoints.health);
        const config = response.config || {};
        const counts = response.counts || {};
        if (healthEnabled) {
          healthEnabled.textContent = config.processorEnabled ? 'Enabled' : 'Disabled';
          healthEnabled.className = `badge ${
            config.processorEnabled ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'
          }`;
        }
        if (healthPoll) healthPoll.textContent = `${config.pollMs ?? '--'} ms`;
        if (healthStale) healthStale.textContent = formatDurationMs(config.staleMs ?? NaN);
        if (healthMaxJobs) healthMaxJobs.textContent = config.maxJobsPerTick ?? '--';
        if (healthMaxAttempts) healthMaxAttempts.textContent = config.maxAttempts ?? '--';
        if (healthLogLevel) healthLogLevel.textContent = config.logLevel || '--';

        renderHealthCounts(counts);
        renderHealthFailures(response.recentFailures || []);
        renderHealthStuck(response.recentStuck || []);
        updateHealthAlert(counts.stuckProcessing || 0);
      } catch (err) {
        console.error('[automations] health load failed', err);
        if (healthToast) {
          showToast(healthToast, err.message || 'Unable to load processor health.', 'error');
        }
      }
    }

    let healthTimer = null;
    function startHealthPolling() {
      if (!state.canManageAutomations || !healthEnabled) return;
      loadProcessorHealth();
      if (healthTimer) return;
      healthTimer = window.setInterval(() => {
        if (state.currentTab === 'queue') {
          loadProcessorHealth();
        }
      }, 30000);
    }

    function stopHealthPolling() {
      if (healthTimer) {
        window.clearInterval(healthTimer);
        healthTimer = null;
      }
    }

    async function handleCommonAutomationToggle(key, action, button) {
      if (!key) return;
      if (!state.canManageAutomations) {
        showToast(commonAutomationToast, 'Company admin access required.', 'error');
        return;
      }
      const endpoint = state.emailEndpoints.commonAutomations;
      if (!endpoint) return;
      try {
        setLoading(button, true, action === 'enable' ? 'Enabling...' : 'Disabling...');
        const response = await apiRequest(`${endpoint}/${key}/${action}`, { method: 'POST' });
        if (response?.status) {
          const index = state.commonAutomations.findIndex((item) => item.key === response.status.key);
          if (index >= 0) {
            state.commonAutomations[index] = { ...state.commonAutomations[index], ...response.status };
          } else {
            state.commonAutomations.push(response.status);
          }
          renderCommonAutomations();
        } else {
          await loadCommonAutomations();
        }
        await loadRules();
        showToast(
          commonAutomationToast,
          action === 'enable' ? 'Automation enabled.' : 'Automation disabled.',
          'success'
        );
      } catch (err) {
        console.error('[automations] common automation toggle failed', err);
        showToast(commonAutomationToast, err.message || 'Unable to update automation.', 'error');
      } finally {
        setLoading(button, false);
      }
    }

    async function handleCommonAutomationEdit(ruleId) {
      if (!ruleId) return;
      if (!state.rules.length) {
        await loadRules();
      }
      let rule = state.rules.find((item) => String(item._id || item.id) === String(ruleId));
      if (!rule) {
        await loadRules();
        rule = state.rules.find((item) => String(item._id || item.id) === String(ruleId));
      }
      if (rule) {
        setActiveTab('rules');
        populateRuleForm(rule);
        ruleForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        showToast(commonAutomationToast, 'Rule not found yet. Refresh rules and try again.', 'error');
      }
    }

    function formatDateTime(value) {
      if (!value) return '--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '--';
      return date.toLocaleString();
    }

    function parseCsv(value) {
      if (typeof value !== 'string') return [];
      return value.split(',').map((part) => part.trim()).filter(Boolean);
    }

      function formatRelativeTime(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const diffMs = Date.now() - date.getTime();
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
      }

      function toInt(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function minutesFromUnit(amount, unit) {
        const safeAmount = Math.max(0, toInt(amount));
        if (unit === 'days') return safeAmount * 1440;
        if (unit === 'hours') return safeAmount * 60;
        return safeAmount;
      }

      function formatDuration(minutes) {
        const value = toInt(minutes);
        if (value <= 0) return '0 minutes';
        if (value % 1440 === 0) {
          const days = value / 1440;
          return `${days} day${days === 1 ? '' : 's'}`;
        }
        if (value % 60 === 0) {
          const hours = value / 60;
          return `${hours} hour${hours === 1 ? '' : 's'}`;
        }
        return `${value} minute${value === 1 ? '' : 's'}`;
      }

      function formatDelayLabel(minutes) {
        const value = toInt(minutes);
        if (value <= 0) return 'immediately';
        return `after ${formatDuration(value)}`;
      }

      function getRuleTemplateName(templateId) {
        if (!templateId) return 'Template';
        const match = state.templates.find((t) => String(t._id || t.id) === String(templateId));
        return match?.name || 'Template';
      }

      function setRuleDirty(flag) {
        state.ruleDirty = Boolean(flag);
      }

      function markRuleDirty() {
        if (!state.ruleDirty) setRuleDirty(true);
      }

      function confirmRuleSwitch() {
        if (!state.ruleDirty) return true;
        return window.confirm('You have unsaved changes. Switch rules and discard them?');
      }

      function syncDelayInputsFromMinutes(minutes) {
        if (!ruleDelayMode || !ruleDelayValue) return;
        const value = toInt(minutes);
        if (value <= 0) {
          ruleDelayMode.value = 'immediate';
          ruleDelayValue.value = 0;
          ruleDelayValue.disabled = true;
          return;
        }
        if (value % 1440 === 0) {
          ruleDelayMode.value = 'days';
          ruleDelayValue.value = value / 1440;
          ruleDelayValue.disabled = false;
          return;
        }
        if (value % 60 === 0) {
          ruleDelayMode.value = 'hours';
          ruleDelayValue.value = value / 60;
          ruleDelayValue.disabled = false;
          return;
        }
        ruleDelayMode.value = 'minutes';
        ruleDelayValue.value = value;
        ruleDelayValue.disabled = false;
      }

      function syncCooldownInputsFromMinutes(minutes) {
        if (!ruleCooldownValue || !ruleCooldownUnit) return;
        const value = toInt(minutes);
        if (value <= 0) {
          ruleCooldownValue.value = 0;
          ruleCooldownUnit.value = 'days';
          return;
        }
        if (value % 1440 === 0) {
          ruleCooldownUnit.value = 'days';
          ruleCooldownValue.value = value / 1440;
          return;
        }
        if (value % 60 === 0) {
          ruleCooldownUnit.value = 'hours';
          ruleCooldownValue.value = value / 60;
          return;
        }
        ruleCooldownUnit.value = 'minutes';
        ruleCooldownValue.value = value;
      }

      function updateRuleTimingFromInputs() {
        if (!ruleForm || !ruleDelayMode || !ruleDelayValue) return;
        const mode = ruleDelayMode.value;
        if (mode === 'immediate') {
          ruleForm.elements.delayMinutes.value = '0';
          ruleDelayValue.disabled = true;
        } else {
          ruleDelayValue.disabled = false;
          ruleForm.elements.delayMinutes.value = String(minutesFromUnit(ruleDelayValue.value, mode));
        }
        if (ruleCooldownValue && ruleCooldownUnit) {
          ruleForm.elements.cooldownMinutes.value = String(
            minutesFromUnit(ruleCooldownValue.value, ruleCooldownUnit.value)
          );
        }
        renderRuleTimeline();
      }

      function renderRuleTimeline() {
        if (!ruleTimeline || !ruleForm) return;
        const toStatus = ruleForm.elements.toStatus?.value || 'a status';
        const delayMinutes = toInt(ruleForm.elements.delayMinutes?.value || 0);
        const delay = formatDelayLabel(delayMinutes);
        const cooldownValue = toInt(ruleForm.elements.cooldownMinutes?.value || 0);
        const cooldownLine = cooldownValue > 0 ? `→ cooldown ${formatDuration(cooldownValue)}` : '→ no cooldown';
        const waitLine = delayMinutes > 0 ? `→ wait ${delay}` : '→ send immediately';
        ruleTimeline.textContent = `Status becomes ${toStatus} ${waitLine} → send email ${cooldownLine}`;
      }

    function stripHtmlToText(html) {
      if (!html) return '';
      const temp = document.createElement('div');
      temp.innerHTML = html;
      return (temp.textContent || temp.innerText || '').trim();
    }

    function initTemplateEditor() {
      if (!templateEditorWrap || templateEditor || !window.Quill) return;
      templateEditor = new window.Quill('#templateEditor', {
        theme: 'snow',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link']
          ]
        }
      });

      templateEditor.on('text-change', () => {
        if (!templateForm) return;
        const html = templateEditor.root.innerHTML || '';
        if (templateForm.elements.html) templateForm.elements.html.value = html;
        if (templateForm.elements.htmlRaw && !templateAdvancedToggle?.checked) {
          templateForm.elements.htmlRaw.value = html;
        }
        markTemplateDirty();
      });

      templateEditor.root.addEventListener('focus', () => {
        templateEditorTarget = 'body';
      });
    }

    function setAdvancedMode(enabled) {
      templateAdvancedFields?.forEach((field) => {
        field.classList.toggle('d-none', !enabled);
      });
      if (!templateForm || !templateEditor) return;
      if (enabled) {
        const html = templateEditor.root.innerHTML || '';
        if (templateForm.elements.htmlRaw) templateForm.elements.htmlRaw.value = html;
      } else if (templateForm.elements.htmlRaw) {
        const html = templateForm.elements.htmlRaw.value || '';
        templateEditor.root.innerHTML = html;
        if (templateForm.elements.html) templateForm.elements.html.value = html;
      }
    }

    function insertTemplateToken(value) {
      if (!value) return;
      if (templateEditorTarget === 'subject' && templateForm?.elements.subject) {
        const input = templateForm.elements.subject;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
        input.focus();
        const cursor = start + value.length;
        input.setSelectionRange(cursor, cursor);
        return;
      }
      if (!templateEditor) return;
      const range = templateEditor.getSelection(true);
      const index = range ? range.index : templateEditor.getLength();
      templateEditor.insertText(index, value, 'user');
      templateEditor.setSelection(index + value.length, 0, 'user');
    }

    const TOKEN_GROUPS = [
      {
        label: 'Contact',
        tokens: [
          { label: 'First name', value: '{{contact.firstName}}' },
          { label: 'Last name', value: '{{contact.lastName}}' },
          { label: 'Status', value: '{{contact.status}}' }
        ]
      },
      {
        label: 'Realtor',
        tokens: [
          { label: 'First name', value: '{{realtor.firstName}}' },
          { label: 'Last name', value: '{{realtor.lastName}}' },
          { label: 'Company', value: '{{realtor.company}}' }
        ]
      },
      {
        label: 'Community',
        tokens: [
          { label: 'Name', value: '{{community.name}}' },
          { label: 'City', value: '{{community.city}}' }
        ]
      },
      {
        label: 'Lot',
        tokens: [
          { label: 'Address', value: '{{lot.address}}' },
          { label: 'Price', value: '{{lot.price}}' }
        ]
      },
      {
        label: 'Links',
        tokens: [
          { label: 'Schedule URL', value: '{{links.scheduleUrl}}' },
          { label: 'BuildRootz URL', value: '{{links.buildRootzUrl}}' }
        ]
      }
    ];

    const RECENT_TOKENS_KEY = 'keepup.templateTokens.recent';

    function getRecentTokens() {
      try {
        const raw = window.localStorage.getItem(RECENT_TOKENS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    function setRecentTokens(tokens) {
      try {
        window.localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(tokens));
      } catch {}
    }

    function addRecentToken(token) {
      const recent = getRecentTokens().filter((item) => item.value !== token.value);
      recent.unshift(token);
      setRecentTokens(recent.slice(0, 5));
    }

    function renderTokenGroup(group, filter) {
      const terms = filter.trim().toLowerCase();
      const tokens = group.tokens.filter((token) => {
        if (!terms) return true;
        return token.label.toLowerCase().includes(terms)
          || token.value.toLowerCase().includes(terms);
      });
      if (!tokens.length) return '';
      const rows = tokens
        .map((token) => `
          <div class="d-flex align-items-center justify-content-between border rounded-3 p-2">
            <div>
              <div class="fw-semibold">${token.label}</div>
              <div class="small text-muted font-monospace">${token.value}</div>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-primary" data-token-insert="${token.value}">Insert</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-token-copy="${token.value}">Copy</button>
            </div>
          </div>
        `)
        .join('');
      return `
        <div>
          <div class="text-uppercase text-muted fw-semibold small mb-2">${group.label}</div>
          <div class="vstack gap-2">${rows}</div>
        </div>
      `;
    }

    function renderTokenPicker(filter = '') {
      if (!tokenList) return;
      const sections = TOKEN_GROUPS
        .map((group) => renderTokenGroup(group, filter))
        .filter(Boolean)
        .join('');
      tokenList.innerHTML = sections || '<div class="text-muted small">No tokens match your search.</div>';
    }

    function renderRecentTokens() {
      if (!tokenRecentWrap || !tokenRecentList) return;
      const recent = getRecentTokens();
      if (!recent.length) {
        tokenRecentWrap.classList.add('d-none');
        tokenRecentList.innerHTML = '';
        return;
      }
      tokenRecentWrap.classList.remove('d-none');
      tokenRecentList.innerHTML = recent
        .map((token) => `
          <div class="d-flex align-items-center justify-content-between border rounded-3 p-2">
            <div>
              <div class="fw-semibold">${token.label}</div>
              <div class="small text-muted font-monospace">${token.value}</div>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-primary" data-token-insert="${token.value}" data-token-label="${token.label}">Insert</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-token-copy="${token.value}" data-token-label="${token.label}">Copy</button>
            </div>
          </div>
        `)
        .join('');
    }

    function openTokenModal() {
      if (!tokenModal) return;
      tokenModal.classList.add('show');
      tokenModal.style.display = 'block';
      tokenModal.removeAttribute('aria-hidden');
      document.body.classList.add('modal-open');
      renderRecentTokens();
      renderTokenPicker(tokenSearch?.value || '');
      setTimeout(() => tokenSearch?.focus(), 0);
    }

    function closeTokenModal() {
      if (!tokenModal) return;
      tokenModal.classList.remove('show');
      tokenModal.style.display = 'none';
      tokenModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }

    function openImageModal() {
      if (!imageModal) return;
      imageModal.classList.add('show');
      imageModal.style.display = 'block';
      imageModal.removeAttribute('aria-hidden');
      document.body.classList.add('modal-open');
      loadImageLibrary();
      setActiveImageTab('library');
    }

    function closeImageModal() {
      if (!imageModal) return;
      imageModal.classList.remove('show');
      imageModal.style.display = 'none';
      imageModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (imageFileInput) imageFileInput.value = '';
      if (imagePreviewWrap) imagePreviewWrap.classList.add('d-none');
    }

      function openRuleTestModal() {
        if (!ruleTestModal) return;
        if (!state.activeRuleId) {
          showToast(ruleToast, 'Select a rule first.', 'error');
          return;
        }
        ruleTestModal.classList.add('show');
        ruleTestModal.style.display = 'block';
        ruleTestModal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        clearRuleTestResult();
        if (ruleTestStatus && ruleForm?.elements.toStatus) {
          ruleTestStatus.value = ruleForm.elements.toStatus.value || ruleTestStatus.value;
        }
        setTimeout(() => ruleTestSearch?.focus(), 0);
      }

    function closeRuleTestModal() {
      if (!ruleTestModal) return;
      ruleTestModal.classList.remove('show');
      ruleTestModal.style.display = 'none';
      ruleTestModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }

    function clearRuleTestResult() {
      if (ruleTestResult) ruleTestResult.classList.add('d-none');
      if (ruleTestOutcome) ruleTestOutcome.textContent = '--';
      if (ruleTestSchedule) ruleTestSchedule.textContent = '--';
      if (ruleTestNotes) ruleTestNotes.textContent = '--';
      if (ruleTestReasons) ruleTestReasons.innerHTML = '';
      if (ruleTestActions) ruleTestActions.classList.add('d-none');
    }

    function updateRuleTestLinks(contactId) {
      if (!ruleTestActions || !ruleTestViewContact || !ruleTestOpenQueue) return;
      if (!contactId) {
        ruleTestActions.classList.add('d-none');
        ruleTestViewContact.removeAttribute('href');
        ruleTestOpenQueue.removeAttribute('href');
        return;
      }
      ruleTestViewContact.href = `/contact-details?id=${encodeURIComponent(contactId)}`;
      ruleTestOpenQueue.href = `/task?view=settings&tab=queue&contactId=${encodeURIComponent(contactId)}`;
      ruleTestActions.classList.remove('d-none');
    }

    function renderRuleTestResult(payload) {
      if (!ruleTestResult || !payload) return;
      const wouldEnqueue = Boolean(payload.wouldEnqueue);
      const sendAt = payload.wouldSendAt ? formatDateTime(payload.wouldSendAt) : '--';
      ruleTestOutcome.textContent = wouldEnqueue ? 'Will enqueue email' : 'Will NOT enqueue email';
      ruleTestOutcome.className = `fw-semibold mb-1 ${wouldEnqueue ? 'text-success' : 'text-danger'}`;
      ruleTestSchedule.textContent = wouldEnqueue ? `Scheduled send time: ${sendAt}` : 'Not scheduled';
      ruleTestNotes.textContent = payload.context?.mustStillMatchAtSend
        ? 'Must still match at send time: ON'
        : 'Must still match at send time: OFF';
      const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
      if (reasons.length) {
        ruleTestReasons.innerHTML = reasons
          .map((reason) => `
            <div class="small ${reason.level === 'block' ? 'text-danger' : 'text-muted'}">
              ${reason.message}
            </div>
          `)
          .join('');
      } else {
        ruleTestReasons.innerHTML = '<div class="small text-muted">No blocking reasons.</div>';
      }
      ruleTestResult.classList.remove('d-none');
    }

    function setActiveImageTab(tab) {
      imageTabs?.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.imageTab === tab);
      });
      imagePanels?.forEach((panel) => {
        panel.classList.toggle('d-none', panel.dataset.imagePanel !== tab);
      });
    }

    async function loadImageLibrary() {
      if (!imageLibrary) return;
      imageLibrary.innerHTML = '<div class="text-muted small">Loading images...</div>';
      try {
        const response = await apiRequest('/api/email/assets?kind=image');
        state.emailAssets = Array.isArray(response.assets) ? response.assets : [];
        if (!state.emailAssets.length) {
          imageLibrary.innerHTML = '<div class="text-muted small">No images uploaded yet.</div>';
          return;
        }
        imageLibrary.innerHTML = state.emailAssets
          .map((asset) => `
            <div class="col-6">
              <button type="button" class="btn btn-light w-100 text-start border" data-image-select="${asset.url}">
                <img src="${asset.url}" alt="" class="img-fluid rounded mb-2" />
                <div class="small text-muted text-truncate">${asset.originalName || 'Image'}</div>
              </button>
            </div>
          `)
          .join('');
      } catch (err) {
        console.error('[templates] load images failed', err);
        imageLibrary.innerHTML = '<div class="text-muted small">Unable to load images.</div>';
      }
    }

    async function handleImageUpload() {
      if (!imageFileInput?.files?.length) {
        showToast(templateToast, 'Choose an image to upload.', 'error');
        return;
      }
      const file = imageFileInput.files[0];
      const formData = new FormData();
      formData.append('image', file);
      try {
        await apiRequest('/api/email/assets/upload', {
          method: 'POST',
          body: formData
        });
        showToast(templateToast, 'Image uploaded.', 'success');
        imageFileInput.value = '';
        if (imagePreviewWrap) imagePreviewWrap.classList.add('d-none');
        setActiveImageTab('library');
        await loadImageLibrary();
      } catch (err) {
        console.error('[templates] image upload failed', err);
        showToast(templateToast, err.message || 'Image upload failed.', 'error');
      }
    }

    function insertImage(url) {
      if (!url || !templateEditor) return;
      const alt = window.prompt('Alt text (optional):', 'Image') || 'Image';
      const index = templateEditor.getSelection(true)?.index ?? templateEditor.getLength();
      const html = `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;display:block;" />`;
      templateEditor.clipboard.dangerouslyPasteHTML(index, html);
      markTemplateDirty();
    }

    async function copyToken(value, label) {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast(templateToast, 'Copied token.', 'success');
      } catch {
        showToast(templateToast, 'Unable to copy token.', 'error');
      }
      if (label) addRecentToken({ label, value });
    }

    function setTemplateDirty(isDirty) {
      state.templateDirty = Boolean(isDirty);
      if (templateSaved) {
        templateSaved.textContent = isDirty
          ? 'Unsaved changes'
          : (state.templateLastSavedAt ? `Saved ${formatRelativeTime(state.templateLastSavedAt)}` : 'Not saved yet');
      }
      if (templateForm?.querySelector('[data-template-save]')) {
        const saveBtn = templateForm.querySelector('[data-template-save]');
        saveBtn.disabled = !isDirty;
      }
    }

    function setTemplateFormEnabled(enabled) {
      if (!templateForm) return;
      const fields = templateForm.querySelectorAll('input, textarea, select, button');
      fields.forEach((field) => {
        if (field.matches('[data-template-restore]')) return;
        if (field.matches('[data-template-archive]')) return;
        field.disabled = !enabled;
      });
      if (templateArchive) templateArchive.disabled = !enabled;
      if (templateDuplicate) templateDuplicate.disabled = !enabled;
      if (templateSendTest) templateSendTest.disabled = !enabled;
    }

    function resetTemplateForm() {
      if (!templateForm) return;
      templateForm.reset();
      templateForm.elements.templateId.value = '';
      state.activeTemplateId = null;
      if (templateEditor) {
        templateEditor.root.innerHTML = '';
      }
      if (templateForm.elements.html) templateForm.elements.html.value = '';
      if (templateForm.elements.htmlRaw) templateForm.elements.htmlRaw.value = '';
      state.templateLastSavedAt = null;
      if (templateRestore) templateRestore.classList.add('d-none');
      if (templateArchive) templateArchive.classList.remove('d-none');
      setTemplateFormEnabled(true);
      setTemplateDirty(false);
    }

    function populateTemplateForm(template) {
      if (!templateForm || !template) return;
      state.activeTemplateId = template._id || template.id || null;
      templateForm.elements.templateId.value = state.activeTemplateId || '';
      templateForm.elements.name.value = template.name || '';
      templateForm.elements.type.value = template.type || 'automation';
      templateForm.elements.subject.value = template.subject || '';
      if (templateForm.elements.previewText) templateForm.elements.previewText.value = template.previewText || '';
      templateForm.elements.html.value = template.html || '';
      if (templateForm.elements.htmlRaw) templateForm.elements.htmlRaw.value = template.html || '';
      templateForm.elements.text.value = template.text || '';
      templateForm.elements.isActive.checked = template.isActive !== false;
      if (templateEditor) {
        templateEditor.root.innerHTML = template.html || '';
      }
      if (template.isArchived) {
        if (templateRestore) templateRestore.classList.remove('d-none');
        if (templateArchive) templateArchive.classList.add('d-none');
        setTemplateFormEnabled(false);
      } else {
        if (templateRestore) templateRestore.classList.add('d-none');
        if (templateArchive) templateArchive.classList.remove('d-none');
        setTemplateFormEnabled(true);
      }
      state.templateLastSavedAt = template.updatedAt || template.createdAt || null;
      setTemplateDirty(false);
    }

    function renderTemplateList() {
      if (!templateList) return;
      const search = state.templateSearch.trim().toLowerCase();
      const filterType = state.templateFilter;
      const filtered = state.templates.filter((template) => {
        if (filterType !== 'all' && template.type !== filterType) return false;
        if (!search) return true;
        const haystack = `${template.name || ''} ${template.subject || ''}`.toLowerCase();
        return haystack.includes(search);
      });
      if (!filtered.length) {
        templateList.innerHTML = state.templates.length
          ? '<div class="text-muted small">No templates match your filters.</div>'
          : '<div class="text-muted small">No templates saved yet.</div>';
        return;
      }
      templateList.innerHTML = filtered
        .map((template) => `
          <button type="button" class="border rounded-3 p-3 text-start bg-white template-list-item ${String(state.activeTemplateId) === String(template._id || template.id) ? 'border-primary' : ''}" data-template-edit="${template._id || template.id}">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${template.name || 'Untitled'}</div>
                <div class="text-muted small">${template.subject || 'No subject'}</div>
                <span class="badge bg-light text-dark border text-uppercase">${template.type || 'automation'}</span>
                ${template.isArchived ? '<span class="badge bg-secondary-subtle text-secondary ms-2">Archived</span>' : ''}
                <span class="text-muted small ms-2">${formatRelativeTime(template.updatedAt || template.createdAt)}</span>
              </div>
              <span class="badge ${template.isActive ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}">
                ${template.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </button>
        `)
        .join('');
    }

    function confirmTemplateSwitch() {
      if (!state.templateDirty) return true;
      return window.confirm('You have unsaved changes. Switch templates and discard them?');
    }

    function markTemplateDirty() {
      if (!state.templateDirty) setTemplateDirty(true);
    }

    async function handleTemplateDuplicate() {
      if (!state.activeTemplateId) {
        showToast(templateToast, 'Select a template to duplicate.', 'error');
        return;
      }
      const template = state.templates.find(
        (item) => String(item._id || item.id) === String(state.activeTemplateId)
      );
      if (!template) return;
      const payload = {
        name: `${template.name || 'Template'} (Copy)`,
        type: template.type || 'automation',
        subject: template.subject || '',
        previewText: template.previewText || '',
        html: template.html || '',
        text: template.text || '',
        isActive: template.isActive !== false
      };
      try {
        await apiRequest(state.emailEndpoints.templates, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast(templateToast, 'Template duplicated.', 'success');
        await loadTemplates();
        const newest = state.templates[0];
        if (newest) populateTemplateForm(newest);
      } catch (err) {
        console.error('[automations] template duplicate failed', err);
        showToast(templateToast, err.message || 'Unable to duplicate template.', 'error');
      }
    }

    function buildUsageMessage(usage) {
      if (!usage) return 'Template is in use.';
      const sections = [];
      if (Array.isArray(usage.rules) && usage.rules.length) {
        sections.push(`Rules: ${usage.rules.map((r) => r.name || r._id).join(', ')}`);
      }
      if (Array.isArray(usage.schedules) && usage.schedules.length) {
        sections.push(`Schedules: ${usage.schedules.map((s) => s.name || s._id).join(', ')}`);
      }
      if (Array.isArray(usage.commonAutomations) && usage.commonAutomations.length) {
        sections.push(`Common automations: ${usage.commonAutomations.map((c) => c.label || c.key).join(', ')}`);
      }
      return sections.length ? `Template is in use.\n${sections.join('\n')}` : 'Template is in use.';
    }

    async function handleTemplateArchive() {
      if (!state.activeTemplateId) {
        showToast(templateToast, 'Select a template first.', 'error');
        return;
      }
      const confirmed = window.confirm('Archive this template? It will disappear from the library but can be restored.');
      if (!confirmed) return;
      try {
        await apiRequest(`${state.emailEndpoints.templates}/${state.activeTemplateId}/archive`, {
          method: 'POST',
          body: JSON.stringify({ archived: true })
        });
        showToast(templateToast, 'Template archived.', 'success');
        await loadTemplates();
        resetTemplateForm();
      } catch (err) {
        if (err?.data?.usage) {
          window.alert(buildUsageMessage(err.data.usage));
          return;
        }
        showToast(templateToast, err.message || 'Unable to archive template.', 'error');
      }
    }

    async function handleTemplateRestore() {
      if (!state.activeTemplateId) return;
      try {
        await apiRequest(`${state.emailEndpoints.templates}/${state.activeTemplateId}/archive`, {
          method: 'POST',
          body: JSON.stringify({ archived: false })
        });
        showToast(templateToast, 'Template restored.', 'success');
        await loadTemplates();
        const restored = state.templates.find(
          (item) => String(item._id || item.id) === String(state.activeTemplateId)
        );
        if (restored) populateTemplateForm(restored);
      } catch (err) {
        showToast(templateToast, err.message || 'Unable to restore template.', 'error');
      }
    }

    async function handleTemplateSendTest() {
      if (!state.activeTemplateId) {
        showToast(templateToast, 'Select a template first.', 'error');
        return;
      }
      const defaultEmail = state.currentUserEmail || '';
      const toEmail = window.prompt('Send test email to:', defaultEmail);
      if (!toEmail) return;
      const recipientType = templatePreviewRecipient?.value === 'realtor' ? 'realtor' : 'contact';
      const recipientId = templatePreviewContact?.value || null;
      try {
        const response = await apiRequest(`${state.emailEndpoints.templates}/${state.activeTemplateId}/send-test`, {
          method: 'POST',
          body: JSON.stringify({ toEmail, recipientType, recipientId })
        });
        showToast(templateToast, 'Test email sent.', 'success');
        return response;
      } catch (err) {
        console.error('[automations] send test failed', err);
        showToast(templateToast, err.message || 'Test email failed.', 'error');
      }
    }

    async function loadTemplates() {
      try {
        const url = state.templateShowArchived
          ? `${state.emailEndpoints.templates}?includeArchived=true`
          : state.emailEndpoints.templates;
        const response = await apiRequest(url);
        state.templates = Array.isArray(response.templates) ? response.templates : [];
        renderTemplateList();
        refreshTemplateSelects();
      } catch (err) {
        console.error('[automations] failed to load templates', err);
        if (templateList) {
          templateList.innerHTML = '<div class="text-muted small">Unable to load templates.</div>';
        }
      }
    }

    async function handleTemplateSave(event) {
      event.preventDefault();
      if (!templateForm) return;
      if (templateEditor) {
        const html = templateEditor.root.innerHTML || '';
        templateForm.elements.html.value = html;
        if (templateForm.elements.htmlRaw && !templateAdvancedToggle?.checked) {
          templateForm.elements.htmlRaw.value = html;
        }
      }
      const htmlValue = templateAdvancedToggle?.checked
        ? (templateForm.elements.htmlRaw?.value || '')
        : (templateForm.elements.html?.value || '');
      const textValue = templateForm.elements.text?.value || stripHtmlToText(htmlValue);
      const payload = {
        name: templateForm.elements.name.value.trim(),
        type: templateForm.elements.type.value,
        subject: templateForm.elements.subject.value,
        previewText: templateForm.elements.previewText?.value || '',
        html: htmlValue,
        text: textValue,
        isActive: templateForm.elements.isActive.checked
      };
      if (!payload.name) {
        showToast(templateToast, 'Template name is required.', 'error');
        return;
      }
      const templateId = templateForm.elements.templateId.value;
      const url = templateId
        ? `${state.emailEndpoints.templates}/${templateId}`
        : state.emailEndpoints.templates;
      try {
        await apiRequest(url, {
          method: templateId ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        showToast(templateToast, templateId ? 'Template updated.' : 'Template created.', 'success');
        await loadTemplates();
        if (!templateId) {
          const newest = state.templates[0];
          if (newest) populateTemplateForm(newest);
        } else {
          const updated = state.templates.find((item) => String(item._id || item.id) === String(templateId));
          if (updated) populateTemplateForm(updated);
        }
      } catch (err) {
        console.error('[automations] template save failed', err);
        showToast(templateToast, err.message || 'Unable to save template.', 'error');
      }
    }

    async function handleTemplatePreviewSearch() {
      if (!templatePreviewSearch || !templatePreviewContact) return;
      const query = templatePreviewSearch.value.trim();
      if (!query) return;
      try {
        const recipientType = templatePreviewRecipient?.value === 'realtor' ? 'realtor' : 'contact';
        const url = recipientType === 'realtor'
          ? `/api/realtors/search?q=${encodeURIComponent(query)}`
          : `${state.emailEndpoints.contacts}?q=${encodeURIComponent(query)}`;
        const results = await apiRequest(url);
        templatePreviewContact.innerHTML = '<option value="">Choose a recipient</option>';
        (Array.isArray(results) ? results : []).forEach((item) => {
          const option = document.createElement('option');
          option.value = item._id;
          const name = [item.firstName, item.lastName].filter(Boolean).join(' ');
          option.textContent = `${name || item.email || 'Recipient'}${item.email ? ` - ${item.email}` : ''}`;
          templatePreviewContact.appendChild(option);
        });
      } catch (err) {
        console.error('[automations] preview search failed', err);
      }
    }

    async function handleTemplatePreview() {
      if (!templatePreviewRun) return;
      const templateId = templateForm?.elements.templateId.value || state.activeTemplateId;
      if (!templateId) {
        showToast(templateToast, 'Select or save a template first.', 'error');
        return;
      }
      const recipientId = templatePreviewContact?.value || null;
      const recipientType = templatePreviewRecipient?.value === 'realtor' ? 'realtor' : 'contact';
      try {
        const response = await apiRequest(`${state.emailEndpoints.templates}/${templateId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ recipientType, recipientId })
        });
        if (templatePreviewSubject) templatePreviewSubject.textContent = response.rendered?.subject || '--';
        if (templatePreviewText) templatePreviewText.textContent = response.rendered?.text || '--';
        if (templatePreviewHtml) templatePreviewHtml.innerHTML = response.rendered?.html || '--';
        if (templatePreviewMissing && templatePreviewMissingList) {
          const missing = Array.isArray(response.missingTokens) ? response.missingTokens : [];
          if (missing.length) {
            templatePreviewMissing.classList.remove('d-none');
            templatePreviewMissingList.textContent = missing.join(', ');
          } else {
            templatePreviewMissing.classList.add('d-none');
            templatePreviewMissingList.textContent = '—';
          }
        }
      } catch (err) {
        console.error('[automations] preview failed', err);
        showToast(templateToast, err.message || 'Preview failed.', 'error');
      }
    }

      function resetRuleForm() {
        if (!ruleForm) return;
        ruleForm.reset();
        ruleForm.elements.ruleId.value = '';
        state.activeRuleId = null;
        if (ruleForm.elements.delayMinutes) ruleForm.elements.delayMinutes.value = '0';
        if (ruleForm.elements.cooldownMinutes) ruleForm.elements.cooldownMinutes.value = '0';
        if (ruleForm.elements.isEnabled) ruleForm.elements.isEnabled.checked = true;
        if (ruleForm.elements.mustStillMatchAtSend) ruleForm.elements.mustStillMatchAtSend.checked = true;
        syncDelayInputsFromMinutes(0);
        syncCooldownInputsFromMinutes(0);
        renderRuleTimeline();
        setRuleDirty(false);
      }

      function populateRuleForm(rule) {
        if (!ruleForm || !rule) return;
        state.activeRuleId = rule._id || rule.id || null;
        ruleForm.elements.ruleId.value = state.activeRuleId || '';
        ruleForm.elements.name.value = rule.name || '';
        ruleForm.elements.fromStatus.value = rule.trigger?.config?.fromStatus || '';
        ruleForm.elements.toStatus.value = rule.trigger?.config?.toStatus || '';
        ruleForm.elements.communityId.value = rule.trigger?.config?.communityId || '';
        if (ruleForm.elements.templateId) {
          ruleForm.elements.templateId.value = rule.action?.templateId || '';
        }
        ruleForm.elements.delayMinutes.value = rule.action?.delayMinutes || 0;
        ruleForm.elements.cooldownMinutes.value = rule.action?.cooldownMinutes || 0;
        ruleForm.elements.isEnabled.checked = rule.isEnabled !== false;
        ruleForm.elements.mustStillMatchAtSend.checked = rule.action?.mustStillMatchAtSend !== false;
        syncDelayInputsFromMinutes(ruleForm.elements.delayMinutes.value || 0);
        syncCooldownInputsFromMinutes(ruleForm.elements.cooldownMinutes.value || 0);
        renderRuleTimeline();
        setRuleDirty(false);
      }

      function renderRuleList() {
        if (!ruleList) return;
        if (!state.rules.length) {
          ruleList.innerHTML = '<div class="text-muted small">No rules configured yet.</div>';
          return;
        }
        ruleList.innerHTML = state.rules
          .map((rule) => `
            <button type="button" class="rule-card ${String(state.activeRuleId) === String(rule._id || rule.id) ? 'is-active' : ''} ${rule.isEnabled ? '' : 'is-muted'}" data-rule-edit="${rule._id || rule.id}">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${rule.name || 'Untitled Rule'}</div>
                  <div class="text-muted small">
                    When status becomes ${rule.trigger?.config?.toStatus || 'Any'} -> send '${getRuleTemplateName(rule.action?.templateId)}' ${formatDelayLabel(rule.action?.delayMinutes || 0)}
                  </div>
                </div>
                <span class="badge ${rule.isEnabled ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}">
                  ${rule.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-2">
                ${rule.action?.mustStillMatchAtSend ? '<span class="badge bg-info-subtle text-info">Must match at send</span>' : ''}
                ${rule.action?.cooldownMinutes ? `<span class="badge bg-light text-dark border">Cooldown: ${formatDuration(rule.action?.cooldownMinutes)}</span>` : ''}
              </div>
            </button>
          `)
          .join('');
      }

      async function loadRules() {
        try {
          const response = await apiRequest(state.emailEndpoints.rules);
          state.rules = Array.isArray(response.rules) ? response.rules : [];
          renderRuleList();
        } catch (err) {
          console.error('[automations] failed to load rules', err);
          if (ruleList) {
            ruleList.innerHTML = '<div class="text-muted small">Unable to load rules.</div>';
          }
        }
      }

      async function openTemplateFromRule() {
        if (!ruleForm?.elements.templateId?.value) {
          showToast(ruleToast, 'Select a template first.', 'error');
          return;
        }
        const templateId = ruleForm.elements.templateId.value;
        if (!templateId) return;
        if (!state.templates.length) {
          await loadTemplates();
        }
        const match = state.templates.find((item) => String(item._id || item.id) === String(templateId));
        if (match) {
          setActiveTab('templates');
          populateTemplateForm(match);
          renderTemplateList();
          templateForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          showToast(ruleToast, 'Template not found.', 'error');
        }
      }

      async function handleRuleSave(event) {
        event.preventDefault();
        if (!ruleForm) return;
        updateRuleTimingFromInputs();
        const payload = {
          name: ruleForm.elements.name.value.trim(),
          isEnabled: ruleForm.elements.isEnabled.checked,
          trigger: {
            type: 'contact.status.changed',
            config: {
              fromStatus: ruleForm.elements.fromStatus.value || undefined,
              toStatus: ruleForm.elements.toStatus.value || undefined,
              communityId: ruleForm.elements.communityId.value || undefined
            }
          },
          action: {
            type: 'sendEmail',
            templateId: ruleForm.elements.templateId.value,
            delayMinutes: Number(ruleForm.elements.delayMinutes.value || 0),
            cooldownMinutes: Number(ruleForm.elements.cooldownMinutes.value || 0),
            mustStillMatchAtSend: ruleForm.elements.mustStillMatchAtSend.checked
          }
        };

        if (!payload.name) {
          showToast(ruleToast, 'Rule name is required.', 'error');
          return;
        }
        if (!payload.action.templateId) {
          showToast(ruleToast, 'Select a template.', 'error');
          return;
        }

        const ruleId = ruleForm.elements.ruleId.value;
        const url = ruleId ? `${state.emailEndpoints.rules}/${ruleId}` : state.emailEndpoints.rules;

        try {
          await apiRequest(url, {
            method: ruleId ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
          });
          showToast(ruleToast, ruleId ? 'Rule updated.' : 'Rule created.', 'success');
          resetRuleForm();
          await loadRules();
        } catch (err) {
          console.error('[automations] rule save failed', err);
          showToast(ruleToast, err.message || 'Unable to save rule.', 'error');
        }
      }

      async function searchRuleTestContacts() {
        if (!ruleTestSearch || !ruleTestContact) return;
        const query = ruleTestSearch.value.trim();
        if (!query) return;
        ruleTestContact.innerHTML = '<option value="">Searching...</option>';
        try {
          const response = await apiRequest(`/api/contacts/search?q=${encodeURIComponent(query)}`);
          const contacts = Array.isArray(response.contacts) ? response.contacts : response;
          if (!Array.isArray(contacts) || !contacts.length) {
            ruleTestContact.innerHTML = '<option value="">No matches found</option>';
            return;
          }
          ruleTestContact.innerHTML = '<option value="">Select a contact</option>';
          contacts.forEach((contact) => {
            const option = document.createElement('option');
            option.value = contact._id || contact.id;
            option.textContent = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
              || contact.email
              || 'Unnamed contact';
            ruleTestContact.appendChild(option);
          });
        } catch (err) {
          console.error('[rules] contact search failed', err);
          ruleTestContact.innerHTML = '<option value="">Search failed</option>';
        }
      }

    async function runRuleSimulation() {
        if (!state.activeRuleId) {
          showToast(ruleToast, 'Select a rule first.', 'error');
          return;
        }
        const contactId = ruleTestContact?.value;
        if (!contactId) {
          showToast(ruleToast, 'Select a contact to test.', 'error');
          return;
        }
        try {
          clearRuleTestResult();
          const payload = {
            contactId,
            assumeToStatus: ruleTestStatus?.value || undefined
          };
        updateRuleTestLinks(contactId);
        const response = await apiRequest(
          `${state.emailEndpoints.rules}/${state.activeRuleId}/simulate`,
          { method: 'POST', body: JSON.stringify(payload) }
        );
        renderRuleTestResult(response);
        } catch (err) {
          console.error('[rules] simulate failed', err);
          showToast(ruleToast, err.message || 'Rule test failed.', 'error');
        }
      }

      async function loadQueue(
        bucket = state.currentQueueFilter,
        blastId = state.currentQueueBlastId,
        contactId = state.currentQueueContactId,
        realtorId = state.currentQueueRealtorId,
        status = state.currentQueueStatus
      ) {
        if (!queueList) return;
        state.currentQueueFilter = bucket;
        state.currentQueueBlastId = blastId || null;
        state.currentQueueContactId = contactId || null;
        state.currentQueueRealtorId = realtorId || null;
        state.currentQueueStatus = status || '';
        renderQueueFilterChips();
        updateQueueUrl();
        queueList.innerHTML = '<tr><td colspan="7" class="text-muted small">Loading queue...</td></tr>';
        try {
          const qs = new URLSearchParams({ bucket: bucket || 'today' });
          if (state.currentQueueBlastId) {
            qs.set('blastId', state.currentQueueBlastId);
          }
          if (state.currentQueueContactId) {
            qs.set('contactId', state.currentQueueContactId);
          }
          if (state.currentQueueRealtorId) {
            qs.set('realtorId', state.currentQueueRealtorId);
          }
          if (state.currentQueueStatus) {
            qs.set('status', state.currentQueueStatus);
          }
        const response = await apiRequest(`${state.emailEndpoints.queue}?${qs.toString()}`);
        state.queue = Array.isArray(response.jobs) ? response.jobs : [];
        renderQueue();
      } catch (err) {
        console.error('[automations] queue load failed', err);
        queueList.innerHTML = '<tr><td colspan="7" class="text-muted small">Unable to load queue.</td></tr>';
      }
    }

    function renderQueueSummary() {
      const counts = {
        total: state.queue.length,
        queued: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        canceled: 0
      };
      state.queue.forEach((job) => {
        const status = String(job.status || '').toLowerCase();
        if (counts[status] != null) counts[status] += 1;
      });
      if (queueSummary) queueSummary.textContent = `Total: ${counts.total}`;
      if (queueSummaryQueued) queueSummaryQueued.textContent = `Queued: ${counts.queued}`;
      if (queueSummaryProcessing) queueSummaryProcessing.textContent = `Processing: ${counts.processing}`;
      if (queueSummarySent) queueSummarySent.textContent = `Sent: ${counts.sent}`;
      if (queueSummaryFailed) queueSummaryFailed.textContent = `Failed: ${counts.failed}`;
      if (queueSummarySkipped) queueSummarySkipped.textContent = `Skipped: ${counts.skipped}`;
      if (queueSummaryCanceled) queueSummaryCanceled.textContent = `Canceled: ${counts.canceled}`;
    }

    function updateQueueUrl() {
      const qs = new URLSearchParams(window.location.search);
      if (state.currentQueueBlastId) qs.set('blastId', state.currentQueueBlastId);
      else qs.delete('blastId');
      if (state.currentQueueContactId) qs.set('contactId', state.currentQueueContactId);
      else qs.delete('contactId');
      if (state.currentQueueRealtorId) qs.set('realtorId', state.currentQueueRealtorId);
      else qs.delete('realtorId');
      if (state.currentQueueStatus) qs.set('status', state.currentQueueStatus);
      else qs.delete('status');
      const newUrl = `${window.location.pathname}?${qs.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }

    function renderQueueFilterChips() {
      if (!queueFilterChips) return;
      const existingEmpty = queueFilterEmpty;
      const existingClear = queueClearAll;
      queueFilterChips.innerHTML = '';
      if (existingEmpty) queueFilterChips.appendChild(existingEmpty);
      if (existingClear) queueFilterChips.appendChild(existingClear);
      const chips = [];
      const pushChip = (label, key) => {
        chips.push(`<span class="badge bg-light text-dark border d-flex align-items-center gap-1" data-queue-chip="${key}">
          ${label}
          <button type="button" class="btn-close btn-close-sm" aria-label="Remove" data-queue-chip-remove="${key}"></button>
        </span>`);
      };
      if (state.currentQueueBlastId) pushChip(`Blast: ${state.currentQueueBlastId}`, 'blastId');
      if (state.currentQueueContactId) pushChip(`Contact: ${state.currentQueueContactId}`, 'contactId');
      if (state.currentQueueRealtorId) pushChip(`Realtor: ${state.currentQueueRealtorId}`, 'realtorId');
      if (state.currentQueueStatus) pushChip(`Status: ${state.currentQueueStatus}`, 'status');

      if (chips.length) {
        if (queueFilterEmpty) queueFilterEmpty.classList.add('d-none');
        queueFilterChips.insertAdjacentHTML('afterbegin', chips.join(''));
        if (queueClearAll) queueClearAll.classList.remove('d-none');
      } else {
        if (queueFilterEmpty) queueFilterEmpty.classList.remove('d-none');
        if (queueClearAll) queueClearAll.classList.add('d-none');
      }
    }

    function renderQueue() {
      if (!queueList) return;
      if (!state.queue.length) {
        queueList.innerHTML = '<tr><td colspan="7" class="text-muted small">No jobs in this view.</td></tr>';
        renderQueueSummary();
        return;
      }
      renderQueueSummary();
      const formatSource = (job) => {
        if (job.blastId) return 'Blast';
        if (job.ruleId) return 'Rule';
        if (job.scheduleId) return 'Schedule';
        return 'Manual';
      };
      const recipientBadge = (job) => {
        const label = job.recipientType === 'realtor' ? 'Realtor' : 'Contact';
        return `<span class="badge bg-light text-dark border text-uppercase">${label}</span>`;
      };
        queueList.innerHTML = state.queue
          .map((job) => `
            <tr>
              <td>
                <div class="fw-semibold">${job.recipientName || job.to || '--'}</div>
                <div class="small text-muted">${job.to || ''}</div>
                <div class="small mt-1">${recipientBadge(job)}</div>
              </td>
              <td>${formatSource(job)}</td>
              <td>${job.templateName || '--'}</td>
              <td>
                <div>${formatDateTime(job.scheduledFor)}</div>
                ${job.nextAttemptAt ? `<div class="small text-muted">Next attempt: ${formatDateTime(job.nextAttemptAt)}</div>` : ''}
              </td>
              <td>
                <span class="badge bg-light text-dark border text-uppercase">${job.status || 'queued'}</span>
              </td>
              <td>
                ${job.lastError ? `<div class="small text-muted">${getEmailErrorLabel(job.lastError)}</div>` : '--'}
              </td>
              <td class="text-end">
                ${
                  job.status === 'queued'
                    ? `<button class="btn btn-sm btn-outline-danger me-2" data-queue-cancel="${job._id}">Cancel</button>`
                    : ''
                }
                ${
                  job.status === 'failed' && job.lastError !== 'BLAST_PAUSED'
                    ? `<button class="btn btn-sm btn-outline-secondary me-2" data-queue-retry="${job._id}">Retry</button>`
                    : ''
                }
                <button class="btn btn-sm btn-outline-primary" data-queue-view="${job._id}">View</button>
              </td>
          </tr>
        `)
        .join('');
    }

    async function handleQueueAction(event) {
      const cancelBtn = event.target.closest('[data-queue-cancel]');
      const retryBtn = event.target.closest('[data-queue-retry]');
      const viewBtn = event.target.closest('[data-queue-view]');
      if (!cancelBtn && !retryBtn && !viewBtn) return;
      event.preventDefault();
      const jobId = cancelBtn?.dataset.queueCancel
        || retryBtn?.dataset.queueRetry
        || viewBtn?.dataset.queueView;
      if (!jobId) return;

      if (cancelBtn) {
        try {
          await apiRequest(`${state.emailEndpoints.queue}/${jobId}/cancel`, { method: 'POST' });
          showToast(queueToast, 'Job canceled.', 'success');
          await loadQueue(state.currentQueueFilter, state.currentQueueBlastId, state.currentQueueContactId, state.currentQueueRealtorId, state.currentQueueStatus);
        } catch (err) {
          console.error('[automations] cancel failed', err);
          showToast(queueToast, err.message || 'Unable to cancel job.', 'error');
        }
        return;
      }

      if (retryBtn) {
        try {
          await apiRequest(`${state.emailEndpoints.queue}/${jobId}/retry`, { method: 'POST' });
          showToast(queueToast, 'Retry scheduled.', 'success');
          await loadQueue(state.currentQueueFilter, state.currentQueueBlastId, state.currentQueueContactId, state.currentQueueRealtorId, state.currentQueueStatus);
        } catch (err) {
          console.error('[automations] retry failed', err);
          showToast(queueToast, err.message || 'Unable to retry job.', 'error');
        }
        return;
      }

      if (viewBtn) {
        const job = state.queue.find((item) => String(item._id) === String(jobId));
        if (job?.blastId) {
          window.open(`/email/blasts/${job.blastId}`, '_blank');
          return;
        }
        window.alert(JSON.stringify(job || {}, null, 2));
      }
    }

    function applySettingsToForm(settings) {
      if (!emailSettingsForm || !settings) return;
      emailSettingsForm.elements.timezone.value = settings.timezone || '';
      emailSettingsForm.elements.allowedStartTime.value = settings.allowedStartTime || '09:00';
      emailSettingsForm.elements.allowedEndTime.value = settings.allowedEndTime || '17:00';
      emailSettingsForm.elements.quietHoursEnabled.checked = settings.quietHoursEnabled !== false;
      emailSettingsForm.elements.dailyCap.value = settings.dailyCap || 0;
      emailSettingsForm.elements.rateLimitPerMinute.value = settings.rateLimitPerMinute || 0;
      emailSettingsForm.elements.unsubscribeBehavior.value = settings.unsubscribeBehavior || 'do_not_email';

      const allowedSet = new Set((settings.allowedDays || []).map((d) => String(d)));
      const dayInputs = emailSettingsForm.querySelectorAll('input[name="allowedDays"]');
      dayInputs.forEach((input) => {
        input.checked = allowedSet.has(input.value);
      });
    }

    async function loadEmailSettings() {
      try {
        const response = await apiRequest(state.emailEndpoints.settings);
        applySettingsToForm(response.settings || {});
      } catch (err) {
        console.error('[automations] settings load failed', err);
      }
    }

    function collectSettingsPayload() {
      if (!emailSettingsForm) return {};
      const days = Array.from(emailSettingsForm.querySelectorAll('input[name="allowedDays"]:checked'))
        .map((input) => Number(input.value));
      return {
        timezone: emailSettingsForm.elements.timezone.value.trim(),
        allowedDays: days,
        allowedStartTime: emailSettingsForm.elements.allowedStartTime.value,
        allowedEndTime: emailSettingsForm.elements.allowedEndTime.value,
        quietHoursEnabled: emailSettingsForm.elements.quietHoursEnabled.checked,
        dailyCap: Number(emailSettingsForm.elements.dailyCap.value || 0),
        rateLimitPerMinute: Number(emailSettingsForm.elements.rateLimitPerMinute.value || 0),
        unsubscribeBehavior: emailSettingsForm.elements.unsubscribeBehavior.value
      };
    }

    async function handleSettingsSave(event) {
      event.preventDefault();
      try {
        const payload = collectSettingsPayload();
        await apiRequest(state.emailEndpoints.settings, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast(settingsToast, 'Settings updated.', 'success');
        await loadEmailSettings();
      } catch (err) {
        console.error('[automations] settings save failed', err);
        showToast(settingsToast, err.message || 'Unable to save settings.', 'error');
      }
    }

    function renderSuppressions(items) {
      if (!suppressionsList) return;
      if (!items.length) {
        suppressionsList.innerHTML = '<div class="text-muted small">No suppressed emails.</div>';
        return;
      }
      suppressionsList.innerHTML = items
        .map((item) => `<div class="small">${item.email} <span class="text-muted">(${item.reason})</span></div>`)
        .join('');
    }

    async function loadSuppressions() {
      try {
        const response = await apiRequest(state.emailEndpoints.suppressions);
        renderSuppressions(Array.isArray(response.suppressions) ? response.suppressions : []);
      } catch (err) {
        console.error('[automations] suppressions load failed', err);
      }
    }

    async function handleSuppressionAdd() {
      const email = suppressionEmailInput?.value.trim();
      if (!email) return;
      try {
        await apiRequest(state.emailEndpoints.suppressions, {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        suppressionEmailInput.value = '';
        await loadSuppressions();
      } catch (err) {
        console.error('[automations] suppression add failed', err);
      }
    }

    async function handleAudiencePreview(event) {
      event.preventDefault();
      if (!audienceForm) return;
      const filters = {
        communityIds: parseCsv(audienceForm.elements.communityIds.value),
        statuses: parseCsv(audienceForm.elements.statuses.value),
        tags: parseCsv(audienceForm.elements.tags.value),
        linkedLot: audienceForm.elements.linkedLot.checked
      };

      try {
        const response = await apiRequest(state.emailEndpoints.audiencePreview, {
          method: 'POST',
          body: JSON.stringify({ filters })
        });
        if (audienceTotal) audienceTotal.textContent = response.total ?? '--';
        if (audienceExcluded) audienceExcluded.textContent = response.excluded ?? '--';
        if (audienceSample) {
          const samples = (response.sampleRecipients || [])
            .map((r) => `${[r.firstName, r.lastName].filter(Boolean).join(' ') || r.email}`)
            .join(', ');
          audienceSample.textContent = samples || 'No sample recipients available.';
        }
      } catch (err) {
        console.error('[automations] audience preview failed', err);
      }
    }

    async function refreshAutomationData() {
      await Promise.allSettled([
        loadTemplates(),
        loadRules(),
        loadQueue(state.currentQueueFilter, state.currentQueueBlastId, state.currentQueueContactId, state.currentQueueRealtorId, state.currentQueueStatus),
        loadEmailSettings(),
        loadSuppressions(),
        loadCommonAutomations(),
        loadProcessorHealth(),
        loadBlasts()
      ]);
    }

    function handleLoadIntoBuilder(scheduleId) {
      if (!scheduleId) return;
      const schedule = scheduleMap.get(scheduleId);
      if (!schedule) {
        showToast(toastRegion, 'Unable to load schedule details.', 'error');
        return;
      }
      populateFormFromSchedule(schedule);
      const target = builderForm.querySelector('[name="scheduleName"]');
      if (target) target.focus();
    }

    addStepButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const lastStepDayField = stepList.querySelector('.builder-step:last-child [data-step-field="day"]');
        const lastValue = lastStepDayField ? parseInt(lastStepDayField.value || '0', 10) : 0;
        const nextDay = Number.isNaN(lastValue) ? 0 : lastValue + 2;
        const newStep = {
          dayOffset: nextDay,
          channel: getDefaultChannel(),
          title: `Touchpoint ${stepList.childElementCount + 1}`,
          ownerRole: builderForm.elements.owner?.value || getDefaultOwnerRole(),
          waitForReply: false
        };
        const element = createStepElement(newStep, stepList.childElementCount);
        stepList.appendChild(element);
        refreshTemplateSelects();
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    stepList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-step]');
      if (!removeButton) return;
      const step = removeButton.closest('.builder-step');
      if (!step) return;
      if (stepList.childElementCount <= 1) {
        showToast(toastRegion, 'At least one step is required.', 'error');
        return;
      }
      step.remove();
    });

    stopPillList?.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-stop-pill]');
      if (!pill || !stopSelect) return;
      const value = pill.dataset.stopPill || '';
      if (!value) return;
      const option = Array.from(stopSelect.options || []).find((opt) => opt.value === value);
      if (!option) return;
      option.selected = !option.selected;
      syncStopPillsFromSelect();
    });

    blastCommunityList?.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-community-id]');
      if (!pill) return;
      const isSelected = !pill.classList.contains('is-selected');
      pill.classList.toggle('is-selected', isSelected);
      pill.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      syncBlastInputsFromPills();
      scheduleBlastPreviewRefresh();
    });

    blastStatusList?.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-blast-status-pill]');
      if (!pill) return;
      const isSelected = !pill.classList.contains('is-muted');
      pill.classList.toggle('is-muted', isSelected);
      pill.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      syncBlastInputsFromPills();
      scheduleBlastPreviewRefresh();
    });

    if (blastForm?.elements.tags) {
      blastForm.elements.tags.addEventListener('input', () => {
        scheduleBlastPreviewRefresh();
      });
    }

    if (blastForm?.elements.linkedLot) {
      blastForm.elements.linkedLot.addEventListener('change', () => {
        scheduleBlastPreviewRefresh();
      });
    }

    if (blastForm?.elements.realtorCommunityId) {
      blastForm.elements.realtorCommunityId.addEventListener('change', () => {
        scheduleBlastPreviewRefresh();
      });
    }
    if (blastForm?.elements.realtorManagerId) {
      blastForm.elements.realtorManagerId.addEventListener('change', () => {
        scheduleBlastPreviewRefresh();
      });
    }
    if (blastForm?.elements.realtorTextSearch) {
      blastForm.elements.realtorTextSearch.addEventListener('input', () => {
        scheduleBlastPreviewRefresh();
      });
    }
    if (blastForm?.elements.realtorIncludeInactive) {
      blastForm.elements.realtorIncludeInactive.addEventListener('change', () => {
        scheduleBlastPreviewRefresh();
      });
    }

    if (blastForm?.elements.audienceType) {
      blastForm.elements.audienceType.addEventListener('change', () => {
        updateBlastAudienceUI();
        syncBlastRecipientType();
        scheduleBlastPreviewRefresh();
      });
    }
    if (blastForm?.elements.name) {
      blastForm.elements.name.addEventListener('input', () => {
        updateBlastStepState();
        updateBlastConfirmationSummary();
      });
    }
    if (blastTemplateSelect) {
      blastTemplateSelect.addEventListener('change', () => {
        updateBlastStepState();
        updateBlastConfirmationSummary();
      });
    }

    const blastSendModeInputs = blastForm
      ? blastForm.querySelectorAll('input[name="sendMode"]')
      : [];
    if (blastSendModeInputs.length) {
      blastSendModeInputs.forEach((input) => {
        input.addEventListener('change', () => {
          scheduleBlastPreviewRefresh();
          updateBlastConfirmationSummary();
        });
      });
    }

    if (blastForm?.elements.scheduledFor) {
      blastForm.elements.scheduledFor.addEventListener('change', () => {
        scheduleBlastPreviewRefresh();
        updateBlastConfirmationSummary();
      });
    }
    if (blastForm?.elements.confirmationText) {
      blastForm.elements.confirmationText.addEventListener('input', () => {
        updateBlastSubmitState();
      });
    }
    blastRecipientToggle?.addEventListener('click', (event) => {
      event.preventDefault();
      toggleBlastRecipientPanel();
    });
    blastRecipientType?.addEventListener('change', () => {
      clearBlastRecipientPreview();
    });
    blastRecipientSample?.addEventListener('change', () => {
      if (blastRecipientResults) blastRecipientResults.value = '';
      const selected = blastRecipientSample.selectedOptions?.[0];
      const type = selected?.dataset?.recipientType;
      if (type && blastRecipientType) blastRecipientType.value = type;
      clearBlastRecipientPreview();
    });
    blastRecipientSearchBtn?.addEventListener('click', searchBlastRecipients);
    blastRecipientSearch?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchBlastRecipients();
      }
    });
    blastRecipientResults?.addEventListener('change', () => {
      if (blastRecipientSample) blastRecipientSample.value = '';
      clearBlastRecipientPreview();
    });
    blastRecipientRender?.addEventListener('click', renderBlastRecipientPreview);
    blastCopySummary?.addEventListener('click', copyBlastSummary);

    saveButton?.addEventListener('click', handleSaveSchedule);
    newScheduleButton?.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveTab('schedules');
      setWorkflowStep('canvas');
      resetBuilderForm();
      const nameInput = builderForm.querySelector('input[name="scheduleName"]');
      if (nameInput) nameInput.focus();
    });

    document.addEventListener('click', (event) => {
      const loadButton = event.target.closest('[data-load-schedule]');
      if (loadButton) {
        event.preventDefault();
        handleLoadIntoBuilder(loadButton.getAttribute('data-load-schedule'));
        return;
      }

      const applyButton = event.target.closest('[data-apply-schedule]');
      if (applyButton) {
        event.preventDefault();
        const row = applyButton.closest('tr[data-member-id]');
        handleAssignment(row, applyButton);
      }
    });

    syncStopPillsFromSelect();
    initWorkflow();
    initBlastWorkflow();
    initTabs();
    initTemplateEditor();
    setAdvancedMode(Boolean(templateAdvancedToggle?.checked));
    syncBlastPillsFromInputs();
    loadBlastCommunities();
    loadRealtorBlastFilters();
    refreshButton?.addEventListener('click', (event) => {
      event.preventDefault();
      refreshAutomationData();
    });
    commonAutomationRefresh?.addEventListener('click', (event) => {
      event.preventDefault();
      loadCommonAutomations();
    });
    healthRefresh?.addEventListener('click', (event) => {
      event.preventDefault();
      loadProcessorHealth();
    });
    healthStuckLink?.addEventListener('click', (event) => {
      event.preventDefault();
      healthStuckSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    commonAutomationList?.addEventListener('click', (event) => {
      const enableButton = event.target.closest('[data-common-enable]');
      const disableButton = event.target.closest('[data-common-disable]');
      const editButton = event.target.closest('[data-common-edit]');
      if (enableButton) {
        event.preventDefault();
        handleCommonAutomationToggle(enableButton.dataset.commonEnable, 'enable', enableButton);
        return;
      }
      if (disableButton) {
        event.preventDefault();
        handleCommonAutomationToggle(disableButton.dataset.commonDisable, 'disable', disableButton);
        return;
      }
      if (editButton) {
        event.preventDefault();
        handleCommonAutomationEdit(editButton.dataset.commonEdit);
      }
    });

    templateForm?.addEventListener('submit', handleTemplateSave);
    templateReset?.addEventListener('click', (event) => {
      event.preventDefault();
      if (!confirmTemplateSwitch()) return;
      resetTemplateForm();
    });
    templateForm?.elements.subject?.addEventListener('focus', () => {
      templateEditorTarget = 'subject';
    });
    templateForm?.elements.subject?.addEventListener('input', markTemplateDirty);
    templateForm?.elements.name?.addEventListener('input', markTemplateDirty);
    templateForm?.elements.previewText?.addEventListener('input', markTemplateDirty);
    templateForm?.elements.type?.addEventListener('change', markTemplateDirty);
    templateForm?.elements.isActive?.addEventListener('change', markTemplateDirty);
    templateForm?.elements.htmlRaw?.addEventListener('input', markTemplateDirty);
    templateForm?.elements.text?.addEventListener('input', markTemplateDirty);
    templateTokenOpen?.addEventListener('click', () => {
      openTokenModal();
    });
    tokenModalClose?.addEventListener('click', () => {
      closeTokenModal();
    });
    tokenModal?.addEventListener('click', (event) => {
      if (event.target === tokenModal) {
        closeTokenModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && tokenModal?.classList.contains('show')) {
        closeTokenModal();
      }
    });
    templateImageOpen?.addEventListener('click', () => {
      openImageModal();
    });
    imageModalClose?.addEventListener('click', () => {
      closeImageModal();
    });
    imageModal?.addEventListener('click', (event) => {
      if (event.target === imageModal) closeImageModal();
    });
    imageTabs?.forEach((btn) => {
      btn.addEventListener('click', () => {
        setActiveImageTab(btn.dataset.imageTab);
      });
    });
    imageFileInput?.addEventListener('change', () => {
      const file = imageFileInput.files?.[0];
      if (file && imagePreview && imagePreviewWrap) {
        imagePreview.src = URL.createObjectURL(file);
        imagePreviewWrap.classList.remove('d-none');
      }
    });
    imageUploadBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      handleImageUpload();
    });
    imageLibrary?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-image-select]');
      if (!btn) return;
      insertImage(btn.dataset.imageSelect);
      closeImageModal();
    });
    tokenSearch?.addEventListener('input', () => {
      renderTokenPicker(tokenSearch.value || '');
    });
    tokenList?.addEventListener('click', (event) => {
      const insertBtn = event.target.closest('[data-token-insert]');
      const copyBtn = event.target.closest('[data-token-copy]');
      if (insertBtn) {
        const value = insertBtn.dataset.tokenInsert;
        const label = insertBtn.dataset.tokenLabel
          || insertBtn.closest('[data-token-insert]')?.querySelector('.fw-semibold')?.textContent
          || value;
        insertTemplateToken(value);
        addRecentToken({ label, value });
        markTemplateDirty();
        closeTokenModal();
        return;
      }
      if (copyBtn) {
        const value = copyBtn.dataset.tokenCopy;
        const label = copyBtn.dataset.tokenLabel
          || copyBtn.closest('[data-token-copy]')?.querySelector('.fw-semibold')?.textContent
          || value;
        copyToken(value, label);
      }
    });
    tokenRecentList?.addEventListener('click', (event) => {
      const insertBtn = event.target.closest('[data-token-insert]');
      const copyBtn = event.target.closest('[data-token-copy]');
      if (insertBtn) {
        const value = insertBtn.dataset.tokenInsert;
        const label = insertBtn.dataset.tokenLabel || value;
        insertTemplateToken(value);
        addRecentToken({ label, value });
        markTemplateDirty();
        closeTokenModal();
        return;
      }
      if (copyBtn) {
        const value = copyBtn.dataset.tokenCopy;
        const label = copyBtn.dataset.tokenLabel || value;
        copyToken(value, label);
      }
    });
    templateAdvancedToggle?.addEventListener('change', () => {
      setAdvancedMode(Boolean(templateAdvancedToggle.checked));
      markTemplateDirty();
    });
    templateList?.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-template-edit]');
      if (!editButton) return;
      if (!confirmTemplateSwitch()) return;
      const templateId = editButton.dataset.templateEdit;
      const template = state.templates.find(
        (item) => String(item._id || item.id) === String(templateId)
      );
      if (template) populateTemplateForm(template);
    });
    templateNew?.addEventListener('click', () => {
      if (!confirmTemplateSwitch()) return;
      resetTemplateForm();
    });
    templateDuplicate?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplateDuplicate();
    });
    templateSendTest?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplateSendTest();
    });
    templateArchive?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplateArchive();
    });
    templateRestore?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplateRestore();
    });
    templateShowArchived?.addEventListener('change', async () => {
      state.templateShowArchived = Boolean(templateShowArchived.checked);
      await loadTemplates();
      if (!state.templateShowArchived) {
        resetTemplateForm();
      }
    });
    templateSearch?.addEventListener('input', () => {
      state.templateSearch = templateSearch.value || '';
      renderTemplateList();
    });
    templateFilters?.forEach((button) => {
      button.addEventListener('click', () => {
        templateFilters.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        state.templateFilter = button.dataset.templateFilter || 'all';
        renderTemplateList();
      });
    });
      templatePreviewSearchBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        handleTemplatePreviewSearch();
      });
    templatePreviewRecipient?.addEventListener('change', () => {
      if (templatePreviewContact) {
        templatePreviewContact.innerHTML = '<option value="">Choose a recipient</option>';
      }
    });
      updateBlastAudienceUI();
    templatePreviewRun?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplatePreview();
    });
    blastEmailPreviewButton?.addEventListener('click', (event) => {
      event.preventDefault();
      handleBlastEmailPreview();
    });
    blastPreviewButton?.addEventListener('click', (event) => {
      event.preventDefault();
      loadBlastPreview();
    });
    blastAudienceType?.addEventListener('change', () => {
      updateBlastAudienceUI();
      scheduleBlastPreviewRefresh(true);
    });
    blastForm?.addEventListener('submit', handleBlastCreate);
    blastReset?.addEventListener('click', (event) => {
      event.preventDefault();
      resetBlastForm();
    });
    blastList?.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-blast-view]');
      const pauseButton = event.target.closest('[data-blast-pause]');
      const resumeButton = event.target.closest('[data-blast-resume]');
      const cancelButton = event.target.closest('[data-blast-cancel]');
      if (viewButton) {
        event.preventDefault();
        handleBlastView(viewButton.dataset.blastView);
      }
      if (pauseButton) {
        event.preventDefault();
        handleBlastPause(pauseButton.dataset.blastPause);
      }
      if (resumeButton) {
        event.preventDefault();
        handleBlastResume(resumeButton.dataset.blastResume);
      }
      if (cancelButton) {
        event.preventDefault();
        handleBlastCancel(cancelButton.dataset.blastCancel);
      }
    });

      ruleForm?.addEventListener('submit', handleRuleSave);
      ruleList?.addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-rule-edit]');
        if (!editButton) return;
        const ruleId = editButton.dataset.ruleEdit;
        if (!confirmRuleSwitch()) return;
        const rule = state.rules.find((item) => String(item._id || item.id) === String(ruleId));
        if (rule) populateRuleForm(rule);
        renderRuleList();
      });
      ruleNew?.addEventListener('click', () => {
        if (!confirmRuleSwitch()) return;
        resetRuleForm();
        renderRuleList();
      });
      ruleReset?.addEventListener('click', () => {
        resetRuleForm();
        renderRuleList();
      });
      ruleTemplatePreview?.addEventListener('click', (event) => {
        event.preventDefault();
        openTemplateFromRule();
      });
      ruleTestButton?.addEventListener('click', (event) => {
        event.preventDefault();
        openRuleTestModal();
      });
      ruleTestClose?.addEventListener('click', () => {
        closeRuleTestModal();
      });
      ruleTestModal?.addEventListener('click', (event) => {
        if (event.target === ruleTestModal) {
          closeRuleTestModal();
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && ruleTestModal?.classList.contains('show')) {
          closeRuleTestModal();
        }
      });
      ruleTestSearchBtn?.addEventListener('click', searchRuleTestContacts);
      ruleTestSearch?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          searchRuleTestContacts();
        }
      });
      ruleTestContact?.addEventListener('change', () => {
        updateRuleTestLinks(ruleTestContact.value || '');
      });
      ruleTestRun?.addEventListener('click', runRuleSimulation);
      ruleTestClear?.addEventListener('click', () => {
        clearRuleTestResult();
        if (ruleTestContact) ruleTestContact.value = '';
      });
      ruleForm?.addEventListener('input', (event) => {
        const target = event.target;
        if (target?.name === 'delayMinutes' || target?.name === 'cooldownMinutes') return;
        markRuleDirty();
        if (
          target === ruleDelayMode
          || target === ruleDelayValue
          || target === ruleCooldownValue
          || target === ruleCooldownUnit
          || target?.name === 'toStatus'
        ) {
          updateRuleTimingFromInputs();
        }
      });
      ruleDelayMode?.addEventListener('change', () => {
        updateRuleTimingFromInputs();
        markRuleDirty();
      });
      ruleDelayValue?.addEventListener('input', () => {
        updateRuleTimingFromInputs();
        markRuleDirty();
      });
      ruleCooldownValue?.addEventListener('input', () => {
        updateRuleTimingFromInputs();
        markRuleDirty();
      });
      ruleCooldownUnit?.addEventListener('change', () => {
        updateRuleTimingFromInputs();
        markRuleDirty();
      });
      if (ruleForm) {
        updateRuleTimingFromInputs();
      }

    queueFilters.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        queueFilters.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        loadQueue(
          button.dataset.queueFilter || 'today',
          state.currentQueueBlastId,
          state.currentQueueContactId,
          state.currentQueueRealtorId,
          state.currentQueueStatus
        );
      });
    });
    queueStatusSelect?.addEventListener('change', () => {
      state.currentQueueStatus = queueStatusSelect.value || '';
      loadQueue(
        state.currentQueueFilter,
        state.currentQueueBlastId,
        state.currentQueueContactId,
        state.currentQueueRealtorId,
        state.currentQueueStatus
      );
    });
    queueFilterChips?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-queue-chip-remove]');
      if (!remove) return;
      const key = remove.dataset.queueChipRemove;
      if (key === 'blastId') state.currentQueueBlastId = null;
      if (key === 'contactId') state.currentQueueContactId = null;
      if (key === 'realtorId') state.currentQueueRealtorId = null;
      if (key === 'status') {
        state.currentQueueStatus = '';
        if (queueStatusSelect) queueStatusSelect.value = '';
      }
      loadQueue(
        state.currentQueueFilter,
        state.currentQueueBlastId,
        state.currentQueueContactId,
        state.currentQueueRealtorId,
        state.currentQueueStatus
      );
    });
    queueClearAll?.addEventListener('click', () => {
      state.currentQueueBlastId = null;
      state.currentQueueContactId = null;
      state.currentQueueRealtorId = null;
      state.currentQueueStatus = '';
      if (queueStatusSelect) queueStatusSelect.value = '';
      loadQueue(state.currentQueueFilter, null, null, null, '');
    });
    queueList?.addEventListener('click', handleQueueAction);

    emailSettingsForm?.addEventListener('submit', handleSettingsSave);
    settingsRefresh?.addEventListener('click', (event) => {
      event.preventDefault();
      loadEmailSettings();
    });
    suppressionAddButton?.addEventListener('click', (event) => {
      event.preventDefault();
      handleSuppressionAdd();
    });
    audienceForm?.addEventListener('submit', handleAudiencePreview);

    resetBuilderForm();
    refreshAutomationData();
    if (queueFilters.length) {
      queueFilters[0].classList.add('active');
    }
    if (queueStatusSelect && state.currentQueueStatus) {
      queueStatusSelect.value = state.currentQueueStatus;
    }
  });
})();
