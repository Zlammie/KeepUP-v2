const nodemailer = require('nodemailer');

const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);
const FALSE_SET = new Set(['0', 'false', 'no', 'off']);

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const toInt = (value, fallback) => {
  if (value == null) return fallback;
  const parsed = parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};
const parseBoolean = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_SET.has(normalized)) return true;
  if (FALSE_SET.has(normalized)) return false;
  return fallback;
};

let cachedTransporter = null;

const resolveSmtpConfig = () => {
  const host =
    trim(process.env.SMTP_HOST) ||
    trim(process.env.BETA_SMTP_HOST) ||
    trim(process.env.ZOHO_SMTP_HOST);
  const user =
    trim(process.env.SMTP_USER) ||
    trim(process.env.BETA_SMTP_USER) ||
    trim(process.env.ZOHO_SMTP_USER);
  const pass =
    trim(process.env.SMTP_PASS) ||
    trim(process.env.BETA_SMTP_PASS) ||
    trim(process.env.ZOHO_SMTP_PASS);
  const port =
    toInt(
      process.env.SMTP_PORT ?? process.env.BETA_SMTP_PORT ?? process.env.ZOHO_SMTP_PORT,
      465
    ) || 465;

  if (!host) throw new Error('SMTP_HOST (or fallback BETA_SMTP_HOST/ZOHO_SMTP_HOST) is not configured');
  if (!user) throw new Error('SMTP_USER (or fallback BETA_SMTP_USER/ZOHO_SMTP_USER) is not configured');
  if (!pass) throw new Error('SMTP_PASS (or fallback BETA_SMTP_PASS/ZOHO_SMTP_PASS) is not configured');

  const secureEnv =
    process.env.SMTP_SECURE ??
    process.env.BETA_SMTP_SECURE ??
    process.env.ZOHO_SMTP_SECURE ??
    (port === 465 ? 'true' : 'false');

  return {
    host,
    port,
    secure: parseBoolean(secureEnv, port === 465),
    auth: { user, pass }
  };
};

const getDefaultFromAddress = () => {
  const fallback = 'noreply@keepupcrm.com';
  const from =
    trim(process.env.SMTP_FROM) ||
    trim(process.env.BETA_SIGNUP_FROM) ||
    trim(process.env.BETA_SMTP_USER) ||
    trim(process.env.ZOHO_SMTP_USER) ||
    trim(process.env.SMTP_USER) ||
    fallback;
  return from || fallback;
};

const getTransporter = () => {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(resolveSmtpConfig());
  }
  return cachedTransporter;
};

const sendEmail = async ({ to, subject, text, html, replyTo, from }) => {
  if (!to) throw new Error('Email "to" is required');
  if (!subject) throw new Error('Email "subject" is required');
  const transporter = getTransporter();
  const sender = from || getDefaultFromAddress();

  await transporter.sendMail({
    to,
    from: sender,
    replyTo: replyTo || sender,
    subject,
    text,
    html
  });
};

module.exports = {
  sendEmail,
  getTransporter,
  resolveSmtpConfig,
  getDefaultFromAddress
};
