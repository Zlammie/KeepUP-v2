const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');

const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const PasswordToken = require('../../models/PasswordToken');
const SignupRequest = require('../../models/SignupRequest');
const User = require('../../models/User');
const { issuePasswordToken, sendInviteEmail } = require('../../services/passwordReset');
const { formatPhoneForStorage } = require('../../utils/phone');
const slugify = require('../../utils/slugify');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const trimText = (value) => (value == null ? '' : String(value).trim());
const ALLOWED_STATUSES = Object.values(SignupRequest.STATUS);
const DEFAULT_TIMEZONE = 'America/Chicago';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => trimText(value).toLowerCase();
const coerceBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = trimText(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};
const trimToNull = (value) => {
  const trimmed = trimText(value);
  return trimmed || null;
};
const parsePositiveInteger = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null;
  return parsed;
};
const isValidTimezone = (value) => {
  const trimmed = trimText(value);
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch (err) {
    return false;
  }
};
const splitPersonName = (value) => {
  const normalized = trimText(value).replace(/\s+/g, ' ');
  if (!normalized) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = normalized.split(' ');
  return {
    firstName: firstName || '',
    lastName: rest.join(' ').trim()
  };
};
const buildUniqueCompanySlug = async (companyName) => {
  const baseSlug = slugify(companyName) || `company-${Date.now()}`;
  let candidate = baseSlug;
  let suffix = 2;

  while (await Company.exists({ slug: candidate })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const buildReviewedByLabel = async (userId, fallbackEmail = '') => {
  if (!isObjectId(userId)) return fallbackEmail || '';
  const user = await User.findById(userId).select('firstName lastName email').lean();
  if (!user) return fallbackEmail || '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || fallbackEmail || '';
};
const sendSignupRequestInvite = async ({ user, companyName, inviterName, req, metadata }) => {
  const { token } = await issuePasswordToken({
    userId: user._id,
    type: PasswordToken.TOKEN_TYPES.INVITE,
    metadata: metadata || null
  });

  try {
    await sendInviteEmail({
      user,
      companyName,
      token,
      inviterName,
      req
    });
  } catch (err) {
    PasswordToken.deleteMany({
      userId: user._id,
      type: PasswordToken.TOKEN_TYPES.INVITE
    }).catch(() => {});
    throw err;
  }
};

const serializeSignupRequest = async (requestDoc, fallbackEmail = '') => ({
  id: String(requestDoc._id),
  status: requestDoc.status,
  notes: requestDoc.notes || '',
  reviewedAt: requestDoc.reviewedAt || null,
  reviewedAtLabel: requestDoc.reviewedAt ? new Date(requestDoc.reviewedAt).toLocaleString() : 'Not reviewed yet',
  reviewedBy: requestDoc.reviewedBy ? String(requestDoc.reviewedBy) : '',
  reviewedByLabel: await buildReviewedByLabel(requestDoc.reviewedBy, fallbackEmail),
  lastInviteSentAt: requestDoc.lastInviteSentAt || null,
  lastInviteSentAtLabel: requestDoc.lastInviteSentAt
    ? new Date(requestDoc.lastInviteSentAt).toLocaleString()
    : 'No invite sent yet'
});

router.post('/:id/provision', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid signup request id' });

    const requestDoc = await SignupRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'Signup request not found' });
    if (requestDoc.status !== SignupRequest.STATUS.APPROVED) {
      return res.status(400).json({ error: 'Only approved signup requests can be provisioned.' });
    }
    if (requestDoc.companyId || requestDoc.adminUserId || requestDoc.provisionedAt) {
      return res.status(409).json({ error: 'This signup request has already been provisioned.' });
    }

    const {
      companyName,
      address = {},
      primaryContactName,
      primaryContactEmail,
      primaryContactPhone,
      timezone,
      seatCount,
      buildrootzEnabled,
      websiteMapEnabled,
      competitionTrackingEnabled,
      emailAutomationEnabled,
      websiteMapTrialDays
    } = req.body || {};

    const trimmedCompanyName = trimText(companyName);
    const trimmedContactName = trimText(primaryContactName);
    const normalizedEmail = normalizeEmail(primaryContactEmail);
    const normalizedPhone = formatPhoneForStorage(primaryContactPhone || '');
    const normalizedTimezone = trimText(timezone) || DEFAULT_TIMEZONE;
    const parsedSeatCount = parsePositiveInteger(seatCount);
    const parsedWebsiteMapTrialDays =
      websiteMapTrialDays == null || trimText(websiteMapTrialDays) === ''
        ? null
        : parsePositiveInteger(websiteMapTrialDays);

    if (!trimmedCompanyName) {
      return res.status(400).json({ error: 'Company name is required.' });
    }
    if (!trimmedContactName) {
      return res.status(400).json({ error: 'Primary contact name is required.' });
    }
    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid primary contact email is required.' });
    }
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Primary contact phone is required.' });
    }
    if (!parsedSeatCount) {
      return res.status(400).json({ error: 'Seat count must be a positive whole number.' });
    }
    if (!isValidTimezone(normalizedTimezone)) {
      return res.status(400).json({ error: 'Timezone is invalid.' });
    }
    if (trimText(websiteMapTrialDays) && !parsedWebsiteMapTrialDays) {
      return res.status(400).json({ error: 'Website Map trial days must be a positive whole number.' });
    }

    const [existingCompanyByName, existingUserByEmail] = await Promise.all([
      Company.findOne({ name: trimmedCompanyName }).select('_id'),
      User.findOne({ email: normalizedEmail }).select('_id company status')
    ]);

    if (existingCompanyByName) {
      return res.status(400).json({ error: 'A company with that name already exists.' });
    }
    if (existingUserByEmail) {
      return res.status(400).json({ error: 'A user with that email already exists.' });
    }

    const companySlug = await buildUniqueCompanySlug(trimmedCompanyName);
    const { firstName, lastName } = splitPersonName(trimmedContactName);

    let company = null;
    let adminUser = null;

    try {
      company = await Company.create({
        name: trimmedCompanyName,
        slug: companySlug,
        address: {
          street: trimToNull(address.street),
          city: trimToNull(address.city),
          state: trimToNull(address.state),
          zip: trimToNull(address.zip)
        },
        primaryContact: {
          name: trimmedContactName,
          email: normalizedEmail,
          phone: normalizedPhone
        },
        settings: {
          timezone: normalizedTimezone,
          features: {
            competitionTracking: coerceBoolean(competitionTrackingEnabled),
            emailAutomation: coerceBoolean(emailAutomationEnabled)
          }
        },
        billing: {
          seatsPurchased: parsedSeatCount
        },
        features: {
          buildrootz: {
            enabled: coerceBoolean(buildrootzEnabled),
            status: coerceBoolean(buildrootzEnabled) ? 'pending' : 'inactive'
          },
          websiteMap: {
            enabled: coerceBoolean(websiteMapEnabled)
          }
        },
        entitlements: {
          websiteMap: {
            trialDaysOverride: coerceBoolean(websiteMapEnabled) ? parsedWebsiteMapTrialDays : null
          }
        },
        updatedByUserId: req.user?._id || null,
        notes: `Provisioned from signup request ${requestDoc._id}`
      });

      const generatedPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
      const passwordHash = await bcrypt.hash(generatedPassword, 11);

      adminUser = await User.create({
        email: normalizedEmail,
        passwordHash,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: normalizedPhone || undefined,
        roles: [User.ROLES.COMPANY_ADMIN],
        status: User.STATUS.INVITED,
        isActive: true,
        mustChangePassword: true,
        company: company._id
      });

      requestDoc.companyId = company._id;
      requestDoc.adminUserId = adminUser._id;
      requestDoc.provisionedAt = new Date();
      requestDoc.provisionedBy = req.user?._id || null;
      requestDoc.reviewedAt = requestDoc.reviewedAt || new Date();
      requestDoc.reviewedBy = requestDoc.reviewedBy || req.user?._id || null;
      await requestDoc.save();
    } catch (createErr) {
      if (adminUser?._id) {
        await User.deleteOne({ _id: adminUser._id }).catch(() => {});
      }
      if (company?._id) {
        await Company.deleteOne({ _id: company._id }).catch(() => {});
      }
      throw createErr;
    }

    let inviteSent = false;
    let inviteWarning = '';

    try {
      await sendSignupRequestInvite({
        user: adminUser,
        companyName: company.name,
        inviterName: req.user?.email,
        req,
        metadata: {
          invitedBy: req.user?._id || null,
          source: 'signup_request_provisioning',
          signupRequestId: requestDoc._id
        }
      });

      inviteSent = true;
      requestDoc.lastInviteSentAt = new Date();
      await requestDoc.save();
    } catch (err) {
      console.error('[signup-requests superadmin] invite email failed after provisioning', {
        signupRequestId: String(requestDoc._id),
        companyId: String(company._id),
        adminUserId: String(adminUser._id),
        error: err?.message || err
      });
      inviteWarning = 'Company and admin account were created, but the invite email could not be sent.';
    }

    return res.status(201).json({
      ok: true,
      companyId: String(company._id),
      adminUserId: String(adminUser._id),
      inviteSent,
      warning: inviteWarning
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Company or user already exists for this provisioning request.' });
    }
    console.error('[signup-requests superadmin] provisioning failed', err);
    return res.status(500).json({ error: 'Failed to provision signup request' });
  }
});

