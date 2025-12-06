/* assets/js/task/settings.js
 * Controls the task settings page: builder interactions + API calls.
 */

(function taskSettingsController() {
  const DATA_NODE_ID = 'task-settings-data';
  const DEFAULT_ENDPOINTS = {
    schedules: '/api/task-schedules',
    assignments: '/api/task-schedules/assignments'
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
      activeScheduleId: null
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

        const dayValue = parseInt(dayField?.value || index * 2 || '0', 10);
        const titleValue = (titleField?.value || '').trim() || `Touchpoint ${index + 1}`;
        const ownerRole = (ownerField?.value || '').trim();
        const channelValue = (channelField?.value || '').trim() || getDefaultChannel();
        const waitFlag = Boolean(waitField?.checked);
        const ruleValue = ruleField?.value || '';
        const instructions = (instructionsField?.value || '').trim();

        steps.push({
          stepId: stepEl.dataset.stepId || `step-${index + 1}`,
          order: index,
          dayOffset: Number.isNaN(dayValue) ? index * 2 : dayValue,
          channel: uppercase(channelValue, getDefaultChannel()),
          title: titleValue,
          ownerRole: ownerRole || undefined,
          instructions: instructions || undefined,
          waitForReply: waitFlag,
          autoCompleteRule: mapAutoRuleForPayload(ruleValue, waitFlag)
        });
      });

      return {
        name: scheduleName,
        summary: builderForm.elements.description?.value || '',
        description: builderForm.elements.description?.value || '',
        stage: builderForm.elements.pipelineStage?.value || null,
        defaultOwnerRole: builderForm.elements.owner?.value || null,
        fallbackOwnerRole: builderForm.elements.escalationOwner?.value || null,
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

    resetBuilderForm();
  });
})();
