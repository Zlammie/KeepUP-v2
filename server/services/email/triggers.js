const AutomationRule = require('../../models/AutomationRule');
const EmailJob = require('../../models/EmailJob');
const Contact = require('../../models/Contact');
const { enqueueEmailJob, buildContactMergeData } = require('./scheduler');

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function ruleMatchesContact(rule, { previousStatus, nextStatus, communityIds }) {
  const config = rule?.trigger?.config || {};
  const fromStatus = normalizeStatus(config.fromStatus);
  const toStatus = normalizeStatus(config.toStatus);
  const next = normalizeStatus(nextStatus);
  const prev = normalizeStatus(previousStatus);

  if (toStatus && next !== toStatus) return false;
  if (fromStatus && prev !== fromStatus) return false;

  const communityId = config.communityId ? String(config.communityId) : '';
  if (communityId) {
    const contactCommunities = Array.isArray(communityIds)
      ? communityIds.map((id) => String(id))
      : [];
    if (!contactCommunities.includes(communityId)) return false;
  }

  return true;
}

async function handleContactStatusChange({
  companyId,
  contactId,
  previousStatus,
  nextStatus
}) {
  if (!companyId || !contactId) return { enqueued: 0 };
  const rules = await AutomationRule.find({
    companyId,
    isEnabled: true,
    'trigger.type': AutomationRule.TRIGGER_TYPES.CONTACT_STATUS_CHANGED
  }).lean();

  if (!rules.length) return { enqueued: 0 };

  const contact = await Contact.findOne({ _id: contactId, company: companyId })
    .select('firstName lastName email phone status communityIds doNotEmail')
    .lean();

  if (!contact) return { enqueued: 0 };

  let enqueued = 0;
  const now = Date.now();

  for (const rule of rules) {
    if (!ruleMatchesContact(rule, { previousStatus, nextStatus, communityIds: contact.communityIds })) {
      continue;
    }

    const cooldownMinutes = Number(rule?.action?.cooldownMinutes || 0);
    if (cooldownMinutes > 0) {
      const since = new Date(now - cooldownMinutes * 60000);
      const recent = await EmailJob.findOne({
        companyId,
        contactId,
        ruleId: rule._id,
        status: {
          $in: [EmailJob.STATUS.QUEUED, EmailJob.STATUS.PROCESSING, EmailJob.STATUS.SENT]
        },
        createdAt: { $gte: since }
      }).lean();
      if (recent) {
        continue;
      }
    }

    const delayMinutes = Number(rule?.action?.delayMinutes || 0);
    const mergeData = buildContactMergeData(contact);
    const result = await enqueueEmailJob({
      companyId,
      to: contact.email,
      contactId,
      templateId: rule.action.templateId,
      ruleId: rule._id,
      delayMinutes,
      data: mergeData,
      meta: {
        trigger: rule.trigger,
        mustStillMatchAtSend: Boolean(rule.action?.mustStillMatchAtSend)
      }
    });

    if (result?.job) enqueued += 1;
  }

  return { enqueued };
}

module.exports = { handleContactStatusChange };
