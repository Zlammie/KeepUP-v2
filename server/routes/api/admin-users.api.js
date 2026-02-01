const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const User = require('../../models/User');
const PasswordToken = require('../../models/PasswordToken');
const Community = require('../../models/Community');
const Company = require('../../models/Company');
const { formatPhoneForDisplay, formatPhoneForStorage } = require('../../utils/phone');
const { issuePasswordToken, sendInviteEmail } = require('../../services/passwordReset');
const { getSeatCounts } = require('../../utils/seatCounts');
const { computeSeatBilling } = require('../../utils/billingMath');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isSuper = (req) => Array.isArray(req.user?.roles) && req.user.roles.includes(User.ROLES.SUPER_ADMIN);

router.get(
  '/',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const requestedCompanyId = req.query.companyId;
      const scopedCompanyId = isSuper(req) && isObjectId(requestedCompanyId)
        ? requestedCompanyId
        : req.user.company;

      if (!isObjectId(scopedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const [users, communities] = await Promise.all([
        User.find({ company: scopedCompanyId })
          .select('firstName lastName email phone roles status isActive allowedCommunityIds manager company')
          .lean(),
        Community.find({ company: scopedCompanyId })
          .select('name')
          .lean()
      ]);

      const seatCounts = await getSeatCounts(scopedCompanyId);
      const seatBilling = computeSeatBilling(seatCounts.active);

      const userMap = new Map(users.map((user) => [String(user._id), user]));

      const formattedUsers = users.map((user) => {
        const managerId = user.manager ? String(user.manager) : null;
        const managerRecord = managerId ? userMap.get(managerId) : null;

        const normalizedStatus = user.status
          || (user.isActive === false ? User.STATUS.SUSPENDED : User.STATUS.ACTIVE);

        return {
          id: String(user._id),
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email,
          phone: user.phone || '',
          phoneDisplay: formatPhoneForDisplay(user.phone || ''),
          roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [User.ROLES.USER],
          status: normalizedStatus,
          isActive: user.isActive !== false,
          communities: Array.isArray(user.allowedCommunityIds)
            ? user.allowedCommunityIds.map((id) => String(id))
            : [],
          managerId,
          managerName: managerRecord
            ? [managerRecord.firstName, managerRecord.lastName].filter(Boolean).join(' ') || managerRecord.email
            : ''
        };
      });

      const managerLookup = new Map();
      formattedUsers.forEach((user) => {
        if (user.roles.includes(User.ROLES.MANAGER) || user.roles.includes(User.ROLES.COMPANY_ADMIN)) {
          const label = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
          managerLookup.set(user.id, label);
        }
      });
      formattedUsers.forEach((user) => {
        if (user.managerId && !managerLookup.has(user.managerId)) {
          const managerRecord = userMap.get(user.managerId);
          if (managerRecord) {
            const label = [managerRecord.firstName, managerRecord.lastName]
              .filter(Boolean)
              .join(' ') || managerRecord.email;
            managerLookup.set(String(managerRecord._id), label);
          }
        }
      });

      const managerOptions = Array.from(managerLookup.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const communityOptions = communities
        .map((community) => ({
          id: String(community._id),
          label: community.name || 'Unnamed Community'
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      return res.json({
        companyId: String(scopedCompanyId),
        currentUserId: String(req.user?._id || ''),
        seats: {
          used: seatCounts.active,
          invited: seatCounts.invited,
          minimumBilled: seatBilling.minimum,
          billed: seatBilling.billed,
          monthlyCents: seatBilling.monthlyCents,
          monthlyFormatted: seatBilling.monthlyFormatted
        },
        users: formattedUsers,
        managers: managerOptions,
        communities: communityOptions,
        roleOptions: [
          { value: User.ROLES.USER, label: 'User' },
          { value: User.ROLES.MANAGER, label: 'Manager' },
          { value: User.ROLES.COMPANY_ADMIN, label: 'Company Admin' }
        ],
        statusOptions: [
          { value: User.STATUS.ACTIVE, label: 'Active' },
          { value: User.STATUS.SUSPENDED, label: 'Suspended' },
          { value: User.STATUS.INVITED, label: 'Invited' }
        ]
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const {
        email,
        password,
        companyId,
        role,
        roles,
        status,
        firstName,
        lastName,
        phone
      } = req.body || {};

      const normalizedEmail = (email || '').toString().trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required.' });
      }

      if (!password || !password.toString().trim()) {
        return res.status(400).json({ error: 'Password is required.' });
      }

      if (!isObjectId(companyId)) {
        return res.status(400).json({ error: 'Valid companyId is required.' });
      }

      const company = await Company.findById(companyId).select('_id');
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }

      let roleList = [];
      if (roles) {
        roleList = Array.isArray(roles) ? roles : [roles];
      } else if (role) {
        roleList = [role];
      } else {
        roleList = [User.ROLES.USER];
      }

      const allowedRoles = new Set(Object.values(User.ROLES || {}));
      const normalizedRoles = roleList
        .map((value) => (value == null ? '' : String(value).trim().toUpperCase()))
        .filter((value) => value && allowedRoles.has(value));

      if (!normalizedRoles.length) {
        return res.status(400).json({ error: 'At least one valid role is required.' });
      }

      const allowedStatuses = new Set(Object.values(User.STATUS || {}));
      const normalizedStatus = (status || '').toString().trim().toUpperCase();
      const effectiveStatus = allowedStatuses.has(normalizedStatus)
        ? normalizedStatus
        : (User.STATUS && User.STATUS.ACTIVE) || 'ACTIVE';
      const isActive = effectiveStatus !== (User.STATUS && User.STATUS.SUSPENDED);

      const existingUser = await User.findOne({ email: normalizedEmail }).select('_id');
      if (existingUser) {
        return res.status(400).json({ error: 'A user with that email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password.toString(), 11);
      const normalizedPhone = phone ? formatPhoneForStorage(phone) : null;

      const user = await User.create({
        email: normalizedEmail,
        passwordHash,
        roles: normalizedRoles,
        company: company._id,
        isActive,
        status: effectiveStatus,
        firstName: firstName ? String(firstName).trim() : undefined,
        lastName: lastName ? String(lastName).trim() : undefined,
        phone: normalizedPhone || undefined
      });

      return res.status(201).json({ userId: String(user._id) });
    } catch (err) {
      return next(err);
    }
  }
);

// Company Admin / Manager invite: auto-scoped to the requester's company (Super Admins can override)
router.post(
  '/invite',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const {
        email,
        role,
        firstName,
        lastName,
        phone,
        companyId: rawCompanyId
      } = req.body || {};

      const normalizedEmail = (email || '').toString().trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required.' });
      }

      const requestedCompanyId = rawCompanyId && isObjectId(rawCompanyId) ? rawCompanyId : null;
      const scopedCompanyId = isSuper(req) ? (requestedCompanyId || req.user.company) : req.user.company;
      if (!isObjectId(scopedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context.' });
      }

      const company = await Company.findById(scopedCompanyId).select('_id name');
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }

      const allowedRoles = new Set(Object.values(User.ROLES || {}));
      allowedRoles.delete(User.ROLES.SUPER_ADMIN); // invites cannot create super admins
      const normalizedRole = (role || '').toString().trim().toUpperCase();
      const roleList = normalizedRole && allowedRoles.has(normalizedRole)
        ? [normalizedRole]
        : [User.ROLES.USER];

      const normalizedPhone = phone ? formatPhoneForStorage(phone) : null;

      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        const sameCompany = String(existingUser.company) === String(company._id);
        if (!sameCompany || existingUser.status !== User.STATUS.INVITED) {
          return res.status(400).json({ error: 'A user with that email already exists.' });
        }

        if (normalizedPhone !== null) existingUser.phone = normalizedPhone || undefined;
        if (firstName !== undefined) existingUser.firstName = firstName ? String(firstName).trim() : undefined;
        if (lastName !== undefined) existingUser.lastName = lastName ? String(lastName).trim() : undefined;
        existingUser.roles = roleList;
        existingUser.mustChangePassword = true;
        existingUser.isActive = true;
        existingUser.status = User.STATUS.INVITED;
        await existingUser.save();

        try {
          const { token } = await issuePasswordToken({
            userId: existingUser._id,
            type: PasswordToken.TOKEN_TYPES.INVITE,
            metadata: { invitedBy: req.user?._id || null }
          });

        await sendInviteEmail({
          user: existingUser,
          companyName: company.name,
          token,
          inviterName: req.user?.email,
          req
        });
      } catch (err) {
        console.error('[invite] failed to send re-invite email', err);
        PasswordToken.deleteMany({
          userId: existingUser._id,
          type: PasswordToken.TOKEN_TYPES.INVITE
        }).catch(() => {});
        return res.status(500).json({ error: 'User was found, but the invite email could not be sent.' });
      }

        return res.json({ userId: String(existingUser._id), reissued: true });
      }

      const password = crypto.randomBytes(12).toString('base64url').slice(0, 16);
      const passwordHash = await bcrypt.hash(password, 11);

      const user = await User.create({
        email: normalizedEmail,
        passwordHash,
        roles: roleList,
        company: company._id,
        status: User.STATUS.INVITED,
        isActive: true,
        mustChangePassword: true,
        firstName: firstName ? String(firstName).trim() : undefined,
        lastName: lastName ? String(lastName).trim() : undefined,
        phone: normalizedPhone || undefined
      });

      try {
        const { token } = await issuePasswordToken({
          userId: user._id,
          type: PasswordToken.TOKEN_TYPES.INVITE,
          metadata: { invitedBy: req.user?._id || null }
        });

        await sendInviteEmail({
          user,
          companyName: company.name,
          token,
          inviterName: req.user?.email,
          req
        });
      } catch (err) {
        console.error('[invite] failed to send invite email', err);
        PasswordToken.deleteMany({
          userId: user._id,
          type: PasswordToken.TOKEN_TYPES.INVITE
        }).catch(() => {});
        return res.status(500).json({ error: 'User created, but the invite email could not be sent.' });
      }

      return res.status(201).json({ userId: String(user._id) });
    } catch (err) {
      return next(err);
    }
  }
);

router.put(
  '/:id',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      const filter = isSuper(req)
        ? { _id: id }
        : { _id: id, company: req.user.company };

      const user = await User.findOne(filter);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const {
        firstName,
        lastName,
        phone,
        role,
        status,
        communities,
        manager,
        password
      } = req.body || {};

      const trimOrUndefined = (value) => {
        const trimmed = String(value ?? '').trim();
        return trimmed ? trimmed : undefined;
      };

      if (firstName !== undefined) user.firstName = trimOrUndefined(firstName);
      if (lastName !== undefined) user.lastName = trimOrUndefined(lastName);

      if (phone !== undefined) {
        const normalized = formatPhoneForStorage(phone);
        user.phone = normalized || undefined;
      }

      if (role !== undefined) {
        const normalizedRole = String(role || '')
          .trim()
          .toUpperCase();
        if (!Object.values(User.ROLES).includes(normalizedRole)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        if (!isSuper(req) && normalizedRole === User.ROLES.SUPER_ADMIN) {
          return res.status(403).json({ error: 'Cannot assign SUPER_ADMIN' });
        }
        user.roles = [normalizedRole];
      }

      if (status !== undefined) {
        let normalizedStatus = String(status || '')
          .trim()
          .toUpperCase();
        if (normalizedStatus === 'INACTIVE') {
          normalizedStatus = User.STATUS.SUSPENDED;
        }
        if (!Object.values(User.STATUS).includes(normalizedStatus)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        user.status = normalizedStatus;
        if (normalizedStatus === User.STATUS.SUSPENDED) {
          user.isActive = false;
        } else if (normalizedStatus === User.STATUS.ACTIVE) {
          user.isActive = true;
        }
      }

      if (communities !== undefined) {
        const raw = Array.isArray(communities) ? communities : [communities];
        const validIds = raw.filter(isObjectId).map((value) => new mongoose.Types.ObjectId(value));
        user.allowedCommunityIds = validIds;
      }

      if (manager !== undefined) {
        if (!manager) {
          user.manager = null;
        } else if (!isObjectId(manager)) {
          return res.status(400).json({ error: 'Invalid manager id' });
        } else {
          const managerRecord = await User.findOne({
            _id: manager,
            company: user.company
          }).select('_id');
          if (!managerRecord) {
            return res.status(400).json({ error: 'Manager not found for this company' });
          }
          user.manager = managerRecord._id;
        }
      }

      if (password !== undefined) {
        const trimmed = String(password || '').trim();
        if (!trimmed) {
          return res.status(400).json({ error: 'Password cannot be empty.' });
        }
        if (trimmed.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        user.passwordHash = await bcrypt.hash(trimmed, 11);
        // Clear any outstanding invite/reset tokens since the password is now set manually.
        PasswordToken.deleteMany({ userId: user._id }).catch(() => {});
        if (user.status === User.STATUS.INVITED) {
          user.status = User.STATUS.ACTIVE;
          user.isActive = true;
        }
      }

      await user.save();

      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      const filter = isSuper(req)
        ? { _id: id }
        : { _id: id, company: req.user.company };

      const user = await User.findOne(filter).select('_id company');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (String(user._id) === String(req.user._id)) {
        return res.status(400).json({ error: 'You cannot delete your own account.' });
      }

      await User.deleteOne({ _id: user._id });
      await User.updateMany(
        { company: user.company, manager: user._id },
        { $set: { manager: null } }
      );

      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
