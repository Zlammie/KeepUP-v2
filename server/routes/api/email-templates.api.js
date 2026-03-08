const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const EmailTemplate = require('../../models/EmailTemplate');
const Contact = require('../../models/Contact');
const Realtor = require('../../models/Realtor');
const AutomationRule = require('../../models/AutomationRule');
const AutoFollowUpSchedule = require('../../models/AutoFollowUpSchedule');
const { renderTemplate, extractVariables } = require('../../services/email/renderTemplate');
const { buildContactMergeData } = require('../../services/email/scheduler');
const { COMMON_AUTOMATIONS } = require('../../services/email/commonAutomations');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const isAdmin = (req) => Array.isArray(req.user?.roles)
  && req.user.roles.some((role) => ADMIN_ROLES.includes(role));

function sanitizeHtmlMinimal(value) {
  if (!value || typeof value !== 'string') return '';
  let output = value;
  output = output.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  output = output.replace(/<(iframe|object|embed)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');
  output = output.replace(/<(iframe|object|embed)[^>]*\/?>/gi, '');
  output = output.replace(/\son\w+=(\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, '');
  output = output.replace(/\s(href|src)\s*=\s*(["']?)([^"'\s>]+)\2/gi, (match, attr, quote, url) => {
    const normalized = String(url).replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
    const isSrc = String(attr).toLowerCase() === 'src';
    const allowedHref = normalized.startsWith('http://')
      || normalized.startsWith('https://')
      || normalized.startsWith('mailto:')
      || normalized.startsWith('tel:');
    const allowedSrc = normalized.startsWith('http://')
      || normalized.startsWith('https://')
      || normalized.startsWith('/uploads/')
      || normalized.startsWith('/uploads/email-assets/');
    if (normalized.startsWith('javascript:')) {
      return ` ${attr}=${quote || '"'}#${quote || '"'}`;
    }
    if (isSrc && !allowedSrc) {
      return ` ${attr}=${quote || '"'}#${quote || '"'}`;
    }
    if (!isSrc && !allowedHref) {
      return ` ${attr}=${quote || '"'}#${quote || '"'}`;
    }
    return match;
  });
  output = output.replace(/javascript:/gi, '');
  return output;
}

function stripHtmlToText(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveValue(path, data) {
  if (!path) return null;
  const parts = String(path).split('.');
  let current = data;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current;
}

function buildRealtorMergeData(realtor) {
  if (!realtor) return {};
  const firstName = realtor.firstName || '';
  const lastName = realtor.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    realtor: {
      firstName,
      lastName,
      fullName,
      email: realtor.email || '',
      company: realtor.brokerage || ''
    }
  };
}

async function getTemplateUsage({ companyId, templateId }) {
  const [rules, schedules] = await Promise.all([
    AutomationRule.find({
      companyId,
      'action.templateId': templateId,
      isEnabled: { $ne: false }
    }).select('name').lean(),
    AutoFollowUpSchedule.find({
      company: companyId,
      steps: { $elemMatch: { templateRef: templateId } }
    }).select('name').lean()
  ]);

  let appliedSchedules = [];
  if (schedules.length) {
    const scheduleIds = schedules.map((schedule) => schedule._id);
    const appliedCounts = await Contact.aggregate([
      {
        $match: {
          company: companyId,
          'followUpSchedule.scheduleId': { $in: scheduleIds }
        }
      },
      {
        $group: {
          _id: '$followUpSchedule.scheduleId',
          count: { $sum: 1 }
        }
      }
    ]);
    const appliedMap = new Map(
      appliedCounts.map((row) => [String(row._id), row.count])
    );
    appliedSchedules = schedules
      .filter((schedule) => appliedMap.has(String(schedule._id)))
      .map((schedule) => ({
        _id: schedule._id,
        name: schedule.name,
        appliedCount: appliedMap.get(String(schedule._id)) || 0
      }));
  }

  const commonDefs = Array.isArray(COMMON_AUTOMATIONS) ? COMMON_AUTOMATIONS : [];
  const commonRuleNames = commonDefs.map((def) => def.rule?.name).filter(Boolean);
  let commonAutomations = [];
  if (commonRuleNames.length) {
    const enabledCommonRules = await AutomationRule.find({
      companyId,
      name: { $in: commonRuleNames },
      'action.templateId': templateId,
      isEnabled: { $ne: false }
    }).select('name').lean();
    const enabledSet = new Set(enabledCommonRules.map((r) => r.name));
    commonAutomations = commonDefs
      .filter((def) => enabledSet.has(def.rule?.name))
      .map((def) => ({ key: def.key, label: def.title }));
  }

  return {
    inUse: Boolean((rules && rules.length) || (appliedSchedules && appliedSchedules.length) || (commonAutomations && commonAutomations.length)),
    usage: {
      rules: rules || [],
      schedules: appliedSchedules || [],
      commonAutomations
    }
  };
}

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const { type, active } = req.query || {};
    const filter = { companyId: req.user.company };
    if (typeof type === 'string' && type.trim()) filter.type = type.trim();
    if (typeof active === 'string' && active.trim()) {
      filter.isActive = active.trim().toLowerCase() !== 'false';
    }
    const includeArchived = String(req.query?.includeArchived || '').toLowerCase() === 'true';
    if (!includeArchived || !isAdmin(req)) {
      filter.isArchived = { $ne: true };
    }

    const templates = await EmailTemplate.find(filter)
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ templates });
  } catch (err) {
    console.error('[email-templates] list failed', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

router.get('/:templateId', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    return res.json({ template });
  } catch (err) {
    console.error('[email-templates] fetch failed', err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const previewText = typeof payload.previewText === 'string' ? payload.previewText.trim() : '';
    const html = sanitizeHtmlMinimal(typeof payload.html === 'string' ? payload.html : '');
    const text = typeof payload.text === 'string'
      ? payload.text
      : stripHtmlToText(html);
    const variables = Array.isArray(payload.variables) && payload.variables.length
      ? payload.variables
          .filter((v) => typeof v === 'string' && v.trim())
          .map((v) => v.trim())
      : extractVariables([subject, html, text].join(' '));

    const template = await EmailTemplate.create({
      companyId: req.user.company,
      name,
      type: payload.type || EmailTemplate.TYPES.AUTOMATION,
      subject,
      previewText,
      html,
      text,
      variables,
      isActive: payload.isActive !== false,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    res.status(201).json({ template });
  } catch (err) {
    console.error('[email-templates] create failed', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A template with that name already exists' });
    }
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

router.put('/:templateId', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const payload = req.body || {};
    if (typeof payload.name === 'string' && payload.name.trim()) {
      template.name = payload.name.trim();
    }
    if (typeof payload.subject === 'string') template.subject = payload.subject.trim();
    if (typeof payload.previewText === 'string') template.previewText = payload.previewText.trim();
    if (typeof payload.html === 'string') template.html = sanitizeHtmlMinimal(payload.html);
    if (typeof payload.text === 'string') {
      template.text = payload.text;
    } else if (typeof payload.html === 'string') {
      template.text = stripHtmlToText(template.html);
    }
    if (Array.isArray(payload.variables)) {
      template.variables = payload.variables
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim());
    } else if (payload.rebuildVariables) {
      template.variables = extractVariables(
        [template.subject, template.html, template.text].join(' ')
      );
    }
    if (typeof payload.type === 'string') template.type = payload.type;
    if (typeof payload.isActive === 'boolean') template.isActive = payload.isActive;

    template.version = (template.version || 1) + 1;
    template.updatedBy = req.user._id;
    await template.save();

    res.json({ template });
  } catch (err) {
    console.error('[email-templates] update failed', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A template with that name already exists' });
    }
    res.status(500).json({ error: err.message || 'Failed to update template' });
  }
});

router.get('/:templateId/usage', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).select('name').lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const usage = await getTemplateUsage({
      companyId: req.user.company,
      templateId
    });

    res.json(usage);
  } catch (err) {
    console.error('[email-templates] usage failed', err);
    res.status(500).json({ error: 'Failed to load template usage' });
  }
});

