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
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
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
    const addStepButton = document.querySelector('[data-add-step]');
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
    const templatePreviewSearch = document.querySelector('[data-template-preview-search]');
    const templatePreviewSearchBtn = document.querySelector('[data-template-preview-search-btn]');
    const templatePreviewContact = document.querySelector('[data-template-preview-contact]');
    const templatePreviewRun = document.querySelector('[data-template-preview-run]');
    const templatePreviewSubject = document.querySelector('[data-template-preview-subject]');
    const templatePreviewText = document.querySelector('[data-template-preview-text]');
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
    const queueList = document.querySelector('[data-queue-list]');
    const queueFilters = document.querySelectorAll('[data-queue-filter]');
    const queueToast = document.querySelector('[data-queue-toast]');
    const blastForm = document.querySelector('[data-blast-form]');
    const blastTemplateSelect = document.querySelector('[data-blast-template]');
    const blastPreviewButton = document.querySelector('[data-blast-preview]');
    const blastPreviewTotal = document.querySelector('[data-blast-preview-total]');
    const blastPreviewExcluded = document.querySelector('[data-blast-preview-excluded]');
    const blastPreviewFinal = document.querySelector('[data-blast-preview-final]');
    const blastPreviewSample = document.querySelector('[data-blast-preview-sample]');
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

    if (!builderForm || !stepList) return;

    const baseStepTemplate = stepList.querySelector('.builder-step')
      ? stepList.querySelector('.builder-step').cloneNode(true)
      : null;

    const state = {
      schedules: Array.isArray(initialData.schedules) ? initialData.schedules : [],
      builderPreset: initialData.builderPreset || {},
      assignments: Array.isArray(initialData.teamAssignments) ? initialData.teamAssignments : [],
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
      activeScheduleId: null,
      activeTemplateId: null,
      activeRuleId: null,
      currentQueueFilter: 'today',
      currentQueueBlastId: null,
      blastPreview: null,
      blasts: [],
      currentTab: 'schedules'
    };

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

    function resetBuilderForm() {
      state.activeScheduleId = null;
      builderForm.reset();
      if (builderForm.elements.stopOnStatuses) {
        Array.from(builderForm.elements.stopOnStatuses.options || []).forEach((option) => {
          option.selected = false;
        });
      }
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
    }

    function initTabs() {
      if (!tabButtons.length) return;
      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setActiveTab(button.dataset.automationTab);
        });
      });
      setActiveTab('schedules');
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
            <div class="text-muted">${time} • ${item.lastError || 'Failed'} • Attempts: ${item.attempts ?? 0}</div>
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
      return {
        communityIds: parseCsv(blastForm.elements.communityIds?.value || ''),
        statuses: parseCsv(blastForm.elements.statuses?.value || ''),
        ownerIds: parseCsv(blastForm.elements.ownerIds?.value || ''),
        lenderIds: parseCsv(blastForm.elements.lenderIds?.value || ''),
        tags: parseCsv(blastForm.elements.tags?.value || ''),
        linkedLot: Boolean(blastForm.elements.linkedLot?.checked)
      };
    }

    function updateBlastPreviewUI(preview) {
      if (blastPreviewTotal) blastPreviewTotal.textContent = preview?.totalMatched ?? '--';
      const excludedTotal = preview?.excludedTotal ?? '--';
      if (blastPreviewExcluded) blastPreviewExcluded.textContent = excludedTotal;
      if (blastPreviewFinal) blastPreviewFinal.textContent = preview?.finalToSend ?? '--';
      if (blastPreviewSample) {
        const samples = (preview?.sampleRecipients || [])
          .map((r) => `${r.name || r.email}`)
          .join(', ');
        blastPreviewSample.textContent = samples || 'No sample recipients available.';
      }

      if (blastConfirmation) {
        const thresholdHit = Number(preview?.finalToSend || 0) >= 200;
        blastConfirmation.classList.toggle('d-none', !thresholdHit);
        if (thresholdHit && blastForm?.elements.confirmationText) {
          blastForm.elements.confirmationText.placeholder = `Type: SEND ${preview.finalToSend}`;
        }
      }
    }

    async function loadBlastPreview() {
      if (!blastForm) return;
      if (!state.emailEndpoints.blasts) return;
      const payload = {
        templateId: blastForm.elements.templateId?.value || null,
        filters: collectBlastFilters()
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
        if (blastToast) {
          showToast(blastToast, err.message || 'Unable to preview blast.', 'error');
        }
      }
    }

    function renderBlasts() {
      if (!blastList) return;
      if (!state.blasts.length) {
        blastList.innerHTML = '<div class="text-muted small">No blasts yet.</div>';
        return;
      }
      blastList.innerHTML = state.blasts
        .map((blast) => `
          <div class="border rounded-3 p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${blast.name || 'Blast'}</div>
                <div class="text-muted small">${formatDateTime(blast.createdAt)}</div>
              </div>
              <span class="badge ${blast.status === 'canceled' ? 'bg-secondary-subtle text-secondary' : 'bg-success-subtle text-success'}">
                ${blast.status || 'scheduled'}
              </span>
            </div>
            <div class="small text-muted mt-2">
              Scheduled: ${blast.scheduledFor ? formatDateTime(blast.scheduledFor) : 'Now'} • Final: ${blast.finalToSend ?? 0}
            </div>
            <div class="d-flex gap-2 mt-3">
              <button type="button" class="btn btn-sm btn-outline-primary" data-blast-view="${blast._id}">View in Queue</button>
              ${
                blast.status === 'scheduled'
                  ? `<button type="button" class="btn btn-sm btn-outline-danger" data-blast-cancel="${blast._id}">Cancel</button>`
                  : ''
              }
            </div>
          </div>
        `)
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
      updateBlastPreviewUI({});
      if (blastConfirmation) blastConfirmation.classList.add('d-none');
    }

    async function handleBlastCreate(event) {
      event.preventDefault();
      if (!blastForm) return;
      const name = blastForm.elements.name.value.trim();
      const templateId = blastForm.elements.templateId.value;
      if (!name) {
        showToast(blastToast, 'Blast name is required.', 'error');
        return;
      }
      if (!templateId) {
        showToast(blastToast, 'Select a template.', 'error');
        return;
      }

      const sendMode = blastForm.elements.sendMode?.value === 'scheduled' ? 'scheduled' : 'now';
      const scheduledFor = blastForm.elements.scheduledFor?.value || null;

      const payload = {
        name,
        templateId,
        filters: collectBlastFilters(),
        sendMode,
        scheduledFor: sendMode === 'scheduled' ? scheduledFor : null,
        confirmationText: blastForm.elements.confirmationText?.value || ''
      };

      try {
        const response = await apiRequest(state.emailEndpoints.blasts, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast(blastToast, 'Blast queued.', 'success');
        resetBlastForm();
        await loadBlasts();
        if (response?.blastId) {
          setActiveTab('queue');
          await loadQueue(state.currentQueueFilter, response.blastId);
        }
      } catch (err) {
        console.error('[blasts] create failed', err);
        showToast(blastToast, err.message || 'Unable to create blast.', 'error');
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

    function handleBlastView(blastId) {
      if (!blastId) return;
      setActiveTab('queue');
      loadQueue(state.currentQueueFilter, blastId);
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

    function resetTemplateForm() {
      if (!templateForm) return;
      templateForm.reset();
      templateForm.elements.templateId.value = '';
      state.activeTemplateId = null;
    }

    function populateTemplateForm(template) {
      if (!templateForm || !template) return;
      state.activeTemplateId = template._id || template.id || null;
      templateForm.elements.templateId.value = state.activeTemplateId || '';
      templateForm.elements.name.value = template.name || '';
      templateForm.elements.type.value = template.type || 'automation';
      templateForm.elements.subject.value = template.subject || '';
      templateForm.elements.html.value = template.html || '';
      templateForm.elements.text.value = template.text || '';
      templateForm.elements.isActive.checked = template.isActive !== false;
    }

    function renderTemplateList() {
      if (!templateList) return;
      if (!state.templates.length) {
        templateList.innerHTML = '<div class="text-muted small">No templates saved yet.</div>';
        return;
      }
      templateList.innerHTML = state.templates
        .map((template) => `
          <div class="border rounded-3 p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${template.name || 'Untitled'}</div>
                <div class="text-muted small">${template.subject || 'No subject'}</div>
                <span class="badge bg-light text-dark border">${template.type || 'automation'}</span>
              </div>
              <span class="badge ${template.isActive ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}">
                ${template.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="d-flex gap-2 mt-3">
              <button type="button" class="btn btn-sm btn-outline-primary" data-template-edit="${template._id || template.id}">
                Edit
              </button>
            </div>
          </div>
        `)
        .join('');
    }

    async function loadTemplates() {
      try {
        const response = await apiRequest(state.emailEndpoints.templates);
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
      const payload = {
        name: templateForm.elements.name.value.trim(),
        type: templateForm.elements.type.value,
        subject: templateForm.elements.subject.value,
        html: templateForm.elements.html.value,
        text: templateForm.elements.text.value,
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
        resetTemplateForm();
        await loadTemplates();
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
        const contacts = await apiRequest(`${state.emailEndpoints.contacts}?q=${encodeURIComponent(query)}`);
        templatePreviewContact.innerHTML = '<option value="">Choose a contact</option>';
        (Array.isArray(contacts) ? contacts : []).forEach((contact) => {
          const option = document.createElement('option');
          option.value = contact._id;
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
          option.textContent = `${name || contact.email || 'Contact'}${contact.email ? ` - ${contact.email}` : ''}`;
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
      const contactId = templatePreviewContact?.value || null;
      try {
        const response = await apiRequest(`${state.emailEndpoints.templates}/${templateId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ contactId })
        });
        if (templatePreviewSubject) templatePreviewSubject.textContent = response.rendered?.subject || '--';
        if (templatePreviewText) templatePreviewText.textContent = response.rendered?.text || '--';
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
      ruleForm.elements.isEnabled.value = rule.isEnabled === false ? 'false' : 'true';
      ruleForm.elements.mustStillMatchAtSend.checked = rule.action?.mustStillMatchAtSend !== false;
    }

    function renderRuleList() {
      if (!ruleList) return;
      if (!state.rules.length) {
        ruleList.innerHTML = '<div class="text-muted small">No rules configured yet.</div>';
        return;
      }
      ruleList.innerHTML = state.rules
        .map((rule) => `
          <div class="border rounded-3 p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${rule.name || 'Untitled Rule'}</div>
                <div class="text-muted small">Trigger: ${rule.trigger?.config?.fromStatus || 'Any'} -> ${rule.trigger?.config?.toStatus || 'Any'}</div>
              </div>
              <span class="badge ${rule.isEnabled ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}">
                ${rule.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div class="d-flex gap-2 mt-3">
              <button type="button" class="btn btn-sm btn-outline-primary" data-rule-edit="${rule._id || rule.id}">
                Edit
              </button>
            </div>
          </div>
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

    async function handleRuleSave(event) {
      event.preventDefault();
      if (!ruleForm) return;
      const payload = {
        name: ruleForm.elements.name.value.trim(),
        isEnabled: ruleForm.elements.isEnabled.value !== 'false',
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

    async function loadQueue(bucket = state.currentQueueFilter, blastId = state.currentQueueBlastId) {
      if (!queueList) return;
      state.currentQueueFilter = bucket;
      state.currentQueueBlastId = blastId || null;
      queueList.innerHTML = '<tr><td colspan="6" class="text-muted small">Loading queue...</td></tr>';
      try {
        const qs = new URLSearchParams({ bucket: bucket || 'today' });
        if (state.currentQueueBlastId) {
          qs.set('blastId', state.currentQueueBlastId);
        }
        const response = await apiRequest(`${state.emailEndpoints.queue}?${qs.toString()}`);
        state.queue = Array.isArray(response.jobs) ? response.jobs : [];
        renderQueue();
      } catch (err) {
        console.error('[automations] queue load failed', err);
        queueList.innerHTML = '<tr><td colspan="6" class="text-muted small">Unable to load queue.</td></tr>';
      }
    }

    function renderQueue() {
      if (!queueList) return;
      if (!state.queue.length) {
        queueList.innerHTML = '<tr><td colspan="6" class="text-muted small">No jobs in this view.</td></tr>';
        return;
      }
      const formatReason = (job) => {
        if (job.reason === 'blast') {
          return job.blastName ? `Blast: ${job.blastName}` : 'Blast';
        }
        if (job.reason === 'rule') {
          return job.ruleName ? `Rule: ${job.ruleName}` : 'Rule';
        }
        if (job.reason === 'schedule') {
          return job.scheduleName ? `Schedule: ${job.scheduleName}` : 'Schedule';
        }
        return 'Manual';
      };
      queueList.innerHTML = state.queue
        .map((job) => `
          <tr>
            <td>${job.to || '--'}</td>
            <td>${job.templateName || '--'}</td>
            <td>${formatReason(job)}</td>
            <td>${formatDateTime(job.scheduledFor)}</td>
            <td>
              <div class="fw-semibold text-capitalize">${job.status || 'queued'}</div>
              ${job.lastError ? `<div class="small text-muted">${job.lastError}</div>` : ''}
            </td>
            <td class="text-end">
              ${
                job.status === 'queued'
                  ? `<button class="btn btn-sm btn-outline-danger me-2" data-queue-cancel="${job._id}">Cancel</button>
                     <button class="btn btn-sm btn-outline-secondary" data-queue-reschedule="${job._id}">Reschedule</button>`
                  : '--'
              }
            </td>
          </tr>
        `)
        .join('');
    }

    async function handleQueueAction(event) {
      const cancelBtn = event.target.closest('[data-queue-cancel]');
      const rescheduleBtn = event.target.closest('[data-queue-reschedule]');
      if (!cancelBtn && !rescheduleBtn) return;
      event.preventDefault();
      const jobId = cancelBtn?.dataset.queueCancel || rescheduleBtn?.dataset.queueReschedule;
      if (!jobId) return;

      if (cancelBtn) {
        try {
          await apiRequest(`${state.emailEndpoints.queue}/${jobId}/cancel`, { method: 'POST' });
          showToast(queueToast, 'Job canceled.', 'success');
          await loadQueue(state.currentQueueFilter);
        } catch (err) {
          console.error('[automations] cancel failed', err);
          showToast(queueToast, err.message || 'Unable to cancel job.', 'error');
        }
        return;
      }

      const input = window.prompt('New schedule date/time (YYYY-MM-DDTHH:mm)', '');
      if (!input) return;
      try {
        await apiRequest(`${state.emailEndpoints.queue}/${jobId}/reschedule`, {
          method: 'POST',
          body: JSON.stringify({ scheduledFor: input })
        });
        showToast(queueToast, 'Job rescheduled.', 'success');
        await loadQueue(state.currentQueueFilter);
      } catch (err) {
        console.error('[automations] reschedule failed', err);
        showToast(queueToast, err.message || 'Unable to reschedule job.', 'error');
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
        ownerIds: parseCsv(audienceForm.elements.ownerIds.value),
        lenderIds: parseCsv(audienceForm.elements.lenderIds.value),
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
        loadQueue(state.currentQueueFilter),
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

    addStepButton?.addEventListener('click', (event) => {
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

    saveButton?.addEventListener('click', handleSaveSchedule);
    newScheduleButton?.addEventListener('click', (event) => {
      event.preventDefault();
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

    initTabs();
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
      resetTemplateForm();
    });
    templateList?.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-template-edit]');
      if (!editButton) return;
      const templateId = editButton.dataset.templateEdit;
      const template = state.templates.find(
        (item) => String(item._id || item.id) === String(templateId)
      );
      if (template) populateTemplateForm(template);
    });
    templatePreviewSearchBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplatePreviewSearch();
    });
    templatePreviewRun?.addEventListener('click', (event) => {
      event.preventDefault();
      handleTemplatePreview();
    });
    blastPreviewButton?.addEventListener('click', (event) => {
      event.preventDefault();
      loadBlastPreview();
    });
    blastForm?.addEventListener('submit', handleBlastCreate);
    blastReset?.addEventListener('click', (event) => {
      event.preventDefault();
      resetBlastForm();
    });
    blastList?.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-blast-view]');
      const cancelButton = event.target.closest('[data-blast-cancel]');
      if (viewButton) {
        event.preventDefault();
        handleBlastView(viewButton.dataset.blastView);
      }
      if (cancelButton) {
        event.preventDefault();
        handleBlastCancel(cancelButton.dataset.blastCancel);
      }
    });

    ruleForm?.addEventListener('submit', handleRuleSave);
    ruleReset?.addEventListener('click', (event) => {
      event.preventDefault();
      resetRuleForm();
    });
    ruleList?.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-rule-edit]');
      if (!editButton) return;
      const ruleId = editButton.dataset.ruleEdit;
      const rule = state.rules.find((item) => String(item._id || item.id) === String(ruleId));
      if (rule) populateRuleForm(rule);
    });

    queueFilters.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        queueFilters.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        loadQueue(button.dataset.queueFilter || 'today');
      });
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
  });
})();
