// routes/api/index.js
const express = require('express');
const ensureAuth = require('../../middleware/ensureAuth');

const realtorRoutes = require('../realtorRoutes');
const contactRoutes = require('../contactRoutes');
const communityRoutes = require('../communityRoutes');
const lenderRoutes = require('../lenderRoutes');
const commentRoutes = require('../commentsRoutes');
const floorPlanRoutes = require('../floorPlanRoutes');
const lotViewRoutes = require('../lotViewRoutes');
const competitionApi = require('./competitions.api');
const myCommunityCompetitionRoutes = require('../myCommunityCompetitionRoutes');
const manageMyCommunityCompetitionRoutes = require('../manageMyCommunityCompetitionRoutes');

const router = express.Router();

// protect all API endpoints
router.use(ensureAuth);

router.use('/realtors', realtorRoutes);
router.use('/contacts', contactRoutes);
router.use('/communities', communityRoutes);
router.use('/lenders', lenderRoutes);
router.use('/comments', commentRoutes);
router.use('/floorplans', floorPlanRoutes);
router.use('/', lotViewRoutes); // if this exposes /lots or other root endpoints
router.use('/competitions', competitionApi);
router.use('/', myCommunityCompetitionRoutes);
router.use('/', manageMyCommunityCompetitionRoutes);

module.exports = router;
