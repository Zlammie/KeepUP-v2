const nodemailer = require('nodemailer');

const TRUE_SET = new Set(['1', 'true', 'yes', 'on']);
const FALSE_SET = new Set(['0', 'false', 'no', 'off']);

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

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

let cachedTransporter = null;

const resolveSmtpConfig = () => {
  const host =
    trim(process.env.BETA_SMTP_HOST) ||
    trim(process.env.ZOHO_SMTP_HOST) ||
    trim(process.env.SMTP_HOST);
  const user =
    trim(process.env.BETA_SMTP_USER) ||
    trim(process.env.ZOHO_SMTP_USER) ||
    trim(process.env.SMTP_USER);
  const pass =
    trim(process.env.BETA_SMTP_PASS) ||
    trim(process.env.ZOHO_SMTP_PASS) ||
    trim(process.env.SMTP_PASS);
  const port =
    toInt(
      process.env.BETA_SMTP_PORT ?? process.env.ZOHO_SMTP_PORT ?? process.env.SMTP_PORT,
      465
    ) || 465;

  if (!host) throw new Error('BETA_SMTP_HOST (or fallback SMTP_HOST) is not configured');
  if (!user) throw new Error('BETA_SMTP_USER (or fallback SMTP_USER) is not configured');
  if (!pass) throw new Error('BETA_SMTP_PASS (or fallback SMTP_PASS) is not configured');

  const secureEnv =
    process.env.BETA_SMTP_SECURE ??
    process.env.ZOHO_SMTP_SECURE ??
    process.env.SMTP_SECURE ??
    (port === 465 ? 'true' : 'false');

  return {
    host,
    port,
    secure: parseBoolean(secureEnv, port === 465),
    auth: { user, pass }
  };
};

const getTransporter = () => {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(resolveSmtpConfig());
  }
  return cachedTransporter;
};

const buildEmailBody = (payload = {}) => {
  const fullName = trim(payload.fullName) || trim(payload.name);
  const company = trim(payload.company);
  const email = trim(payload.email);
  const phone = trim(payload.phone);
  const notes = trim(payload.notes) || trim(payload.message);

  const normalize = (label, value) => `${label}: ${value || 'n/a'}`;

  const lines = [
    'New KeepUP beta sign-up:',
    normalize('Full name', fullName),
    normalize('Email', email),
    normalize('Company', company),
    normalize('Phone', phone),
    '',
    notes ? notes : 'No additional context was provided.'
  ];

  const text = lines.join('\n');
  const html = `
    <div>
      <h2 style="font-family: sans-serif; margin-bottom: 16px;">New KeepUP beta sign-up</h2>
      <dl style="font-family: sans-serif; margin: 0 0 16px 0;">
        <div><dt style="font-weight:bold;">Full name</dt><dd>${fullName || 'n/a'}</dd></div>
        <div><dt style="font-weight:bold;">Email</dt><dd>${email || 'n/a'}</dd></div>
        <div><dt style="font-weight:bold;">Company</dt><dd>${company || 'n/a'}</dd></div>
        <div><dt style="font-weight:bold;">Phone</dt><dd>${phone || 'n/a'}</dd></div>
      </dl>
      <section style="font-family: sans-serif;">
        <h3 style="font-weight:bold;">Notes</h3>
        <p>${(notes || 'No additional context was provided.').replace(/\n/g, '<br />')}</p>
      </section>
    </div>
  `;

  return { text, html, replyTo: email };
};

const getBetaRecipients = () => {
  const to =
    trim(process.env.BETA_SIGNUP_TO) ||
    trim(process.env.ZOHO_BETA_TO);
  if (!to) throw new Error('BETA_SIGNUP_TO (or ZOHO_BETA_TO) is not configured');
  return to;
};

const getFromAddress = () => {
  const from =
    trim(process.env.BETA_SIGNUP_FROM) ||
    trim(process.env.BETA_SMTP_USER) ||
    trim(process.env.ZOHO_SMTP_USER) ||
    trim(process.env.SMTP_FROM) ||
    trim(process.env.SMTP_USER);
  if (!from) throw new Error('BETA_SIGNUP_FROM (or SMTP fallback) is not configured');
  return from;
};

const sendBetaSignupEmail = async (payload = {}) => {
  const transporter = getTransporter();
  const { text, html, replyTo } = buildEmailBody(payload);

  const to = getBetaRecipients();
  const from = getFromAddress();
  const subject = trim(process.env.BETA_SIGNUP_SUBJECT) || 'New KeepUP beta sign-up';

  await transporter.sendMail({
    to,
    from,
    replyTo: replyTo || from,
    subject,
    text,
    html
  });
};

module.exports = {
  sendBetaSignupEmail
};
