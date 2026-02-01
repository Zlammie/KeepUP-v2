const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const AutomationRule = require('../../models/AutomationRule');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const filter = { companyId: req.user.company };
    if (typeof req.query.enabled === 'string') {
      filter.isEnabled = req.query.enabled.trim().toLowerCase() !== 'false';
    }

    const rules = await AutomationRule.find(filter)
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ rules });
  } catch (err) {
    console.error('[email-rules] list failed', err);
    res.status(500).json({ error: 'Failed to load rules' });
  }
});

router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const triggerType = payload.trigger?.type || AutomationRule.TRIGGER_TYPES.CONTACT_STATUS_CHANGED;
    if (!Object.values(AutomationRule.TRIGGER_TYPES).includes(triggerType)) {
      return res.status(400).json({ error: 'Invalid trigger type' });
    }

    const templateId = toObjectId(payload.action?.templateId);
    if (!templateId) return res.status(400).json({ error: 'Template is required' });

    const toStatus = payload.trigger?.config?.toStatus;
    if (!toStatus) {
      return res.status(400).json({ error: 'toStatus is required for status triggers' });
    }

    const rule = await AutomationRule.create({
      companyId: req.user.company,
      name,
      isEnabled: payload.isEnabled !== false,
      trigger: {
        type: triggerType,
        config: payload.trigger?.config || {}
      },
      action: {
        type: payload.action?.type || AutomationRule.ACTION_TYPES.SEND_EMAIL,
        templateId,
        delayMinutes: Number(payload.action?.delayMinutes || 0) || 0,
        cooldownMinutes: Number(payload.action?.cooldownMinutes || 0) || 0,
        mustStillMatchAtSend: payload.action?.mustStillMatchAtSend !== false
      }
    });

    res.status(201).json({ rule });
  } catch (err) {
    console.error('[email-rules] create failed', err);
    res.status(500).json({ error: err.message || 'Failed to create rule' });
  }
});

router.put('/:ruleId', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const ruleId = toObjectId(req.params.ruleId);
    if (!ruleId) return res.status(400).json({ error: 'Invalid rule id' });

    const rule = await AutomationRule.findOne({
      _id: ruleId,
      companyId: req.user.company
    });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const payload = req.body || {};
    if (typeof payload.name === 'string' && payload.name.trim()) {
      rule.name = payload.name.trim();
    }
    if (typeof payload.isEnabled === 'boolean') rule.isEnabled = payload.isEnabled;

    if (payload.trigger) {
      if (payload.trigger.type && Object.values(AutomationRule.TRIGGER_TYPES).includes(payload.trigger.type)) {
        rule.trigger.type = payload.trigger.type;
      }
      if (payload.trigger.config) rule.trigger.config = payload.trigger.config;
    }

    if (payload.action) {
      if (payload.action.type && Object.values(AutomationRule.ACTION_TYPES).includes(payload.action.type)) {
        rule.action.type = payload.action.type;
      }
      if (payload.action.templateId) {
        const templateId = toObjectId(payload.action.templateId);
        if (templateId) rule.action.templateId = templateId;
      }
      if (payload.action.delayMinutes != null) {
        rule.action.delayMinutes = Number(payload.action.delayMinutes || 0) || 0;
      }
      if (payload.action.cooldownMinutes != null) {
        rule.action.cooldownMinutes = Number(payload.action.cooldownMinutes || 0) || 0;
      }
      if (typeof payload.action.mustStillMatchAtSend === 'boolean') {
        rule.action.mustStillMatchAtSend = payload.action.mustStillMatchAtSend;
      }
    }

    await rule.save();
    res.json({ rule });
  } catch (err) {
    console.error('[email-rules] update failed', err);
    res.status(500).json({ error: err.message || 'Failed to update rule' });
  }
});

module.exports = router;
