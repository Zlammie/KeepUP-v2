const AutoFollowUpSchedule = require('../../models/AutoFollowUpSchedule');
const Contact = require('../../models/Contact');
const EmailJob = require('../../models/EmailJob');
const { enqueueEmailJob, buildContactMergeData } = require('./scheduler');

function isEmailChannel(channel) {
  return String(channel || '').trim().toLowerCase() === 'email';
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

async function enqueueScheduleEmailsForContact({ companyId, contactId, scheduleId }) {
  if (!companyId || !contactId || !scheduleId) {
    throw new Error('companyId, contactId, and scheduleId are required');
  }

  const [schedule, contact] = await Promise.all([
    AutoFollowUpSchedule.findOne({ _id: scheduleId, company: companyId }).lean(),
    Contact.findOne({ _id: contactId, company: companyId })
      .select('firstName lastName email phone status doNotEmail followUpSchedule')
      .lean()
  ]);

  if (!schedule) {
    return { enqueued: 0, canceledCount: 0, reason: 'schedule_missing' };
  }
  if (!contact) {
    return { enqueued: 0, canceledCount: 0, reason: 'contact_missing' };
  }

  const previousScheduleId = contact.followUpSchedule?.scheduleId || null;
  const cancelReason =
    previousScheduleId && String(previousScheduleId) === String(scheduleId)
      ? 'SCHEDULE_REAPPLIED'
      : 'SCHEDULE_REPLACED';
  const cancellation = await EmailJob.updateMany(
    {
      companyId,
      contactId,
      scheduleId: { $ne: null },
      status: EmailJob.STATUS.QUEUED
    },
    {
      $set: {
        status: EmailJob.STATUS.CANCELED,
        lastError: cancelReason
      }
    }
  );
  const canceledCount = cancellation?.modifiedCount ?? cancellation?.nModified ?? 0;

  const stopStatuses = Array.isArray(schedule.stopOnStatuses)
    ? schedule.stopOnStatuses.map((s) => normalizeStatus(s))
    : [];
  if (stopStatuses.length && stopStatuses.includes(normalizeStatus(contact.status))) {
    return { enqueued: 0, canceledCount, reason: 'stopped_by_status' };
  }

  const steps = Array.isArray(schedule.steps) ? schedule.steps.slice() : [];
  const sortedSteps = steps.sort((a, b) => {
    const orderA = Number.isFinite(a?.order) ? a.order : Number(a?.dayOffset ?? 0);
    const orderB = Number.isFinite(b?.order) ? b.order : Number(b?.dayOffset ?? 0);
    return orderA - orderB;
  });

  const mergeData = buildContactMergeData(contact);
  let enqueued = 0;

  for (const step of sortedSteps) {
    if (!isEmailChannel(step.channel)) continue;
    const templateId = step.templateRef || step.templateId || null;
    if (!templateId) continue;

    const dayOffset = Number(step.dayOffset ?? 0);
    const delayMinutes = Number.isNaN(dayOffset) ? 0 : Math.max(0, dayOffset) * 24 * 60;
    const scheduledFor = new Date(Date.now() + delayMinutes * 60000);

    const result = await enqueueEmailJob({
      companyId,
      to: contact.email,
      contactId,
      templateId,
      scheduleId,
      scheduleStepId: step.stepId || step._id || null,
      scheduledFor,
      data: mergeData,
      meta: {
        scheduleName: schedule.name || '',
        stopOnStatuses: stopStatuses
      }
    });

    if (result?.job) enqueued += 1;
  }

  return { enqueued, canceledCount };
}

module.exports = { enqueueScheduleEmailsForContact };
