const { getEmailReadiness } = require('./emailReadiness');
const {
  getSendgridConfig,
  getSendgridWebhookConfig,
  getUnsubscribeConfig
} = require('./emailConfig');
const { getSchedulerHeartbeat } = require('./scheduler');

const HEARTBEAT_THRESHOLD_MINUTES = Number(process.env.EMAIL_SCHEDULER_HEARTBEAT_MINUTES) || 5;

const getEmailSystemCheck = async ({ company }) => {
  const sendgridConfig = getSendgridConfig();
  const webhookConfig = getSendgridWebhookConfig();
  const unsubscribeConfig = getUnsubscribeConfig();

  const apiKeyPresent = Boolean(sendgridConfig.apiKey);
  const webhookSecretPresent = Boolean(
    process.env.SENDGRID_WEBHOOK_SECRET || webhookConfig?.token || webhookConfig?.publicKey
  );

  const effectiveBaseUrl = unsubscribeConfig.baseUrl || null;
  const secretPresent = Boolean(unsubscribeConfig.secret);
  const baseUrlResolved = Boolean(effectiveBaseUrl);

  const heartbeat = getSchedulerHeartbeat();
  const lastRunAt = heartbeat?.lastRunAt || null;
  const minutesSinceLastRun = lastRunAt
    ? Math.floor((Date.now() - lastRunAt.getTime()) / 60000)
    : null;
  const heartbeatOk = lastRunAt
    ? Date.now() - lastRunAt.getTime() <= HEARTBEAT_THRESHOLD_MINUTES * 60000
    : false;

  const readiness = await getEmailReadiness({ company });
  const blockers = [
    ...(readiness?.transactional?.blockers || []),
    ...(readiness?.blast?.blockers || [])
  ].map((blocker) => ({
    code: blocker.code,
    message: blocker.message
  }));

  return {
    sendgrid: {
      apiKeyPresent,
      webhookSecretPresent
    },
    unsubscribe: {
      secretPresent,
      baseUrlResolved,
      effectiveBaseUrl
    },
    scheduler: {
      heartbeatOk,
      lastRunAt,
      minutesSinceLastRun
    },
    readiness: {
      transactionalEnabled: Boolean(readiness?.transactional?.enabled),
      blastEnabled: Boolean(readiness?.blast?.enabled),
      blockers
    }
  };
};

module.exports = { getEmailSystemCheck };