router.post('/:templateId/archive', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const archived = Boolean(req.body?.archived);
    if (archived) {
      const usage = await getTemplateUsage({
        companyId: req.user.company,
        templateId
      });
      if (usage.inUse) {
        return res.status(409).json({ error: 'Template is in use', usage: usage.usage });
      }
      template.isArchived = true;
      template.archivedAt = new Date();
      template.archivedBy = req.user?._id || null;
    } else {
      template.isArchived = false;
      template.archivedAt = null;
      template.archivedBy = null;
    }

    await template.save();
    res.json({ ok: true, template: template.toObject() });
  } catch (err) {
    console.error('[email-templates] archive failed', err);
    res.status(500).json({ error: 'Failed to archive template' });
  }
});

router.post('/:templateId/preview', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const recipientType = req.body?.recipientType === 'realtor' ? 'realtor' : 'contact';
    const recipientId = toObjectId(req.body?.recipientId);
    let mergeData = {};
    if (recipientId && recipientType === 'contact') {
      const contact = await Contact.findOne({ _id: recipientId, company: req.user.company })
        .select('firstName lastName email phone status')
        .lean();
      mergeData = buildContactMergeData(contact);
    } else if (recipientId && recipientType === 'realtor') {
      const realtor = await Realtor.findOne({ _id: recipientId, company: req.user.company })
        .select('firstName lastName email brokerage')
        .lean();
      mergeData = buildRealtorMergeData(realtor);
    }

    const data = {
      ...mergeData,
      contact: mergeData.contact || {},
      realtor: mergeData.realtor || {},
      community: {},
      lot: {},
      links: {
        scheduleUrl: '',
        buildRootzUrl: ''
      }
    };

    const rendered = renderTemplate(
      { subject: template.subject, html: template.html, text: template.text },
      data
    );

    const variables = extractVariables([template.subject, template.html, template.text].join(' '));
    const missingTokens = variables.filter((token) => {
      const value = resolveValue(token, data);
      if (value == null) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      return false;
    });

    res.json({ rendered, missingTokens });
  } catch (err) {
    console.error('[email-templates] preview failed', err);
    res.status(500).json({ error: 'Failed to render preview' });
  }
});

