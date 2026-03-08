const AutomationRule = require('../../models/AutomationRule');
const EmailTemplate = require('../../models/EmailTemplate');

const COMMON_AUTOMATIONS = [
  {
    key: 'warm_to_hot_followup',
    title: 'Warm -> Hot Follow-Up',
    description: 'When a contact becomes Hot, automatically send a follow-up email 24 hours later.',
    requiredTemplates: [
      {
        name: 'Hot Lead Follow Up',
        type: 'automation',
        subject: 'Quick follow-up - next steps at {{communityName}}',
        html: [
          '<p>Hi {{firstName}},</p>',
          '<p>Thanks again for connecting. I wanted to follow up and share next steps for {{communityName}}.</p>',
          '<p>If you would like to tour or have questions, reply here or call {{assignedManagerPhone}}.</p>',
          '<p>Best,</p>',
          '<p>{{assignedManagerName}}</p>',
          '<p><a href="{{buildrootzLink}}">View available homes</a></p>'
        ].join('\n'),
        text: [
          'Hi {{firstName}},',
          'Thanks again for connecting. I wanted to follow up and share next steps for {{communityName}}.',
          'If you would like to tour or have questions, reply here or call {{assignedManagerPhone}}.',
          'Best,',
          '{{assignedManagerName}}',
          'View available homes: {{buildrootzLink}}'
        ].join('\n'),
        variables: [
          'firstName',
          'communityName',
          'assignedManagerName',
          'assignedManagerPhone',
          'buildrootzLink'
        ]
      }
    ],
    rule: {
      name: 'Status -> Hot: Follow Up',
      trigger: { type: 'contact.status.changed', config: { toStatus: 'Hot' } },
      action: {
        type: 'sendEmail',
        templateName: 'Hot Lead Follow Up',
        delayMinutes: 1440,
        cooldownMinutes: 10080,
        mustStillMatchAtSend: true
      }
    }
  },
  {
    key: 'new_lead_auto_response',
    title: 'New Lead Auto-Response',
    description: 'When a contact becomes New, send a quick response within 10 minutes.',
    requiredTemplates: [
      {
        name: 'New Lead Auto Response',
        type: 'automation',
        subject: 'Thanks for your interest in {{communityName}}',
        html: [
          '<p>Hi {{firstName}},</p>',
          '<p>Thanks for reaching out about {{communityName}}. I will follow up shortly with next steps.</p>',
          '<p>In the meantime, you can preview listings here:</p>',
          '<p><a href="{{buildrootzLink}}">{{buildrootzLink}}</a></p>',
          '<p>Best,</p>',
          '<p>{{assignedManagerName}}</p>'
        ].join('\n'),
        text: [
          'Hi {{firstName}},',
          'Thanks for reaching out about {{communityName}}. I will follow up shortly with next steps.',
          'Preview listings: {{buildrootzLink}}',
          'Best,',
          '{{assignedManagerName}}'
        ].join('\n'),
        variables: [
          'firstName',
          'communityName',
          'assignedManagerName',
          'buildrootzLink'
        ]
      }
    ],
    rule: {
      name: 'Status -> New: Auto Response',
      trigger: { type: 'contact.status.changed', config: { toStatus: 'New' } },
      action: {
        type: 'sendEmail',
        templateName: 'New Lead Auto Response',
        delayMinutes: 10,
        cooldownMinutes: 1440,
        mustStillMatchAtSend: true
      }
    }
  },
  {
    key: 'under_contract_checklist',
    title: 'Under Contract Checklist',
    description: 'When a contact enters Negotiating (Under Contract), send a checklist immediately.',
    requiredTemplates: [
      {
        name: 'Under Contract Checklist',
        type: 'automation',
        subject: 'Your next steps checklist for {{communityName}}',
        html: [
          '<p>Hi {{firstName}},</p>',
          '<p>Congrats on moving forward! Here is a quick checklist for what comes next:</p>',
          '<ul>',
          '<li>Confirm financing timeline</li>',
          '<li>Review contract details</li>',
          '<li>Schedule your next appointment</li>',
          '</ul>',
          '<p>Reply with any questions or call {{assignedManagerPhone}}.</p>',
          '<p>Best,</p>',
          '<p>{{assignedManagerName}}</p>'
        ].join('\n'),
        text: [
          'Hi {{firstName}},',
          'Congrats on moving forward! Here is a quick checklist for what comes next:',
          '- Confirm financing timeline',
          '- Review contract details',
          '- Schedule your next appointment',
          'Reply with any questions or call {{assignedManagerPhone}}.',
          'Best,',
          '{{assignedManagerName}}'
        ].join('\n'),
        variables: [
          'firstName',
          'communityName',
          'assignedManagerName',
          'assignedManagerPhone'
        ]
      }
    ],
    rule: {
      name: 'Status -> Negotiating: Checklist',
      trigger: { type: 'contact.status.changed', config: { toStatus: 'Negotiating' } },
      action: {
        type: 'sendEmail',
        templateName: 'Under Contract Checklist',
        delayMinutes: 0,
        cooldownMinutes: 43200,
        mustStillMatchAtSend: false
      }
    }
  }
];

