const express = require('express');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const Contact = require('../../models/Contact');
const Suppression = require('../../models/Suppression');
const EmailTemplate = require('../../models/EmailTemplate');
const EmailBlast = require('../../models/EmailBlast');
const EmailJob = require('../../models/EmailJob');
const { getEmailSettings, adjustToAllowedWindow, buildContactMergeData } = require('../../services/email/scheduler');

const router = express.Router();

const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];
const BLAST_CONFIRM_THRESHOLD = Number(process.env.BLAST_CONFIRM_THRESHOLD) || 200;

const toObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (value) => {
  const email = normalizeEmail(value);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

function buildContactFilter(filters, companyId) {
  const baseFilter = { company: companyId };

  if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
    baseFilter.communityIds = { $in: filters.communityIds.map((id) => toObjectId(id)).filter(Boolean) };
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
      $or: [
        { lotId: { $ne: null } },
        { 'linkedLot.lotId': { $exists: true } }
      ]
    });
  }

  if (Array.isArray(filters.lenderIds) && filters.lenderIds.length) {
    const lenderIds = filters.lenderIds.map((id) => toObjectId(id)).filter(Boolean);
    andClauses.push({
      $or: [
        { lenderId: { $in: lenderIds } },
        { 'lenders.lender': { $in: lenderIds } }
      ]
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

async function resolveBlastRecipients({ companyId, filters }) {
  const contactFilter = buildContactFilter(filters || {}, companyId);

  const contacts = await Contact.find(contactFilter)
    .select('firstName lastName email doNotEmail status communityIds')
    .lean();

  // Server-side exclusions + dedupe happen here to avoid client-trusted lists.
  const suppressedEmails = await Suppression.find({ companyId })
    .select('email')
    .lean();
  const suppressedSet = new Set(suppressedEmails.map((entry) => normalizeEmail(entry.email)));

  const seenEmails = new Set();
  const recipients = [];
  const excluded = {
    suppressed: 0,
    invalidEmail: 0,
    noEmail: 0,
    doNotEmail: 0,
    duplicates: 0
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

  return {
    recipients,
    excluded,
    totalMatched: contacts.length
  };
}

router.post('/preview', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const filters = payload.filters || {};

    const { recipients, excluded, totalMatched } = await resolveBlastRecipients({
      companyId: req.user.company,
      filters
    });

    const finalToSend = recipients.length;
    const excludedTotal =
      excluded.suppressed +
      excluded.invalidEmail +
      excluded.noEmail +
      excluded.doNotEmail +
      excluded.duplicates;

    const sampleRecipients = recipients.slice(0, 10).map(({ contact, email }) => ({
      contactId: contact._id,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || email,
      email
    }));

    res.json({
      totalMatched,
      excludedSuppressed: excluded.suppressed,
      excludedInvalidEmail: excluded.invalidEmail,
      excludedNoEmail: excluded.noEmail,
      excludedDoNotEmail: excluded.doNotEmail,
      excludedDuplicates: excluded.duplicates,
      excludedTotal,
      finalToSend,
      sampleRecipients,
      warnings: finalToSend >= BLAST_CONFIRM_THRESHOLD ? [`Confirm send for ${finalToSend} recipients.`] : []
    });
  } catch (err) {
    console.error('[email-blasts] preview failed', err);
    res.status(500).json({ error: 'Failed to preview blast recipients' });
  }
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const templateId = toObjectId(payload.templateId);
    const filters = payload.filters || {};
    const sendMode = payload.sendMode === 'scheduled' ? 'scheduled' : 'now';
    const scheduledForRaw = payload.scheduledFor ? new Date(payload.scheduledFor) : null;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!templateId) return res.status(400).json({ error: 'Template is required' });

    const template = await EmailTemplate.findOne({
      _id: templateId,
      companyId: req.user.company
    }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (template.isActive === false) {
      return res.status(400).json({ error: 'Template is inactive' });
    }

    const { recipients, excluded, totalMatched } = await resolveBlastRecipients({
      companyId: req.user.company,
      filters
    });

    const finalToSend = recipients.length;
    const excludedTotal =
      excluded.suppressed +
      excluded.invalidEmail +
      excluded.noEmail +
      excluded.doNotEmail +
      excluded.duplicates;

    if (finalToSend >= BLAST_CONFIRM_THRESHOLD) {
      const expected = `SEND ${finalToSend}`;
      if (String(payload.confirmationText || '').trim() !== expected) {
        return res.status(400).json({ error: `Confirmation required: type "${expected}"` });
      }
    }

    const settings = await getEmailSettings(req.user.company);
    let scheduledFor = null;
    if (sendMode === 'scheduled') {
      if (!scheduledForRaw || Number.isNaN(scheduledForRaw.getTime())) {
        return res.status(400).json({ error: 'scheduledFor is required for scheduled sends' });
      }
      scheduledFor = adjustToAllowedWindow(scheduledForRaw, settings);
    } else {
      scheduledFor = new Date();
    }

    const blast = await EmailBlast.create({
      companyId: req.user.company,
      name,
      templateId,
      createdBy: req.user?._id || null,
      status: EmailBlast.STATUS.SCHEDULED,
      audience: {
        type: 'contacts',
        filters,
        snapshotCount: totalMatched,
        excludedCount: excludedTotal
      },
      schedule: {
        sendMode,
        scheduledFor
      },
      settingsSnapshot: {
        timezone: settings.timezone || null,
        dailyCap: settings.dailyCap ?? null,
        rateLimitPerMinute: settings.rateLimitPerMinute ?? null
      }
    });

    // Build job payloads with server-side dedupe and exclusions applied.
    const jobs = recipients.map(({ contact, email }) => ({
      companyId: req.user.company,
      to: email,
      contactId: contact._id,
      templateId,
      blastId: blast._id,
      data: buildContactMergeData(contact),
      scheduledFor,
      status: EmailJob.STATUS.QUEUED,
      provider: 'mock',
      meta: {
        blastName: name
      }
    }));

    if (jobs.length) {
      await EmailJob.insertMany(jobs, { ordered: false });
    }

    res.json({
      ok: true,
      blastId: blast._id,
      finalToSend,
      excludedBreakdown: excluded
    });
  } catch (err) {
    console.error('[email-blasts] create failed', err);
    res.status(500).json({ error: err.message || 'Failed to create blast' });
  }
});

router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blasts = await EmailBlast.find({ companyId: req.user.company })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('templateId', 'name')
      .lean();

    const shaped = blasts.map((blast) => ({
      _id: blast._id,
      name: blast.name,
      status: blast.status,
      createdAt: blast.createdAt,
      scheduledFor: blast.schedule?.scheduledFor || null,
      templateName: blast.templateId?.name || null,
      finalToSend: blast.audience?.snapshotCount
        ? Math.max(0, blast.audience.snapshotCount - (blast.audience.excludedCount || 0))
        : 0
    }));

    res.json({ blasts: shaped });
  } catch (err) {
    console.error('[email-blasts] list failed', err);
    res.status(500).json({ error: 'Failed to load blasts' });
  }
});

