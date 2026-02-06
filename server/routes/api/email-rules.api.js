const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const AutomationRule = require('../../models/AutomationRule');
const EmailTemplate = require('../../models/EmailTemplate');
const EmailJob = require('../../models/EmailJob');
const Contact = require('../../models/Contact');
const Suppression = require('../../models/Suppression');
const { normalizeEmail } = require('../../utils/normalizeEmail');
const { getEmailSettings, adjustToAllowedWindow } = require('../../services/email/scheduler');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const isValidEmail = (value) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

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

router.post('/:ruleId/simulate', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const ruleId = toObjectId(req.params.ruleId);
    if (!ruleId) return res.status(400).json({ error: 'Invalid rule id' });

    const contactId = toObjectId(req.body?.contactId);
    if (!contactId) return res.status(400).json({ error: 'contactId is required' });

    const rule = await AutomationRule.findOne({ _id: ruleId, companyId: req.user.company }).lean();
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const contact = await Contact.findOne({ _id: contactId, company: req.user.company })
      .select('firstName lastName email status doNotEmail emailPaused')
      .lean();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const template = await EmailTemplate.findOne({
      _id: rule.action?.templateId,
      companyId: req.user.company
    }).lean();

    const now = new Date();
    const targetStatus = String(req.body?.assumeToStatus || rule.trigger?.config?.toStatus || '').trim();
    const delayMinutes = Number(rule.action?.delayMinutes || 0) || 0;
    const cooldownMinutes = Number(rule.action?.cooldownMinutes || 0) || 0;
    const mustStillMatchAtSend = rule.action?.mustStillMatchAtSend !== false;

    const normalizedEmail = normalizeEmail(contact.email);
    const reasons = [];

    if (rule.isEnabled === false) {
      reasons.push({ code: 'RULE_DISABLED', message: 'Rule is disabled.', level: 'block' });
    }

    if (!template) {
      reasons.push({ code: 'TEMPLATE_MISSING', message: 'Template is missing.', level: 'block' });
    } else if (template.isArchived) {
      reasons.push({ code: 'TEMPLATE_ARCHIVED', message: 'Template is archived.', level: 'block' });
    } else if (template.isActive === false) {
      reasons.push({ code: 'TEMPLATE_INACTIVE', message: 'Template is inactive.', level: 'block' });
    }

    if (!normalizedEmail) {
      reasons.push({ code: 'CONTACT_EMAIL_MISSING', message: 'Contact has no email address.', level: 'block' });
    } else if (!isValidEmail(normalizedEmail)) {
      reasons.push({ code: 'CONTACT_EMAIL_INVALID', message: 'Contact email is invalid.', level: 'block' });
    }

    if (contact.emailPaused) {
      reasons.push({ code: 'CONTACT_PAUSED', message: 'Contact is paused from email.', level: 'block' });
    }
    if (contact.doNotEmail) {
      reasons.push({ code: 'DO_NOT_EMAIL', message: 'Contact is marked as do-not-email.', level: 'block' });
    }

    if (normalizedEmail) {
      const suppression = await Suppression.findOne({
        companyId: req.user.company,
        email: normalizedEmail
      }).lean();
      if (suppression) {
        reasons.push({ code: 'SUPPRESSED', message: 'Email is suppressed.', level: 'block' });
      }
    }

    if (cooldownMinutes > 0) {
      const since = new Date(now.getTime() - cooldownMinutes * 60000);
      const recent = await EmailJob.findOne({
        companyId: req.user.company,
        contactId: contactId,
        ruleId: ruleId,
        status: {
          $in: [EmailJob.STATUS.QUEUED, EmailJob.STATUS.PROCESSING, EmailJob.STATUS.SENT]
        },
        createdAt: { $gte: since }
      })
        .sort({ createdAt: -1 })
        .lean();
      if (recent) {
        const elapsedMinutes = Math.floor((now.getTime() - new Date(recent.createdAt).getTime()) / 60000);
        const remainingMinutes = Math.max(0, cooldownMinutes - elapsedMinutes);
        reasons.push({
          code: 'COOLDOWN_ACTIVE',
          message: `Cooldown active (${remainingMinutes} minutes remaining).`,
          level: 'block',
          details: {
            lastJobId: recent._id,
            lastStatus: recent.status,
            lastCreatedAt: recent.createdAt,
            remainingMinutes
          }
        });
      }
    }

    let settings = null;
    try {
      settings = await getEmailSettings(req.user.company);
    } catch (err) {
      reasons.push({
        code: 'SETTINGS_MISSING',
        message: 'Email settings missing; using base time.',
        level: 'info'
      });
    }

    const baseTime = new Date(now.getTime() + Math.max(0, delayMinutes) * 60000);
    let wouldSendAt = baseTime;
    if (settings) {
      wouldSendAt = adjustToAllowedWindow(baseTime, settings);
      if (wouldSendAt.getTime() > baseTime.getTime()) {
        reasons.push({
          code: 'OUTSIDE_SEND_WINDOW',
          message: 'Send time will be moved to the next allowed window.',
          level: 'info',
          details: { scheduledFor: wouldSendAt }
        });
      }
    }

    const hasBlocking = reasons.some((reason) => reason.level === 'block');

    return res.json({
      wouldEnqueue: !hasBlocking,
      wouldSendAt: !hasBlocking ? wouldSendAt : null,
      reasons,
      context: {
        contactEmail: contact.email || null,
        normalizedEmail: normalizedEmail || null,
        contactPaused: Boolean(contact.emailPaused),
        templateArchived: Boolean(template?.isArchived),
        templateInactive: template ? template.isActive === false : null,
        ruleEnabled: rule.isEnabled !== false,
        mustStillMatchAtSend,
        delayMinutes,
        cooldownMinutes,
        targetStatus
      }
    });
  } catch (err) {
    console.error('[email-rules] simulate failed', err);
    res.status(500).json({ error: err.message || 'Failed to simulate rule' });
  }
});

module.exports = router;