router.post('/:id/resend-invite', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid signup request id' });

    const requestDoc = await SignupRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'Signup request not found' });
    if (!requestDoc.provisionedAt || !requestDoc.companyId) {
      return res.status(400).json({ error: 'This signup request has not been provisioned yet.' });
    }
    if (!requestDoc.adminUserId) {
      return res.status(400).json({ error: 'This signup request does not have a linked admin user.' });
    }

    const [adminUser, company] = await Promise.all([
      User.findById(requestDoc.adminUserId),
      Company.findById(requestDoc.companyId).select('name')
    ]);

    if (!adminUser) {
      return res.status(404).json({ error: 'Linked admin user not found.' });
    }
    if (!company) {
      return res.status(404).json({ error: 'Linked company not found.' });
    }
    if (adminUser.status !== User.STATUS.INVITED) {
      return res.status(400).json({ error: 'Invite resend is only available while the linked admin user is still invited.' });
    }

    try {
      await sendSignupRequestInvite({
        user: adminUser,
        companyName: company.name,
        inviterName: req.user?.email,
        req,
        metadata: {
          invitedBy: req.user?._id || null,
          source: 'signup_request_resend_invite',
          signupRequestId: requestDoc._id
        }
      });
    } catch (err) {
      console.error('[signup-requests superadmin] resend invite failed', {
        signupRequestId: String(requestDoc._id),
        adminUserId: String(adminUser._id),
        error: err?.message || err
      });
      return res.status(500).json({ error: 'Invite email could not be sent. No active invite link was left behind.' });
    }

    requestDoc.lastInviteSentAt = new Date();
    await requestDoc.save();

    return res.json({
      ok: true,
      request: await serializeSignupRequest(requestDoc, req.user?.email || ''),
      adminUserId: String(adminUser._id)
    });
  } catch (err) {
    console.error('[signup-requests superadmin] resend invite route failed', err);
    return res.status(500).json({ error: 'Failed to resend invite' });
  }
});

router.patch('/:id/status', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const status = trimText(req.body?.status).toLowerCase();

    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid signup request id' });
    if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const requestDoc = await SignupRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'Signup request not found' });

    requestDoc.status = status;
    requestDoc.reviewedAt = new Date();
    requestDoc.reviewedBy = req.user?._id || null;
    await requestDoc.save();

    return res.json({
      ok: true,
      request: await serializeSignupRequest(requestDoc, req.user?.email || '')
    });
  } catch (err) {
    console.error('[signup-requests superadmin] status update failed', err);
    return res.status(500).json({ error: 'Failed to update signup request status' });
  }
});

router.patch('/:id/notes', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid signup request id' });

    const requestDoc = await SignupRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'Signup request not found' });

    requestDoc.notes = trimText(req.body?.notes);
    await requestDoc.save();

    return res.json({
      ok: true,
      request: await serializeSignupRequest(requestDoc, req.user?.email || '')
    });
  } catch (err) {
    console.error('[signup-requests superadmin] notes update failed', err);
    return res.status(500).json({ error: 'Failed to save signup request notes' });
  }
});

module.exports = router;
