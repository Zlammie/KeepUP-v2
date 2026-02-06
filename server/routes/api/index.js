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
const adminCompanyApi = require('./admin-company.api');
const adminBillingApi = require('./admin-billing.api');
const tasksApi = require('./tasks.api');
const adminUsersApi = require('./admin-users.api');
const usersApi = require('./users.api');
const adminImpersonationApi = require('./admin-impersonation.api');
const buildrootzAdminApi = require('./buildrootz-admin.api');
const buildrootzSuperAdminApi = require('./buildrootz-superadmin.api');
const competitionRoutes = require('../competitionRoutes');
const myCommunityCompetitionRoutes = require('../myCommunityCompetitionRoutes');
const manageMyCommunityCompetitionRoutes = require('../manageMyCommunityCompetitionRoutes');
const communityCompetitionProfileRoutes = require('../communityCompetitionProfileRoutes');
const taskSchedulesApi = require('./task-schedules.api');
const emailTemplatesApi = require('./email-templates.api');
const emailRulesApi = require('./email-rules.api');
const emailQueueApi = require('./email-queue.api');
const emailSettingsApi = require('./email-settings.api');
const emailAudienceApi = require('./email-audience.api');
const emailSchedulesApi = require('./email-schedules.api');
const emailSuppressionsApi = require('./email-suppressions.api');
const emailCommonAutomationsApi = require('./email-common-automations.api');
const emailHealthApi = require('./email-health.api');
const emailBlastsApi = require('./email-blasts.api');
const emailAssetsApi = require('./email-assets.api');
const buildrootzPublishRoutes = require('../buildrootzPublishRoutes');

const router = express.Router();

// protect all API endpoints
router.use(ensureAuth);

router.use('/realtors', realtorRoutes);
router.use('/contacts', contactRoutes);
router.use('/communities', communityRoutes);
router.use('/lenders', lenderRoutes);
router.use('/comments', commentRoutes);
router.use('/floorplans', floorPlanRoutes);
router.use('/admin/company', adminCompanyApi);
router.use('/admin/billing', adminBillingApi);
router.use('/admin/users', adminUsersApi);
router.use('/users', usersApi);
router.use('/admin/impersonation', adminImpersonationApi);
router.use('/admin/buildrootz', buildrootzAdminApi);
router.use('/superadmin/buildrootz', buildrootzSuperAdminApi);
router.use('/tasks', tasksApi);
router.use('/task-schedules', taskSchedulesApi);
router.use('/email/templates', emailTemplatesApi);
router.use('/email/rules', emailRulesApi);
router.use('/email/queue', emailQueueApi);
router.use('/email/settings', emailSettingsApi);
router.use('/email/audience', emailAudienceApi);
router.use('/email/schedules', emailSchedulesApi);
router.use('/email/suppressions', emailSuppressionsApi);
router.use('/email/common-automations', emailCommonAutomationsApi);
router.use('/email/health', emailHealthApi);
router.use('/email/blasts', emailBlastsApi);
router.use('/email/assets', emailAssetsApi);
router.use('/', lotViewRoutes); // if this exposes /lots or other root endpoints
router.use('/competitions', competitionApi);
router.use('/competitions', competitionRoutes);
router.use('/', myCommunityCompetitionRoutes);
router.use('/', manageMyCommunityCompetitionRoutes);
router.use('/', communityCompetitionProfileRoutes);
router.use('/buildrootz', buildrootzPublishRoutes);

module.exports = router;
