// routes/pages.js (tenant-scoped, READONLY-gated)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');


const Contact     = require('../models/Contact');
const Realtor     = require('../models/Realtor');
const Lender      = require('../models/lenderModel');
const Community   = require('../models/Community');
const Competition = require('../models/Competition');
const FloorPlanComp = require('../models/floorPlanComp');
const Company = require('../models/Company');

const isId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const base = req => (isSuper(req) ? {} : { company: req.user.company });

// ????????????????????????? core pages ?????????????????????????
router.get(['/', '/index'], ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/index', { active: 'home' })
);

router.get('/add-lead', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-lead', { active: 'add-lead' })
);

// ????????????????????????? lists ?????????????????????????
router.get('/contacts', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const filter = { ...base(req) }; // tenant scope

      const contacts = await Contact.find(filter)
        .select('firstName lastName email phone status communityIds realtorId lenderId lotId ownerId updatedAt')
        .populate('communityIds', 'name')                                  // array of communities
        .populate('realtorId', 'firstName lastName brokerage email phone') // real field
        .populate('lenderId',  'firstName lastName lenderBrokerage email phone') // real field
        .populate('lotId',     'jobNumber lot block address')
        .populate('ownerId',   'email firstName lastName')
        .sort({ updatedAt: -1 })
        .lean();

      res.render('pages/contacts', { contacts, active: 'contacts' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/realtors', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const realtors = await Realtor.find({ ...base(req) })
      .select('firstName lastName email phone brokerage company')
      .lean();
    res.render('pages/realtors', { realtors, active: 'realtors' });
  }
);

router.get('/lenders', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const lenders = await Lender.find({ ...base(req) })
      .select('firstName lastName email phone lenderBrokerage visitDate company')
      .lean();
    res.render('pages/lenders', { lenders, active: 'lenders' });
  }
);

// ????????????????????????? community pages ?????????????????????????
router.get('/community-management', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/community-management', { active: 'community' })
);

router.get('/view-communities', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const communities = await Community.find({ ...base(req) })
      .select('name city state totalLots company')
      .lean();
    res.render('pages/view-communities', { communities, active: 'community' });
  }
);

router.get('/add-floorplan', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-floorplan', { active: 'floor-plans' })
);

router.get('/view-lots', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    const communityId = isId(req.query.communityId) ? req.query.communityId : '';
    res.render('pages/view-lots', { communityId, active: 'community' });
  }
);

router.get('/address-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    const { communityId, lotId } = req.query;
    if (communityId && !isId(communityId)) return res.status(400).send('Invalid community ID');
    if (lotId && !isId(lotId)) return res.status(400).send('Invalid lot ID');
    res.render('pages/address-details', { communityId, lotId, active: 'community' });
  }
);

// ????????????????????????? details: contact / realtor / lender ?????????????????????????
router.get('/contact-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const id = req.query.id;
      if (!isId(id)) return res.status(400).send('Invalid contact ID');

      const contact = await Contact.findOne({ _id: id, ...base(req) })
        .select('firstName lastName email phone visitDate status notes source communityIds realtorId lenderId lenderStatus lenderInviteDate lenderApprovedDate linkedLot lotLineUp buyTime buyMonth facing living investor renting ownSelling ownNotSelling')
        .populate('realtorId', 'firstName lastName brokerage')
        .populate('lenderId',  'firstName lastName lenderBrokerage')
        .lean();
      if (contact?.visitDate) {
        const dt = new Date(contact.visitDate);
        if (!Number.isNaN(dt.valueOf())) { contact.visitDate = dt.toISOString(); }
      }
      if (!contact) return res.status(404).send('Contact not found');

      res.render('pages/contact-details', { contact, active: 'contacts' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/realtor-details', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const id = req.query.id;
    if (!isId(id)) return res.status(400).send('Invalid realtor ID');

    const realtor = await Realtor.findOne({ _id: id, ...base(req) }).lean();
    if (!realtor) return res.status(404).send('Realtor not found');

    const contacts = await Contact.find({ ...base(req), realtorId: id })
      .select('firstName lastName email phone')
      .lean();
    res.render('pages/realtor-details', { realtor, contacts, active: 'realtors' });
  }
);

router.get('/lender-view', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const id = req.query.id;
    if (!isId(id)) return res.status(400).send('Invalid lender ID');

    const lender = await Lender.findOne({ _id: id, ...base(req) }).lean();
    if (!lender) return res.status(404).send('Lender not found');

    // adjust this filter to your actual schema: either "lenders: { $in: [id] }" (array) or "linkedLender: id" (single)
    const contacts = await Contact.find({ ...base(req), lenderId: id })
   .select('firstName lastName email phone')
   .lean();

    res.render('pages/lender-view', { lender, contacts, active: 'lenders' });
  }
);