router.get('/:blastId', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blastId = toObjectId(req.params.blastId);
    if (!blastId) return res.status(400).json({ error: 'Invalid blast id' });

    const blast = await EmailBlast.findOne({ _id: blastId, companyId: req.user.company })
      .populate('templateId', 'name')
      .lean();
    if (!blast) return res.status(404).json({ error: 'Blast not found' });

    res.json({ blast });
  } catch (err) {
    console.error('[email-blasts] get failed', err);
    res.status(500).json({ error: 'Failed to load blast' });
  }
});

router.post('/:blastId/cancel', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const blastId = toObjectId(req.params.blastId);
    if (!blastId) return res.status(400).json({ error: 'Invalid blast id' });

    const blast = await EmailBlast.findOne({
      _id: blastId,
      companyId: req.user.company
    });
    if (!blast) return res.status(404).json({ error: 'Blast not found' });

    blast.status = EmailBlast.STATUS.CANCELED;
    await blast.save();

    await EmailJob.updateMany(
      {
        companyId: req.user.company,
        blastId,
        status: EmailJob.STATUS.QUEUED
      },
      { $set: { status: EmailJob.STATUS.CANCELED, lastError: 'BLAST_CANCELED' } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[email-blasts] cancel failed', err);
    res.status(500).json({ error: 'Failed to cancel blast' });
  }
});

module.exports = router;
