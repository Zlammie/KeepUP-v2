// routes/adminUserRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const User        = require('../models/User');
const Company     = require('../models/Company');

const isId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');

const NORM = r => String(r || '').trim().toUpperCase();
const ALLOWED = new Set(['READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN']);

router.use(ensureAuth);

// GET users page (plus companies for the dropdown)
router.get('/admin/users',
  requireRole('COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const companyFilter = isSuper(req) ? {} : { _id: req.user.company };
    const companies = await Company.find(companyFilter).select('name').lean();

    const userFilter = isSuper(req) ? {} : { company: req.user.company };
    const users = await User.find(userFilter)
      .select('email roles isActive company')
      .populate('company', 'name')
      .lean();

    // Keep your existing template name; pass companies + normalize for legacy template if needed.
    res.render('users', { users, companies, companyId: String(req.user.company) });
  }
);

// CREATE user
router.post('/admin/users',
  requireRole('COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { email, password, role, roles, companyId } = req.body || {};
      if (!email || !password) return res.status(400).send('Email and password are required');

      // figure out company to assign
      let company = null;
      if (isSuper(req)) {
        if (!isId(companyId)) return res.status(400).send('Select a company');
        company = companyId;
      } else {
        company = req.user.company; // company admin can only create in their company
      }

      // normalize roles: accept single role or array; always store array
      let roleList = [];
      if (roles) {
        roleList = Array.isArray(roles) ? roles : [roles];
      } else if (role) {
        roleList = [role];
      } else {
        roleList = ['USER'];
      }
      roleList = roleList.map(NORM).filter(r => ALLOWED.has(r));
      if (!roleList.length) roleList = ['USER'];

      // company admins cannot create super admins
      if (!isSuper(req) && roleList.includes('SUPER_ADMIN')) {
        return res.status(403).send('Forbidden: cannot create SUPER_ADMIN');
      }

      const passwordHash = await bcrypt.hash(password, 11);

      await User.create({
        email: String(email).toLowerCase().trim(),
        passwordHash,
        roles: roleList,
        company,
        isActive: true
      });

      res.redirect('/admin/users');
    } catch (err) {
      const msg = err?.code === 11000 ? 'Email already exists' : (err.message || 'Failed to create user');
      res.status(400).send(msg);
    }
  }
);

// UPDATE user (role / isActive / password)
router.post('/admin/users/:id',
  requireRole('COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).send('Invalid user id');

      const filter = isSuper(req) ? { _id: id } : { _id: id, company: req.user.company };
      const user = await User.findOne(filter);
      if (!user) return res.status(404).send('User not found');

      const updates = {};
      if (req.body.password) {
        updates.passwordHash = await bcrypt.hash(req.body.password, 11);
      }
      if (req.body.isActive != null) {
        updates.isActive = String(req.body.isActive) === 'true';
      }
      // normalize roles (single select in your template)
      if (req.body.role) {
        const normalized = NORM(req.body.role);
        if (!ALLOWED.has(normalized)) return res.status(400).send('Invalid role');
        // company admin cannot grant SUPER_ADMIN
        if (!isSuper(req) && normalized === 'SUPER_ADMIN') {
          return res.status(403).send('Forbidden: cannot grant SUPER_ADMIN');
        }
        updates.roles = [normalized];
      }

      await User.updateOne({ _id: user._id }, { $set: updates });
      res.redirect('/admin/users');
    } catch (err) {
      res.status(400).send(err.message || 'Failed to update user');
    }
  }
);

module.exports = router;
