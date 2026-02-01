const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const EmailTemplate = require('../../models/EmailTemplate');
const Contact = require('../../models/Contact');
const { renderTemplate, extractVariables } = require('../../services/email/renderTemplate');
const { buildContactMergeData } = require('../../services/email/scheduler');

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
    const { type, active } = req.query || {};
    const filter = { companyId: req.user.company };
    if (typeof type === 'string' && type.trim()) filter.type = type.trim();
    if (typeof active === 'string' && active.trim()) {
      filter.isActive = active.trim().toLowerCase() !== 'false';
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
    const html = typeof payload.html === 'string' ? payload.html : '';
    const text = typeof payload.text === 'string' ? payload.text : '';
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
    if (typeof payload.html === 'string') template.html = payload.html;
    if (typeof payload.text === 'string') template.text = payload.text;
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

router.post('/:templateId/preview', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const templateId = toObjectId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const contactId = toObjectId(req.body?.contactId);
    let contactData = {};
    if (contactId) {
      const contact = await Contact.findOne({ _id: contactId, company: req.user.company })
        .select('firstName lastName email phone status')
        .lean();
      contactData = buildContactMergeData(contact);
    }

    const rendered = renderTemplate(
      { subject: template.subject, html: template.html, text: template.text },
      contactData
    );

    res.json({ rendered });
  } catch (err) {
    console.error('[email-templates] preview failed', err);
    res.status(500).json({ error: 'Failed to render preview' });
  }
});

module.exports = router;
