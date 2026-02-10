#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const connectDB = require('../server/config/db');
const Company = require('../server/models/Company');
const EmailTemplate = require('../server/models/EmailTemplate');
const EmailBlast = require('../server/models/EmailBlast');
const EmailJob = require('../server/models/EmailJob');
const EmailSettings = require('../server/models/EmailSettings');
const { processDueEmailJobs } = require('../server/services/email/scheduler');

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    iUnderstand: args.has('--i-understand'),
    allowNonDev: args.has('--allow-non-dev'),
    force: args.has('--force'),
    keep: args.has('--keep')
  };
}

function guardEnvironment({ iUnderstand, allowNonDev, force }) {
  if (!iUnderstand) {
    throw new Error('Refusing to run without --i-understand');
  }

  if (process.env.NODE_ENV !== 'development' && !allowNonDev) {
    throw new Error('Refusing to run outside NODE_ENV=development without --allow-non-dev');
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required.');
  }
  const lowerUri = uri.toLowerCase();
  if (!force && (lowerUri.includes('mongodb.net') || lowerUri.includes('prod') || lowerUri.includes('keepupcrm.com'))) {
    throw new Error('Refusing to run against a production-like URI without --force');
  }
  return uri;
}

async function run() {
  const options = parseArgs();
  const uri = guardEnvironment(options);
  await connectDB(uri);

  const createdIds = {
    companyId: null,
    templateId: null,
    blastId: null,
    jobId: null
  };

  try {
    const companyName = `Blast Pause Test ${Date.now()}`;
    const company = await Company.create({ name: companyName });
    createdIds.companyId = company._id;

    const template = await EmailTemplate.create({
      companyId: company._id,
      name: `Pause Test Template ${Date.now()}`,
      type: EmailTemplate.TYPES.BLAST,
      subject: 'Pause test',
      html: '<p>Pause test</p>',
      text: 'Pause test'
    });
    createdIds.templateId = template._id;

    const blast = await EmailBlast.create({
      companyId: company._id,
      name: 'Pause Test Blast',
      templateId: template._id,
      status: EmailBlast.STATUS.SCHEDULED,
      audienceType: 'contacts'
    });
    createdIds.blastId = blast._id;

    const job = await EmailJob.create({
      companyId: company._id,
      to: 'pause-test@example.com',
      templateId: template._id,
      blastId: blast._id,
      status: EmailJob.STATUS.QUEUED,
      scheduledFor: new Date(),
      provider: 'mock'
    });
    createdIds.jobId = job._id;

    await EmailBlast.updateOne(
      { _id: blast._id },
      {
        $set: {
          status: EmailBlast.STATUS.PAUSED,
          pausedAt: new Date(),
          lastStateBeforePause: EmailBlast.STATUS.SCHEDULED
        }
      }
    );
    await EmailJob.updateOne(
      { _id: job._id },
      { $set: { lastError: 'BLAST_PAUSED' } }
    );

    await processDueEmailJobs({ limit: 5 });
    const pausedJob = await EmailJob.findById(job._id).lean();
    if (pausedJob?.status !== EmailJob.STATUS.QUEUED || pausedJob?.lastError !== 'BLAST_PAUSED') {
      throw new Error('Paused blast did not keep job queued with BLAST_PAUSED.');
    }
    if (pausedJob?.attempts && pausedJob.attempts !== 0) {
      throw new Error('Paused blast should not increment attempts.');
    }

    const pausedBlast = await EmailBlast.findById(blast._id).lean();
    const pausedAt = pausedBlast?.pausedAt ? new Date(pausedBlast.pausedAt).getTime() : null;

    await EmailBlast.updateOne(
      { _id: blast._id },
      { $set: { status: EmailBlast.STATUS.PAUSED } }
    );
    const pausedBlastAgain = await EmailBlast.findById(blast._id).lean();
    const pausedAtAgain = pausedBlastAgain?.pausedAt ? new Date(pausedBlastAgain.pausedAt).getTime() : null;
    if (pausedAt && pausedAtAgain && pausedAtAgain !== pausedAt) {
      throw new Error('Pause should be idempotent; pausedAt should not change.');
    }

    await EmailBlast.updateOne(
      { _id: blast._id },
      { $set: { status: EmailBlast.STATUS.SCHEDULED, lastStateBeforePause: EmailBlast.STATUS.SCHEDULED } }
    );
    const resumeNoop = await EmailBlast.findById(blast._id).lean();
    if (resumeNoop?.status !== EmailBlast.STATUS.SCHEDULED) {
      throw new Error('Resume no-op should not change status.');
    }

    await EmailBlast.updateOne(
      { _id: blast._id },
      { $set: { status: EmailBlast.STATUS.SCHEDULED } }
    );
    await EmailJob.updateOne(
      { _id: job._id },
      { $set: { lastError: null, nextAttemptAt: null } }
    );
    await processDueEmailJobs({ limit: 5 });
    const sentJob = await EmailJob.findById(job._id).lean();
    if (sentJob?.status !== EmailJob.STATUS.SENT) {
      throw new Error('Resumed blast did not send queued job.');
    }

    console.log('[blast-pause-test] PASSED');
  } finally {
    if (!options.keep && createdIds.companyId) {
      await Promise.all([
        EmailJob.deleteMany({ companyId: createdIds.companyId }),
        EmailBlast.deleteMany({ companyId: createdIds.companyId }),
        EmailTemplate.deleteMany({ companyId: createdIds.companyId }),
        EmailSettings.deleteMany({ companyId: createdIds.companyId }),
        Company.deleteMany({ _id: createdIds.companyId })
      ]);
    }
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[blast-pause-test] failed:', err.message || err);
  process.exitCode = 1;
});
