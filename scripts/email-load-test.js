const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('../server/config/db');

const Company = require('../server/models/Company');
const User = require('../server/models/User');
const Contact = require('../server/models/Contact');
const EmailSettings = require('../server/models/EmailSettings');
const Suppression = require('../server/models/Suppression');
const EmailTemplate = require('../server/models/EmailTemplate');
const AutomationRule = require('../server/models/AutomationRule');
const AutoFollowUpSchedule = require('../server/models/AutoFollowUpSchedule');
const EmailBlast = require('../server/models/EmailBlast');
const EmailJob = require('../server/models/EmailJob');

const { normalizeEmail } = require('../server/utils/normalizeEmail');
const { handleContactStatusChange } = require('../server/services/email/triggers');
const { enqueueScheduleEmailsForContact } = require('../server/services/email/schedules');
const { processDueEmailJobs, getEmailSettings, buildContactMergeData, adjustToAllowedWindow, getLocalDayBounds } = require('../server/services/email/scheduler');
const { nextAllowedSendTime, getWindowBounds, formatLocalDateKey } = require('../server/services/email/pacing');

const QA_COMPANY_PREFIX = 'KeepUp QA Email Test - ';
const DEFAULTS = {
  contacts: 200,
  blast: 300,
  rules: true,
  schedule: true,
  processorTicks: 3,
  processorTickDelayMs: 250,
  cleanup: false,
  force: false,
  allowNonDev: false,
  iUnderstand: false,
  companyId: null,
  forceExistingCompany: false,
  failRate: 0
};

const STATUS_OPTIONS = [
  'New',
  'Target',
  'Possible',
  'Hot',
  'Negotiation',
  'Be-Back',
  'Cold',
  'Purchased',
  'Closed',
  'Not-Interested',
  'Deal-Lost',
  'Bust'
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  argv.forEach((raw) => {
    if (!raw.startsWith('--')) return;
    const [key, value] = raw.replace(/^--/, '').split('=');
    switch (key) {
      case 'contacts':
      case 'blast':
      case 'processorTicks':
      case 'processorTickDelayMs':
      case 'failRate':
        args[key] = value != null ? Number(value) : args[key];
        break;
      case 'rules':
      case 'schedule':
      case 'cleanup':
      case 'force':
      case 'allow-non-dev':
      case 'i-understand':
      case 'force-existing-company':
        args[mapFlagKey(key)] = parseBool(value, true);
        break;
      case 'companyId':
        args.companyId = value ? String(value) : null;
        break;
      default:
        break;
    }
  });
  return args;
}

function mapFlagKey(key) {
  if (key === 'allow-non-dev') return 'allowNonDev';
  if (key === 'i-understand') return 'iUnderstand';
  if (key === 'force-existing-company') return 'forceExistingCompany';
  return key;
}

function parseBool(value, defaultValue) {
  if (value == null) return defaultValue;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return defaultValue;
}

function loadEnv() {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, '.env.development.local');
  const envDefault = path.join(cwd, '.env');
  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
    return envLocal;
  }
  if (fs.existsSync(envDefault)) {
    dotenv.config({ path: envDefault });
    return envDefault;
  }
  dotenv.config();
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guardEnvironment(args) {
  if (!args.iUnderstand) {
    throw new Error('Missing required flag: --i-understand');
  }
  if (process.env.NODE_ENV !== 'development' && !args.allowNonDev) {
    throw new Error('Refusing to run outside NODE_ENV=development without --allow-non-dev');
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!mongoUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required.');
  }
  const lower = mongoUri.toLowerCase();
  const looksProd = lower.includes('mongodb.net') || lower.includes('prod') || lower.includes('keepupcrm.com');
  if (looksProd && !args.force) {
    throw new Error('Refusing to run: MONGO_URI looks like production. Use --force to override.');
  }

  if (args.companyId && !args.forceExistingCompany) {
    throw new Error('Refusing to use --companyId without --force-existing-company');
  }

  return mongoUri;
}

function makeRandomId() {
  return crypto.randomUUID ? crypto.randomUUID() : new mongoose.Types.ObjectId().toString();
}

