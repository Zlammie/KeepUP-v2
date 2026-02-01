const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const EmailJob = require('../../models/EmailJob');
const AutoFollowUpSchedule = require('../../models/AutoFollowUpSchedule');
const EmailBlast = require('../../models/EmailBlast');
const { getEmailSettings, adjustToAllowedWindow, getLocalDayBounds } = require('../../services/email/scheduler');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const MANAGE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

function buildBucketRange(bucket, settings) {
  const now = new Date();
  const { start: todayStart, end: tomorrowStart } = getLocalDayBounds(now, settings.timezone || 'UTC');
  const dayAfter = new Date(tomorrowStart.getTime() + 1);
  const { end: dayAfterEnd } = getLocalDayBounds(dayAfter, settings.timezone || 'UTC');
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (bucket) {
    case 'today':
      return { start: todayStart, end: tomorrowStart };
    case 'tomorrow':
      return { start: tomorrowStart, end: dayAfterEnd };
    case 'week':
      return { start: dayAfterEnd, end: weekEnd };
    case 'later':
      return { start: weekEnd, end: null };
    default:
      return { start: null, end: null };
  }
}

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const { bucket, status, blastId } = req.query || {};
    const settings = await getEmailSettings(req.user.company);
    const { start, end } = buildBucketRange(bucket, settings);

    const filter = { companyId: req.user.company };
    const blastObjectId = toObjectId(blastId);
    if (blastObjectId) {
      filter.blastId = blastObjectId;
    }
    if (start || end) {
      filter.scheduledFor = {};
      if (start) filter.scheduledFor.$gte = start;
      if (end) filter.scheduledFor.$lt = end;
    }

    if (typeof status === 'string' && status.trim()) {
      filter.status = status.trim().toLowerCase();
    } else if (bucket && bucket !== 'sent') {
      filter.status = { $in: [EmailJob.STATUS.QUEUED, EmailJob.STATUS.PROCESSING] };
    } else if (bucket === 'sent') {
      filter.status = {
        $in: [
          EmailJob.STATUS.SENT,
          EmailJob.STATUS.FAILED,
          EmailJob.STATUS.CANCELED,
          EmailJob.STATUS.SKIPPED
        ]
      };
    }

    const jobs = await EmailJob.find(filter)
      .sort({ scheduledFor: 1, createdAt: -1 })
      .populate('templateId', 'name')
      .populate('ruleId', 'name')
      .lean();

    const scheduleIds = jobs
      .map((job) => job.scheduleId)
      .filter(Boolean)
      .map((id) => String(id));
    let schedulesById = {};
    if (scheduleIds.length) {
      const scheduleDocs = await AutoFollowUpSchedule.find({
        _id: { $in: scheduleIds },
        company: req.user.company
      })
        .select('name')
        .lean();
      schedulesById = scheduleDocs.reduce((acc, doc) => {
        acc[String(doc._id)] = doc;
        return acc;
      }, {});
    }

    const blastIds = jobs
      .map((job) => job.blastId)
      .filter(Boolean)
      .map((id) => String(id));
    let blastsById = {};
    if (blastIds.length) {
      const blastDocs = await EmailBlast.find({
        _id: { $in: blastIds },
        companyId: req.user.company
      })
        .select('name')
        .lean();
      blastsById = blastDocs.reduce((acc, doc) => {
        acc[String(doc._id)] = doc;
        return acc;
      }, {});
    }

    const shaped = jobs.map((job) => ({
      _id: job._id,
      to: job.to,
      scheduledFor: job.scheduledFor,
      status: job.status,
      lastError: job.lastError || null,
      templateName: job.templateId?.name || null,
      ruleName: job.ruleId?.name || null,
      scheduleName: job.scheduleId ? schedulesById[String(job.scheduleId)]?.name || null : null,
      blastName: job.blastId ? blastsById[String(job.blastId)]?.name || null : null,
      reason: job.blastId ? 'blast' : (job.ruleId ? 'rule' : (job.scheduleId ? 'schedule' : 'manual'))
    }));

    res.json({ jobs: shaped });
  } catch (err) {
    console.error('[email-queue] list failed', err);
    res.status(500).json({ error: 'Failed to load email queue' });
  }
});

router.post('/:jobId/cancel', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const jobId = toObjectId(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

    const job = await EmailJob.findOneAndUpdate(
      { _id: jobId, companyId: req.user.company, status: EmailJob.STATUS.QUEUED },
      { $set: { status: EmailJob.STATUS.CANCELED } },
      { new: true }
    ).lean();

    if (!job) return res.status(404).json({ error: 'Job not found or not cancellable' });

    res.json({ job });
  } catch (err) {
    console.error('[email-queue] cancel failed', err);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

router.post('/:jobId/reschedule', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const jobId = toObjectId(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

    const requested = new Date(req.body?.scheduledFor);
    if (!requested || Number.isNaN(requested.getTime())) {
      return res.status(400).json({ error: 'Valid scheduledFor is required' });
    }

    const settings = await getEmailSettings(req.user.company);
    const adjusted = adjustToAllowedWindow(requested, settings);

    const job = await EmailJob.findOneAndUpdate(
      { _id: jobId, companyId: req.user.company, status: EmailJob.STATUS.QUEUED },
      { $set: { scheduledFor: adjusted } },
      { new: true }
    ).lean();

    if (!job) return res.status(404).json({ error: 'Job not found or not reschedulable' });

    res.json({ job });
  } catch (err) {
    console.error('[email-queue] reschedule failed', err);
    res.status(500).json({ error: 'Failed to reschedule job' });
  }
});

module.exports = router;
