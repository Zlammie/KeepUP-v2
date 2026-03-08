const { normalizeEmail } = require('../../utils/normalizeEmail');

const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);

const parseBoolean = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_SET.has(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseCsv = (value) => (
  String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
);

const EMAIL_SENDING_ENABLED = parseBoolean(process.env.EMAIL_SENDING_ENABLED, false);
const EMAIL_ALLOWLIST_ENABLED = parseBoolean(process.env.EMAIL_ALLOWLIST_ENABLED, true);
const EMAIL_ALLOWLIST_DOMAINS = new Set(
  parseCsv(process.env.EMAIL_ALLOWLIST_DOMAINS)
    .map((d) => d.toLowerCase().replace(/^@/, ''))
);
const EMAIL_ALLOWLIST_EMAILS = new Set(
  parseCsv(process.env.EMAIL_ALLOWLIST_EMAILS)
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
);

const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || 'sendgrid').trim().toLowerCase();

const SENDGRID_API_KEY = String(process.env.SENDGRID_API_KEY || '').trim();
const SENDGRID_ADMIN_API_KEY = String(process.env.SENDGRID_ADMIN_API_KEY || '').trim();
const SENDGRID_SANDBOX_MODE = parseBoolean(process.env.SENDGRID_SANDBOX_MODE, false);
const SENDGRID_FROM_EMAIL = String(process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS || '').trim();
const SENDGRID_FROM_NAME = String(process.env.SENDGRID_FROM_NAME || process.env.EMAIL_FROM_NAME || '').trim();
const SENDGRID_WEBHOOK_TOKEN = String(process.env.SENDGRID_WEBHOOK_TOKEN || '').trim();
const SENDGRID_WEBHOOK_PUBLIC_KEY = String(process.env.SENDGRID_WEBHOOK_PUBLIC_KEY || '').trim();
const EMAIL_UNSUBSCRIBE_SECRET = String(process.env.EMAIL_UNSUBSCRIBE_SECRET || '').trim();
const EMAIL_UNSUBSCRIBE_BASE_URL = String(process.env.EMAIL_UNSUBSCRIBE_BASE_URL || process.env.BASE_URL || '').trim();
const EMAIL_ADMIN_ALERTS_ENABLED = parseBoolean(process.env.EMAIL_ADMIN_ALERTS_ENABLED, false);
const EMAIL_ADMIN_ALERTS_TO = parseCsv(process.env.EMAIL_ADMIN_ALERTS_TO);
const EMAIL_ADMIN_ALERTS_FROM = String(process.env.EMAIL_ADMIN_ALERTS_FROM || SENDGRID_FROM_EMAIL || '').trim();

const getEmailProviderName = () => EMAIL_PROVIDER || 'sendgrid';
const isEmailSendingEnabled = () => EMAIL_SENDING_ENABLED;
const isAllowlistEnabled = () => EMAIL_ALLOWLIST_ENABLED;

const isAllowlisted = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (EMAIL_ALLOWLIST_EMAILS.has(normalized)) return true;
  const domain = normalized.split('@')[1];
  if (domain && EMAIL_ALLOWLIST_DOMAINS.has(domain)) return true;
  return false;
};

const getSendgridConfig = () => ({
  apiKey: SENDGRID_API_KEY,
  sandboxMode: SENDGRID_SANDBOX_MODE,
  fromEmail: SENDGRID_FROM_EMAIL,
  fromName: SENDGRID_FROM_NAME
});

const getSendgridAdminKey = () => SENDGRID_ADMIN_API_KEY || SENDGRID_API_KEY;

const getSendgridWebhookConfig = () => ({
  token: SENDGRID_WEBHOOK_TOKEN,
  publicKey: SENDGRID_WEBHOOK_PUBLIC_KEY
});

const getUnsubscribeConfig = () => ({
  secret: EMAIL_UNSUBSCRIBE_SECRET,
  baseUrl: EMAIL_UNSUBSCRIBE_BASE_URL
});

const getAdminAlertsConfig = () => ({
  enabled: EMAIL_ADMIN_ALERTS_ENABLED,
  to: EMAIL_ADMIN_ALERTS_TO,
  fromEmail: EMAIL_ADMIN_ALERTS_FROM || SENDGRID_FROM_EMAIL,
  fromName: SENDGRID_FROM_NAME || 'KeepUp CRM'
});

module.exports = {
  getEmailProviderName,
  isEmailSendingEnabled,
  isAllowlistEnabled,
  isAllowlisted,
  getSendgridConfig,
  getSendgridAdminKey,
  getSendgridWebhookConfig,
  getUnsubscribeConfig,
  getAdminAlertsConfig
};