function buildContactFilter(filters, companyId) {
  const baseFilter = { company: companyId };

  if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
    baseFilter.communityIds = {
      $in: filters.communityIds.map((id) => toObjectId(id)).filter(Boolean)
    };
  }

  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    baseFilter.status = { $in: filters.statuses };
  }

  if (Array.isArray(filters.ownerIds) && filters.ownerIds.length) {
    baseFilter.ownerId = { $in: filters.ownerIds.map((id) => toObjectId(id)).filter(Boolean) };
  }

  const andClauses = [];

  if (filters.linkedLot === true) {
    andClauses.push({
      $or: [{ lotId: { $ne: null } }, { 'linkedLot.lotId': { $exists: true } }]
    });
  }

  if (Array.isArray(filters.lenderIds) && filters.lenderIds.length) {
    const lenderIds = filters.lenderIds.map((id) => toObjectId(id)).filter(Boolean);
    andClauses.push({
      $or: [{ lenderId: { $in: lenderIds } }, { 'lenders.lender': { $in: lenderIds } }]
    });
  }

  if (andClauses.length) {
    baseFilter.$and = andClauses;
  }

  if (Array.isArray(filters.tags) && filters.tags.length) {
    baseFilter.tags = { $in: filters.tags };
  }

  return baseFilter;
}