const findTemplateByName = (templates, name) =>
  templates.find((template) => template.name === name);

async function ensureTemplates(companyId, userId, requiredTemplates) {
  const names = requiredTemplates.map((template) => template.name);
  const existing = await EmailTemplate.find({ companyId, name: { $in: names } }).lean();
  const byName = new Map(existing.map((template) => [template.name, template]));
  const created = [];

  for (const template of requiredTemplates) {
    if (byName.has(template.name)) {
      continue;
    }
    const createdTemplate = await EmailTemplate.create({
      companyId,
      name: template.name,
      type: template.type || 'automation',
      subject: template.subject || '',
      html: template.html || '',
      text: template.text || '',
      variables: template.variables || [],
      isActive: true,
      createdBy: userId,
      updatedBy: userId
    });
    created.push(createdTemplate.toObject());
    byName.set(template.name, createdTemplate.toObject());
  }

  return {
    templates: Array.from(byName.values()),
    created
  };
}

async function findExistingRule(companyId, ruleDefinition, templateId) {
  const byName = await AutomationRule.findOne({
    companyId,
    name: ruleDefinition.name
  });
  if (byName) return byName;

  if (!templateId) return null;

  return AutomationRule.findOne({
    companyId,
    'trigger.type': ruleDefinition.trigger.type,
    'trigger.config.toStatus': ruleDefinition.trigger.config?.toStatus || null,
    'action.templateId': templateId
  });
}

async function ensureCommonAutomation(companyId, userId, key) {
  const definition = COMMON_AUTOMATIONS.find((item) => item.key === key);
  if (!definition) {
    throw new Error('Unknown common automation key');
  }

  const { templates } = await ensureTemplates(
    companyId,
    userId,
    definition.requiredTemplates || []
  );
  const ruleTemplate = findTemplateByName(templates, definition.rule.action.templateName);
  const templateId = ruleTemplate?._id || null;

  let rule = await findExistingRule(companyId, definition.rule, templateId);
  if (!rule) {
    if (!templateId) {
      throw new Error('Required template is missing');
    }
    rule = await AutomationRule.create({
      companyId,
      name: definition.rule.name,
      isEnabled: true,
      trigger: {
        type: definition.rule.trigger.type,
        config: definition.rule.trigger.config || {}
      },
      action: {
        type: definition.rule.action.type,
        templateId,
        delayMinutes: definition.rule.action.delayMinutes || 0,
        cooldownMinutes: definition.rule.action.cooldownMinutes || 0,
        mustStillMatchAtSend: definition.rule.action.mustStillMatchAtSend !== false
      }
    });
  } else if (!rule.isEnabled) {
    rule.isEnabled = true;
    await rule.save();
  }

  return {
    templateIds: templates.map((template) => String(template._id)),
    ruleId: String(rule._id),
    enabled: Boolean(rule.isEnabled)
  };
}

async function disableCommonAutomation(companyId, key) {
  const definition = COMMON_AUTOMATIONS.find((item) => item.key === key);
  if (!definition) {
    throw new Error('Unknown common automation key');
  }

  const template = await EmailTemplate.findOne({
    companyId,
    name: definition.rule.action.templateName
  }).lean();
  const templateId = template?._id || null;
  const rule = await findExistingRule(companyId, definition.rule, templateId);
  if (!rule) {
    return { ruleId: null, enabled: false };
  }

  if (rule.isEnabled) {
    rule.isEnabled = false;
    await rule.save();
  }

  return { ruleId: String(rule._id), enabled: false };
}

async function getCommonAutomationStatus(companyId) {
  const statusList = [];

  for (const definition of COMMON_AUTOMATIONS) {
    const templateDocs = await EmailTemplate.find({
      companyId,
      name: { $in: (definition.requiredTemplates || []).map((t) => t.name) }
    }).lean();
    const templateIds = templateDocs.map((template) => String(template._id));
    const ruleTemplate = findTemplateByName(templateDocs, definition.rule.action.templateName);
    const templateId = ruleTemplate?._id || null;

    const rule = await findExistingRule(companyId, definition.rule, templateId);

    statusList.push({
      key: definition.key,
      title: definition.title,
      description: definition.description,
      exists: Boolean(rule),
      enabled: Boolean(rule?.isEnabled),
      ruleId: rule?._id ? String(rule._id) : null,
      templateIds
    });
  }

  return statusList;
}

module.exports = {
  COMMON_AUTOMATIONS,
  ensureCommonAutomation,
  disableCommonAutomation,
  getCommonAutomationStatus
};
