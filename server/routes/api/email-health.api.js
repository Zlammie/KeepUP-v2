const express = require('express');

const requireRole = require('../../middleware/requireRole');
const EmailJob = require('../../models/EmailJob');
const EmailSettings = require('../../models/EmailSettings');

const router = express.Router();

const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];

const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const pollMs = toNumber(process.env.EMAIL_JOB_POLL_MS, 60000);
    const staleMs = toNumber(process.env.STALE_PROCESSING_MS, 10 * 60 * 1000);
    const maxJobsPerTick = toNumber(process.env.MAX_JOBS_PER_TICK, 25);
    const maxAttempts = toNumber(process.env.MAX_EMAIL_ATTEMPTS, 3);
    const logLevel = String(process.env.EMAIL_PROCESSOR_LOG_LEVEL || 'info').toLowerCase();
    const processorEnabled =
      process.env.EMAIL_JOB_PROCESSOR === 'true' || process.env.NODE_ENV !== 'production';

    const staleCutoff = new Date(now.getTime() - staleMs);

    const baseFilter = { companyId: req.user.company };

    const [
      dueNow,
      queued,
      processing,
      stuckProcessing,
      failed24h,
      skipped24h,
      sent24h,
      retrying,
      settings
    ] = await Promise.all([
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.QUEUED,
        scheduledFor: { $lte: now },
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } }
        ]
      }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.QUEUED }),
      EmailJob.countDocuments({ ...baseFilter, status: EmailJob.STATUS.PROCESSING }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.PROCESSING,
        processingAt: { $lte: staleCutoff }
      }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.FAILED,
        updatedAt: { $gte: oneDayAgo }
      }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.SKIPPED,
        updatedAt: { $gte: oneDayAgo }
      }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.SENT,
        $or: [{ sentAt: { $gte: oneDayAgo } }, { sentAt: null, updatedAt: { $gte: oneDayAgo } }]
      }),
      EmailJob.countDocuments({
        ...baseFilter,
        status: EmailJob.STATUS.QUEUED,
        nextAttemptAt: { $gt: now }
      }),
      EmailSettings.findOne({ companyId: req.user.company })
        .select('dailyCap rateLimitPerMinute timezone')
        .lean()
    ]);

    const recentFailures = await EmailJob.find({
      ...baseFilter,
      status: EmailJob.STATUS.FAILED,
      updatedAt: { $gte: twoDaysAgo }
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('templateId', 'name')
      .lean();

    const recentStuck = await EmailJob.find({
      ...baseFilter,
      status: EmailJob.STATUS.PROCESSING,
      processingAt: { $lte: staleCutoff }
    })
      .sort({ processingAt: 1 })
      .limit(10)
      .lean();

    const failureList = recentFailures.map((job) => ({
      _id: job._id,
      to: job.to,
      templateName: job.templateId?.name || null,
      lastError: job.lastError ? String(job.lastError).slice(0, 140) : null,
      attempts: job.attempts || 0,
      updatedAt: job.updatedAt,
      scheduledFor: job.scheduledFor
    }));

    const stuckList = recentStuck.map((job) => ({
      _id: job._id,
      to: job.to,
      processingAt: job.processingAt,
      attempts: job.attempts || 0,
      lastError: job.lastError ? String(job.lastError).slice(0, 140) : null
    }));

    res.json({
      config: {
        processorEnabled,
        pollMs,
        staleMs,
        maxJobsPerTick,
        maxAttempts,
        logLevel
      },
      counts: {
        dueNow,
        queued,
        processing,
        stuckProcessing,
        failed24h,
        skipped24h,
        sent24h,
        retrying
      },
      recentFailures: failureList,
      recentStuck: stuckList,
      settings: {
        settingsPresent: Boolean(settings),
        dailyCap: settings?.dailyCap ?? null,
        rateLimitPerMinute: settings?.rateLimitPerMinute ?? null,
        timezone: settings?.timezone ?? null
      }
    });
  } catch (err) {
    console.error('[email-health] fetch failed', err);
    res.status(500).json({ error: 'Failed to load email processor health' });
  }
});

module.exports = router;