function toObjectId(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function resolveBlastRecipients({ companyId, filters }) {
  const contactFilter = buildContactFilter(filters || {}, companyId);
  const contacts = await Contact.find(contactFilter)
    .select('firstName lastName email doNotEmail emailPaused status communityIds')
    .lean();

  const suppressedEmails = await Suppression.find({ companyId }).select('email').lean();
  const suppressedSet = new Set(
    suppressedEmails
      .map((entry) => normalizeEmail(entry.email))
      .filter(Boolean)
  );

  const seenEmails = new Set();
  const recipients = [];
  const excluded = {
    suppressed: 0,
    invalidEmail: 0,
    noEmail: 0,
    doNotEmail: 0,
    duplicates: 0,
    paused: 0
  };

  contacts.forEach((contact) => {
    const email = normalizeEmail(contact.email);
    if (!email) {
      excluded.noEmail += 1;
      return;
    }
    if (!isValidEmail(email)) {
      excluded.invalidEmail += 1;
      return;
    }
    if (contact.doNotEmail) {
      excluded.doNotEmail += 1;
      return;
    }
    if (contact.emailPaused) {
      excluded.paused += 1;
      return;
    }
    if (suppressedSet.has(email)) {
      excluded.suppressed += 1;
      return;
    }
    if (seenEmails.has(email)) {
      excluded.duplicates += 1;
      return;
    }
    seenEmails.add(email);
    recipients.push({ contact, email });
  });

  return { recipients, excluded, totalMatched: contacts.length };
}

function sortRecipientsStable(list) {
  return list.slice().sort((a, b) => String(a.email).localeCompare(String(b.email)));
}

async function countSentToday(companyId, settings) {
  const now = new Date();
  const { start, end } = getLocalDayBounds(now, settings.timezone || 'UTC');
  return EmailJob.countDocuments({
    companyId,
    status: EmailJob.STATUS.SENT,
    sentAt: { $gte: start, $lt: end }
  });
}

function buildPacingSchedule({ recipients, settings, startAt, dailyCap, sentTodayCount = 0 }) {
  const ordered = sortRecipientsStable(recipients);
  const times = new Array(ordered.length);
  if (!ordered.length) {
    return { ordered, times, pacingSummary: null };
  }

  const cap = Number(dailyCap || 0);
  const alignedStart = nextAllowedSendTime(startAt, settings);

  if (!cap || Number.isNaN(cap) || cap <= 0) {
    for (let i = 0; i < ordered.length; i += 1) {
      times[i] = alignedStart;
    }
    return {
      ordered,
      times,
      pacingSummary: {
        firstSendAt: alignedStart,
        lastSendAt: alignedStart,
        daysSpanned: 1,
        perDayPlanned: { [formatLocalDateKey(alignedStart, settings.timezone || 'UTC')]: ordered.length }
      }
    };
  }

  const now = new Date();
  const todayBounds = getLocalDayBounds(now, settings.timezone || 'UTC');
  const remainingToday =
    alignedStart >= todayBounds.start && alignedStart < todayBounds.end
      ? Math.max(0, cap - Number(sentTodayCount || 0))
      : cap;

  let remainingForDay = remainingToday;
  let cursor = alignedStart;
  let index = 0;
  const perDayCounts = new Map();

  while (index < ordered.length) {
    const window = getWindowBounds(cursor, settings);
    let dayStart = window.windowStart;
    if (cursor > dayStart) dayStart = cursor;

    const available = Math.min(remainingForDay, ordered.length - index);
    if (available <= 0) {
      cursor = nextAllowedSendTime(new Date(window.windowEnd.getTime() + 1000), settings);
      remainingForDay = cap;
      continue;
    }

    const spanMs = Math.max(1, window.windowEnd.getTime() - dayStart.getTime());
    const intervalMs = Math.floor(spanMs / available);

    for (let i = 0; i < available; i += 1) {
      let scheduled = new Date(dayStart.getTime() + intervalMs * i);
      if (scheduled >= window.windowEnd) {
        scheduled = new Date(window.windowEnd.getTime() - 60000);
      }
      if (scheduled < dayStart) scheduled = dayStart;

      times[index] = scheduled;
      const dayKey = formatLocalDateKey(scheduled, window.timeZone);
      perDayCounts.set(dayKey, (perDayCounts.get(dayKey) || 0) + 1);
      index += 1;
    }

    cursor = nextAllowedSendTime(new Date(window.windowEnd.getTime() + 1000), settings);
    remainingForDay = cap;
  }

  const firstSendAt = times[0];
  const lastSendAt = times[times.length - 1];
  const pacingSummary = {
    firstSendAt,
    lastSendAt,
    daysSpanned: perDayCounts.size,
    perDayPlanned: Object.fromEntries(perDayCounts.entries())
  };

  return { ordered, times, pacingSummary };
}

async function createBlast({ companyId, userId, templateId, name, filters, sendMode, scheduledFor, requestId }) {
  if (requestId) {
    const existing = await EmailBlast.findOne({ companyId, requestId }).lean();
    if (existing) {
      return { blast: existing, idempotent: true };
    }
  }

  const template = await EmailTemplate.findOne({ _id: templateId, companyId }).lean();
  if (!template) throw new Error('Template not found');
  if (template.isActive === false) throw new Error('Template inactive');

  const { recipients, excluded, totalMatched } = await resolveBlastRecipients({ companyId, filters });
  const excludedTotal =
    excluded.suppressed +
    excluded.invalidEmail +
    excluded.noEmail +
    excluded.doNotEmail +
    excluded.duplicates +
    excluded.paused;

  const settings = await getEmailSettings(companyId);
  let scheduledAt = null;
  if (sendMode === 'scheduled') {
    scheduledAt = adjustToAllowedWindow(scheduledFor, settings);
  } else {
    scheduledAt = nextAllowedSendTime(new Date(), settings);
  }

  const dailyCap = Number(settings?.dailyCap || 0);
  const sentTodayCount = dailyCap > 0 ? await countSentToday(companyId, settings) : 0;
  const pacingPlan = buildPacingSchedule({
    recipients,
    settings,
    startAt: scheduledAt,
    dailyCap,
    sentTodayCount
  });

  const blast = await EmailBlast.create({
    companyId,
    name,
    templateId,
    createdBy: userId || null,
    requestId: requestId || null,
    status: EmailBlast.STATUS.SCHEDULED,
    audience: {
      type: 'contacts',
      filters,
      snapshotCount: totalMatched,
      excludedCount: excludedTotal
    },
    schedule: {
      sendMode,
      scheduledFor: pacingPlan.pacingSummary?.firstSendAt || scheduledAt
    },
    settingsSnapshot: {
      timezone: settings.timezone || null,
      dailyCap: settings.dailyCap ?? null,
      rateLimitPerMinute: settings.rateLimitPerMinute ?? null
    },
    pacingSummary: pacingPlan.pacingSummary || null
  });

  const jobs = pacingPlan.ordered.map(({ contact, email }, index) => ({
    companyId,
    to: normalizeEmail(email),
    contactId: contact._id,
    templateId,
    blastId: blast._id,
    data: buildContactMergeData(contact),
    scheduledFor: pacingPlan.times[index] || scheduledAt,
    status: EmailJob.STATUS.QUEUED,
    provider: 'mock',
    meta: { blastName: name }
  }));

  if (jobs.length) {
    await EmailJob.insertMany(jobs, { ordered: false });
  }

  return { blast, idempotent: false, recipients, excluded, pacingSummary: pacingPlan.pacingSummary };
}

async function seedContacts({ companyId, userId, count }) {
  const missingCount = Math.floor(count * 0.05);
  const invalidCount = Math.floor(count * 0.05);
  const pausedCount = Math.floor(count * 0.1);
  const duplicateCount = Math.floor(count * 0.1);

  const contacts = [];
  const baseCount = count - duplicateCount;

  for (let i = 0; i < baseCount; i += 1) {
    const email = `qa-contact-${i}@example.com`;
    contacts.push({
      company: companyId,
      ownerId: userId,
      firstName: `QA${i}`,
      lastName: 'Contact',
      email,
      status: STATUS_OPTIONS[i % STATUS_OPTIONS.length],
      doNotEmail: false
    });
  }

  for (let i = 0; i < duplicateCount; i += 1) {
    const sourceIndex = i % Math.max(1, Math.floor(baseCount / 2));
    const sourceEmail = `QA-CONTACT-${sourceIndex}@example.com`;
    const variant = i % 2 === 0 ? ` ${sourceEmail} ` : sourceEmail.toUpperCase();
    contacts.push({
      company: companyId,
      ownerId: userId,
      firstName: `QA-Dupe${i}`,
      lastName: 'Contact',
      email: variant,
      status: STATUS_OPTIONS[(i + 3) % STATUS_OPTIONS.length],
      doNotEmail: false
    });
  }

  const shuffled = contacts.sort(() => Math.random() - 0.5);
  shuffled.slice(0, missingCount).forEach((contact) => {
    contact.email = null;
  });
  shuffled.slice(missingCount, missingCount + invalidCount).forEach((contact, idx) => {
    contact.email = `invalid-email-${idx}`;
  });
  shuffled.slice(missingCount + invalidCount, missingCount + invalidCount + pausedCount).forEach((contact) => {
    contact.emailPaused = true;
    contact.emailPausedAt = new Date();
    contact.emailPausedBy = userId;
  });

  let insertedCount = 0;
  let duplicateErrors = 0;
  try {
    const inserted = await Contact.insertMany(shuffled, { ordered: false });
    insertedCount = inserted.length;
  } catch (err) {
    insertedCount = err?.insertedDocs?.length || 0;
    duplicateErrors = err?.writeErrors?.length || 0;
  }

  return {
    insertedCount,
    missingCount,
    invalidCount,
    pausedCount,
    duplicateCount,
    duplicateErrors
  };
}

async function seedSuppressions(companyId) {
  const docs = Array.from({ length: 10 }).map((_, idx) => ({
    companyId,
    email: normalizeEmail(`suppressed-${idx}@example.com`),
    reason: 'manual'
  }));
  await Suppression.insertMany(docs, { ordered: false });
}

async function seedTemplates({ companyId, userId }) {
  const templates = [
    {
      companyId,
      name: 'QA Blast Template',
      type: EmailTemplate.TYPES.BLAST,
      subject: 'QA Blast - {{firstName}}',
      html: '<p>Hi {{firstName}}, this is a QA blast.</p>',
      text: 'Hi {{firstName}}, this is a QA blast.',
      variables: ['firstName'],
      createdBy: userId,
      updatedBy: userId
    },
    {
      companyId,
      name: 'QA Rule Template',
      type: EmailTemplate.TYPES.AUTOMATION,
      subject: 'QA Rule - {{firstName}}',
      html: '<p>Hi {{firstName}}, rule triggered.</p>',
      text: 'Hi {{firstName}}, rule triggered.',
      variables: ['firstName'],
      createdBy: userId,
      updatedBy: userId
    },
    {
      companyId,
      name: 'QA Schedule Template',
      type: EmailTemplate.TYPES.AUTOMATION,
      subject: 'QA Schedule - {{firstName}}',
      html: '<p>Hi {{firstName}}, schedule step.</p>',
      text: 'Hi {{firstName}}, schedule step.',
      variables: ['firstName'],
      createdBy: userId,
      updatedBy: userId
    }
  ];

  const created = await EmailTemplate.insertMany(templates, { ordered: true });
  return {
    blastTemplate: created[0],
    ruleTemplate: created[1],
    scheduleTemplate: created[2]
  };
}

async function seedSchedule({ companyId, userId, templateId }) {
  return AutoFollowUpSchedule.create({
    company: companyId,
    name: 'QA Follow-Up Schedule',
    summary: 'QA schedule for testing',
    status: AutoFollowUpSchedule.STATUS.ACTIVE,
    stopOnStatuses: ['Negotiation'],
    createdBy: userId,
    updatedBy: userId,
    steps: [
      {
        order: 0,
        dayOffset: 0,
        channel: 'EMAIL',
        title: 'QA Step 1',
        instructions: 'First follow-up email',
        templateRef: templateId
      },
      {
        order: 1,
        dayOffset: 2,
        channel: 'EMAIL',
        title: 'QA Step 2',
        instructions: 'Second follow-up email',
        templateRef: templateId
      },
      {
        order: 2,
        dayOffset: 7,
        channel: 'EMAIL',
        title: 'QA Step 3',
        instructions: 'Third follow-up email',
        templateRef: templateId
      }
    ]
  });
}

async function applyScheduleToContacts({ schedule, contacts, userId }) {
  let enqueued = 0;
  let canceled = 0;

  for (const contact of contacts) {
    const reasonPrefix = `followup:${contact._id}:${schedule._id}:`;
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          followUpSchedule: {
            scheduleId: schedule._id,
            scheduleName: schedule.name,
            appliedAt: new Date(),
            appliedBy: userId,
            reasonPrefix
          }
        }
      }
    );

    const result = await enqueueScheduleEmailsForContact({
      companyId: schedule.company,
      contactId: contact._id,
      scheduleId: schedule._id
    });
    enqueued += result?.enqueued || 0;
    canceled += result?.canceledCount || 0;
  }

  return { enqueued, canceled };
}

