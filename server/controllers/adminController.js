const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const normalizeRole = require('../utils/normalizeRole');

const DEFAULT_ROLE = User.ROLES?.USER || 'USER';
const SUPER_ROLE = User.ROLES?.SUPER_ADMIN || 'SUPER_ADMIN';

// GET /admin/users
exports.listUsers = async (req, res) => {
  const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');
  const selectedCompanyId = isSuper ? (req.query.companyId || '') : String(req.user.company);

  const userFilter = isSuper
    ? (selectedCompanyId ? { company: selectedCompanyId } : {})
    : { company: req.user.company };

  const companiesQuery = isSuper
    ? Company.find({}).select('name').sort({ name: 1 }).lean()
    : Company.find({ _id: req.user.company }).select('name').lean();

  const [users, companies] = await Promise.all([
    User.find(userFilter)
      .select('email roles isActive company createdAt allowedCommunityIds') // ← include it
      .populate('company', 'name')
      .populate('allowedCommunityIds', 'name') // ← get names for the table
      .sort({ createdAt: -1 })
      .lean(),
    companiesQuery
  ]);

  const companyId = isSuper ? String(selectedCompanyId) : String(req.user.company);
  res.render('admin/users', { users, companies, companyId });
};
// POST /admin/users
exports.createUser = async (req, res) => {
  const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');

  // Form may submit a single role string; normalize to array
  const rawRole = req.body.role;
  const normalizedRole = normalizeRole(rawRole);
  if (rawRole && !normalizedRole) return res.status(400).send('Invalid role');

  const requestedRole = normalizedRole || DEFAULT_ROLE;
  const roles = [requestedRole];

  // Non-super cannot create SUPER_ADMIN
  if (!isSuper && roles.includes(SUPER_ROLE)) return res.status(403).send('Forbidden');

  // Company: super can target any company (from body), others are forced to their own
  const targetCompany = isSuper && req.body.companyId
    ? req.body.companyId
    : req.user.company;

  const passwordHash = await bcrypt.hash(req.body.password, 11);

  await User.create({
    email: req.body.email,
    passwordHash,
    company: targetCompany,              // ← new field name
    roles,                               // ← array roles
    isActive: true
  });

  res.redirect('/admin/users');
};

// POST /admin/users/:id (or PUT/PATCH)
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');

  const target = await User.findById(id);
  if (!target) return res.status(404).send('Not found');

  // Company scope: non-super cannot edit a user from another company
  if (!isSuper && String(target.company) !== String(req.user.company)) {
    return res.status(403).send('Forbidden');
  }

  // Role changes
  if (req.body.role) {
    const normalizedRole = normalizeRole(req.body.role);
    if (!normalizedRole) return res.status(400).send('Invalid role');

    const nextRole = normalizedRole;
    if (!isSuper && nextRole === SUPER_ROLE) return res.status(403).send('Forbidden');
    target.roles = [nextRole]; // normalize to array
  }

  if (typeof req.body.isActive !== 'undefined') {
    target.isActive = !!req.body.isActive;
  }

  if (req.body.password) {
    target.passwordHash = await bcrypt.hash(req.body.password, 11);
  }

  // Prevent cross-tenant move via form tampering
  if (!isSuper) target.company = target.company;

  await target.save();
  res.redirect('/admin/users');
};