// ????????????????????????? competition pages ?????????????????????????
router.get('/competition-home', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/competition-home', { active: 'competition' })
);

router.get('/add-competition', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/add-competition', { active: 'add-competition' })
);

router.get('/manage-competition', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/manage-competition', { active: 'manage-competition' })
);

router.get('/competition-details/:id', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).send('Invalid competition ID');

    const comp = await Competition.findOne({ _id: id, ...base(req) })
      .select('communityName builderName address city state zip company')
      .lean();
    if (!comp) return res.status(404).send('Competition not found');

    const floorPlans = await FloorPlanComp.find({ competition: comp._id, ...base(req) })
      .select('name')
      .lean();

    res.render('pages/competition-details', {
      active: 'competition',
      competition: comp,
      floorPlans: floorPlans.map(fp => fp.name)
    });
  }
);

router.get('/update-competition/:id', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).send('Invalid competition ID');

    const comp = await Competition.findOne({ _id: id, ...base(req) }).lean();
    if (!comp) return res.status(404).send('Competition not found');

    res.render('pages/update-competition', { active: 'competition', competition: comp });
  }
);

// ????????????????????????? my community competition pages ?????????????????????????
router.get('/manage-my-community-competition/:communityId',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const { communityId } = req.params;
    if (!isId(communityId)) return res.status(400).send('Invalid community ID');

    const community = await Community.findOne({ _id: communityId, ...base(req) })
      .select('name city state company')
      .lean();
    if (!community) return res.status(404).send('Community not found');

    res.render('pages/manage-my-community-competition', { communityId, community, profile: null });
  }
);

router.get('/my-community-competition',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/my-community-competition', { title: 'My Community ? Competition' })
);

router.get('/competition-dashboard',
  ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => {
    const communityId = isId(req.query.communityId) ? req.query.communityId : '';
    res.render('pages/competition-dashboard', { active: 'competition', communityId });
  }
);

// ????????????????????????? toolbar/help ?????????????????????????
router.get('/toolbar/help', ensureAuth, requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  (req, res) => res.render('pages/toolbar/help', {})
);

router.get('/admin/companies',
  ensureAuth,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const isSuper = (req.user?.roles || []).includes('SUPER_ADMIN');
      const filter = isSuper ? {} : { _id: req.user.company };

      const companies = await Company.find(filter)
        .select('name slug isActive createdAt')
        .lean();

      res.render('admin/admin-companies', {
        companies,
        form: { name: '', slug: '' }, // default empty form values
        error: null,
        active: 'admin'
      });
    } catch (err) { next(err); }
  }
);

router.post('/admin/companies',
  ensureAuth,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { name = '', slug = '' } = req.body;

      // basic validation
      const trimmedName = String(name).trim();
      const trimmedSlug = String(slug).trim();

      if (!trimmedName) {
        const companies = await Company.find({}).select('name slug isActive createdAt').lean();
        return res.status(400).render('admin/admin-companies', {
          companies,
          form: { name, slug },
          error: 'Company name is required.',
          active: 'admin'
        });
      }

      // Let schema auto-generate slug if you don't provide one
      await Company.create({
        name: trimmedName,
        slug: trimmedSlug || undefined, // undefined ? pre('validate') builds it
        isActive: true
      });

      return res.redirect('/admin/companies');
    } catch (err) {
      // handle duplicate name/slug nicely
      if (err?.code === 11000) {
        const companies = await Company.find({}).select('name slug isActive createdAt').lean();
        return res.status(400).render('admin/admin-companies', {
          companies,
          form: { name: req.body.name, slug: req.body.slug },
          error: 'Name or slug already exists. Please choose another.',
          active: 'admin'
        });
      }
      next(err);
    }
  }
);

module.exports = router;