async function cancelScheduleOnStopStatus({ schedule, contacts }) {
  const stopStatuses = (schedule.stopOnStatuses || []).map((s) => String(s).toLowerCase());
  const target = stopStatuses[0];
  if (!target) return { canceled: 0 };

  let canceled = 0;
  for (const contact of contacts) {
    await Contact.updateOne(
      { _id: contact._id },
      { $set: { status: target } }
    );
    const result = await EmailJob.updateMany(
      {
        companyId: schedule.company,
        contactId: contact._id,
        scheduleId: schedule._id,
        status: EmailJob.STATUS.QUEUED
      },
      {
        $set: {
          status: EmailJob.STATUS.CANCELED,
          lastError: 'SCHEDULE_STOP_STATUS'
        }
      }
    );
    canceled += result?.modifiedCount || 0;
    await Contact.updateOne(
      { _id: contact._id },
      { $unset: { followUpSchedule: '' } }
    );
  }

  return { canceled };
}

async function unenrollSchedule({ schedule, contacts }) {
  let canceled = 0;
  for (const contact of contacts) {
    const result = await EmailJob.updateMany(
      {
        companyId: schedule.company,
        contactId: contact._id,
        scheduleId: schedule._id,
        status: EmailJob.STATUS.QUEUED
      },
      {
        $set: {
          status: EmailJob.STATUS.CANCELED,
          lastError: 'SCHEDULE_UNENROLLED'
        }
      }
    );
    canceled += result?.modifiedCount || 0;
    await Contact.updateOne(
      { _id: contact._id },
      { $unset: { followUpSchedule: '' } }
    );
  }
  return { canceled };
}