router.post('/:templateId/send-test', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const toEmail = typeof req.body?.toEmail === 'string' ? req.body.toEmail.trim().toLowerCase() : '';
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ error: 'Valid toEmail is required' });
    }

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const recipientType = req.body?.recipientType === 'realtor' ? 'realtor' : 'contact';
    const recipientId = toObjectId(req.body?.recipientId);
    let mergeData = {};
    if (recipientId && recipientType === 'contact') {
      const contact = await Contact.findOne({ _id: recipientId, company: req.user.company })
        .select('firstName lastName email phone status')
        .lean();
      mergeData = buildContactMergeData(contact);
    } else if (recipientId && recipientType === 'realtor') {
      const realtor = await Realtor.findOne({ _id: recipientId, company: req.user.company })
        .select('firstName lastName email brokerage')
        .lean();
      mergeData = buildRealtorMergeData(realtor);
    }

    const data = {
      ...mergeData,
      contact: mergeData.contact || {},
      realtor: mergeData.realtor || {},
      community: {},
      lot: {},
      links: {
        scheduleUrl: '',
        buildRootzUrl: ''
      }
    };

    const rendered = renderTemplate(
      { subject: template.subject, html: template.html, text: template.text },
      data
    );

    const provider = require('../../services/email/provider');
    const result = await provider.sendEmail(
      {
        to: toEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
      },
      'mock'
    );

    res.json({ ok: true, messageId: result?.messageId || null });
  } catch (err) {
    console.error('[email-templates] send-test failed', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

module.exports = router;
