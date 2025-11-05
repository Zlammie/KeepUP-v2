const router = require('express').Router();
const ensureAuth = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const { listUsers, createUser, updateUser } = require('../controllers/adminController');
const User = require('../models/User');    
const Community      = require('../models/Community');
const validateObjectId = require('../middleware/validateObjectId');

// All admin routes require login + role
router.use(ensureAuth, requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'));

router.get('/users', listUsers);
router.post('/users', createUser);
router.post('/users/:id', updateUser); // simple POST for form submits

router.get('/users/:userId/communities',
  validateObjectId('userId'),
  async (req, res, next) => {
    try {
      const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');

      const user = await User.findById(req.params.userId)
        .select('email company allowedCommunityIds')
        .populate('company', 'name')
        .lean();
      if (!user) return res.status(404).send('User not found');

      if (!isSuper && String(user.company) !== String(req.user.company)) {
        return res.status(403).send('Forbidden');
      }

      const communities = await Community.find({ company: user.company })
        .select('name')
        .sort({ name: 1 })
        .lean();

      res.render('admin/user-communities', {
        targetUser: user,
        communities,
        assigned: (user.allowedCommunityIds || []).map(String),
        error: null,
      });
    } catch (err) { next(err); }
  }
);

router.post('/users/:userId/communities',
  validateObjectId('userId'),
  async (req, res, next) => {
    try {
      const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');

      const user = await User.findById(req.params.userId).select('company').lean();
      if (!user) return res.status(404).send('User not found');
      if (!isSuper && String(user.company) !== String(req.user.company)) {
        return res.status(403).send('Forbidden');
      }

      // Normalize checkboxes → array of strings
      let ids = req.body.communityIds || [];
      if (!Array.isArray(ids)) ids = [ids];
      ids = ids.filter(Boolean).map(String);

      // DEBUG (temporary): see what the form sent
      console.log('[assign] raw body.communityIds:', req.body.communityIds);
      console.log('[assign] normalized ids:', ids);
      console.log('[assign] user.company:', user.company);

      // Only allow communities within the user's company
      const allowed = await Community.find({
        _id: { $in: ids },
        company: user.company
      }).select('_id name').lean();

      console.log('[assign] allowed resolved:', allowed.map(a => `${a._id}:${a.name}`));

      // If something was selected but none matched the company, re-render with error
      if (ids.length && allowed.length === 0) {
        const communities = await Community.find({ company: user.company }).select('name').sort({ name: 1 }).lean();
        return res.status(400).render('admin/user-communities', {
          targetUser: { _id: req.params.userId, company: user.company },
          communities,
          assigned: [],
          error: 'None of the selected communities belong to this user’s company.'
        });
      }

      await User.findByIdAndUpdate(req.params.userId, {
        $set: { allowedCommunityIds: allowed.map(c => c._id) }
      });

      // DEBUG (temporary): confirm write
      const fresh = await User.findById(req.params.userId).select('allowedCommunityIds').lean();
      console.log('[assign] saved allowedCommunityIds →', fresh?.allowedCommunityIds);

      res.redirect(`/admin/users/${req.params.userId}/communities`);
    } catch (err) { next(err); }
  }
);

module.exports = router;