async function seedRule({ companyId, templateId }) {
  return AutomationRule.create({
    companyId,
    name: 'QA Status Hot Rule',
    isEnabled: true,
    trigger: {
      type: AutomationRule.TRIGGER_TYPES.CONTACT_STATUS_CHANGED,
      config: { toStatus: 'Hot' }
    },
    action: {
      type: AutomationRule.ACTION_TYPES.SEND_EMAIL,
      templateId,
      delayMinutes: 5,
      cooldownMinutes: 60,
      mustStillMatchAtSend: true
    }
  });
}

async function updateContactStatus(contact, nextStatus) {
  const previousStatus = contact.status || '';
  await Contact.updateOne({ _id: contact._id }, { $set: { status: nextStatus } });
  await handleContactStatusChange({
    companyId: contact.company,
    contactId: contact._id,
    previousStatus,
    nextStatus
  });
  return { previousStatus, nextStatus };
}

async function summarizeEmailJobs(companyId) {
  const byStatus = await EmailJob.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const lastErrors = await EmailJob.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId), lastError: { $ne: null } } },
    { $group: { _id: '$lastError', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  const staleMs = Number(process.env.STALE_PROCESSING_MS) || 10 * 60 * 1000;
  const cutoff = new Date(Date.now() - staleMs);
  const stuckProcessing = await EmailJob.countDocuments({
    companyId,
    status: EmailJob.STATUS.PROCESSING,
    processingAt: { $lte: cutoff }
  });

  return {
    byStatus,
    lastErrors,
    stuckProcessing
  };
}

async function cleanupCompanyData(company) {
  if (!company?.name || !company.name.startsWith(QA_COMPANY_PREFIX)) {
    throw new Error('Cleanup refused: company name does not match QA prefix.');
  }
  const companyId = company._id;

  await Promise.all([
    EmailJob.deleteMany({ companyId }),
    EmailBlast.deleteMany({ companyId }),
    AutomationRule.deleteMany({ companyId }),
    EmailTemplate.deleteMany({ companyId }),
    EmailSettings.deleteMany({ companyId }),
    Suppression.deleteMany({ companyId }),
    Contact.deleteMany({ company: companyId }),
    AutoFollowUpSchedule.deleteMany({ company: companyId }),
    User.deleteMany({ company: companyId })
  ]);

  await Company.deleteOne({ _id: companyId });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = loadEnv();
  if (envPath) {
    console.log(`[email-load-test] loaded env from ${envPath}`);
  }
  const mongoUri = guardEnvironment(args);
  await connectDB(mongoUri);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  let company = null;
  let createdCompany = false;

  if (args.companyId) {
    company = await Company.findById(args.companyId).lean();
    if (!company) throw new Error('Company not found for --companyId');
  } else {
    company = await Company.create({
      name: `${QA_COMPANY_PREFIX}${stamp}`,
      notes: 'QA email automation load test company.'
    });
    createdCompany = true;
  }

  if (args.cleanup && !createdCompany && !company.name.startsWith(QA_COMPANY_PREFIX)) {
    throw new Error('Cleanup refused: company name does not match QA prefix.');
  }

  const adminEmail = `qa-email-admin+${stamp}@example.com`;
  const adminUser = await User.create({
    email: adminEmail,
    passwordHash: `qa-hash-${stamp}`,
    firstName: 'QA',
    lastName: 'Admin',
    roles: [User.ROLES.COMPANY_ADMIN],
    status: User.STATUS.ACTIVE,
    company: company._id
  });

  const settings = await EmailSettings.findOneAndUpdate(
    { companyId: company._id },
    {
      $set: {
        timezone: 'America/Chicago',
        allowedDays: [1, 2, 3, 4, 5],
        allowedStartTime: '09:00',
        allowedEndTime: '17:00',
        quietHoursEnabled: true,
        dailyCap: 100,
        rateLimitPerMinute: 20
      }
    },
    { new: true, upsert: true }
  );

  await seedSuppressions(company._id);

  const contactSeed = await seedContacts({
    companyId: company._id,
    userId: adminUser._id,
    count: args.contacts
  });

  const templates = await seedTemplates({ companyId: company._id, userId: adminUser._id });

  let rule = null;
  if (args.rules) {
    rule = await seedRule({ companyId: company._id, templateId: templates.ruleTemplate._id });
  }

  let schedule = null;
  let scheduleResults = null;
  if (args.schedule) {
    schedule = await seedSchedule({
      companyId: company._id,
      userId: adminUser._id,
      templateId: templates.scheduleTemplate._id
    });

    const eligibleContacts = await Contact.find({ company: company._id })
      .select('status email')
      .limit(50)
      .lean();
    scheduleResults = await applyScheduleToContacts({ schedule, contacts: eligibleContacts, userId: adminUser._id });

    const reapplyContacts = eligibleContacts.slice(0, 10);
    await applyScheduleToContacts({ schedule, contacts: reapplyContacts, userId: adminUser._id });

    const stopStatusContacts = eligibleContacts.slice(10, 20);
    await cancelScheduleOnStopStatus({ schedule, contacts: stopStatusContacts });

    const unenrollContacts = eligibleContacts.slice(20, 25);
    await unenrollSchedule({ schedule, contacts: unenrollContacts });
  }

  if (args.rules && rule) {
    const ruleContacts = await Contact.find({ company: company._id })
      .select('status')
      .limit(50)
      .lean();

    for (const contact of ruleContacts) {
      await updateContactStatus(contact, 'Hot');
    }

    const exitContacts = ruleContacts.slice(0, 20);
    for (const contact of exitContacts) {
      await updateContactStatus(contact, 'Possible');
    }
  }

  const blastFilters = {};
  const { recipients, excluded, totalMatched } = await resolveBlastRecipients({
    companyId: company._id,
    filters: blastFilters
  });
  const finalRecipients = recipients.slice(0, args.blast);

  const previewSettings = await getEmailSettings(company._id);
  const previewPlan = buildPacingSchedule({
    recipients: finalRecipients,
    settings: previewSettings,
    startAt: new Date(),
    dailyCap: Number(previewSettings?.dailyCap || 0),
    sentTodayCount: await countSentToday(company._id, previewSettings)
  });

  const requestId = makeRandomId();
  const blastResult = await createBlast({
    companyId: company._id,
    userId: adminUser._id,
    templateId: templates.blastTemplate._id,
    name: 'QA Blast',
    filters: blastFilters,
    sendMode: 'now',
    scheduledFor: new Date(),
    requestId
  });

  const idempotentResult = await createBlast({
    companyId: company._id,
    userId: adminUser._id,
    templateId: templates.blastTemplate._id,
    name: 'QA Blast',
    filters: blastFilters,
    sendMode: 'now',
    scheduledFor: new Date(),
    requestId
  });

  const provider = require('../server/services/email/provider');
  const originalSend = provider.sendEmail;
  const failRate = Number(args.failRate || 0);
  if (failRate > 0) {
    provider.sendEmail = async (...params) => {
      if (Math.random() < failRate) {
        throw new Error('Injected mock failure');
      }
      return originalSend(...params);
    };
  }

  for (let i = 0; i < args.processorTicks; i += 1) {
    await processDueEmailJobs({});
    if (args.processorTickDelayMs > 0) {
      await sleep(args.processorTickDelayMs);
    }
  }

  if (failRate > 0) {
    provider.sendEmail = originalSend;
  }

  const jobSummary = await summarizeEmailJobs(company._id);

  console.log('\n=== KeepUp Email QA Load Test Summary ===');
  console.log(`Company: ${company.name} (${company._id})`);
  console.log(`Admin user: ${adminEmail}`);
  console.log(`Contacts seeded: ${contactSeed.insertedCount} (missing ${contactSeed.missingCount}, invalid ${contactSeed.invalidCount}, paused ${contactSeed.pausedCount}, duplicates attempted ${contactSeed.duplicateCount}, duplicateErrors ${contactSeed.duplicateErrors})`);
  if (scheduleResults) {
    console.log(`Schedule applied: enqueued ${scheduleResults.enqueued}, canceled ${scheduleResults.canceled}`);
  }
  console.log(`Blast preview: matched ${totalMatched}, final ${finalRecipients.length}`);
  console.log(`Preview pacing: first ${previewPlan.pacingSummary?.firstSendAt || 'n/a'}, last ${previewPlan.pacingSummary?.lastSendAt || 'n/a'}, days ${previewPlan.pacingSummary?.daysSpanned || 'n/a'}`);
  console.log(`Blast created: ${blastResult.blast._id}, pacing days ${blastResult.pacingSummary?.daysSpanned || 'n/a'}`);
  console.log(`Idempotent create returned existing: ${Boolean(idempotentResult.idempotent)}`);
  console.log('EmailJob counts by status:');
  jobSummary.byStatus.forEach((entry) => {
    console.log(`  ${entry._id}: ${entry.count}`);
  });
  console.log('Top lastError reasons:');
  jobSummary.lastErrors.forEach((entry) => {
    console.log(`  ${entry._id}: ${entry.count}`);
  });
  console.log(`Stuck processing count: ${jobSummary.stuckProcessing}`);

  if (args.cleanup) {
    await cleanupCompanyData(company);
    console.log('Cleanup complete.');
  }

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error('[email-load-test] failed:', err.message || err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
