const EmailJob = require('../../models/EmailJob');

async function getBlockedEmailJobsReport({ companyId, limit = 25 }) {
  if (!companyId) {
    return { total: 0, summary: [], samples: [] };
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(200, Math.max(1, limit)) : 25;

  const match = {
    companyId,
    status: EmailJob.STATUS.QUEUED,
    lastError: { $ne: null }
  };

  const summary = await EmailJob.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$lastError',
        count: { $sum: 1 },
        nextAttemptAt: { $min: '$nextAttemptAt' },
        scheduledFor: { $min: '$scheduledFor' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const samples = await EmailJob.find(match)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select('to lastError scheduledFor nextAttemptAt createdAt status fromMode fromEmailUsed replyToUsed')
    .lean();

  return {
    total: summary.reduce((acc, row) => acc + (row.count || 0), 0),
    summary: summary.map((row) => ({
      reason: row._id,
      count: row.count || 0,
      nextAttemptAt: row.nextAttemptAt || null,
      scheduledFor: row.scheduledFor || null
    })),
    samples: samples.map((job) => ({
      id: String(job._id),
      to: job.to,
      lastError: job.lastError || null,
      scheduledFor: job.scheduledFor || null,
      nextAttemptAt: job.nextAttemptAt || null,
      createdAt: job.createdAt || null,
      status: job.status,
      fromMode: job.fromMode || null,
      fromEmailUsed: job.fromEmailUsed || null,
      replyToUsed: job.replyToUsed || null
    }))
  };
}

module.exports = { getBlockedEmailJobsReport };
