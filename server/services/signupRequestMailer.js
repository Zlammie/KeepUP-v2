const { sendEmail, getDefaultFromAddress } = require('./mailer');

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildEmailBody = (payload = {}) => {
  const firstName = trim(payload.firstName);
  const lastName = trim(payload.lastName);
  const companyName = trim(payload.companyName);
  const workEmail = trim(payload.workEmail) || trim(payload.email);
  const phone = trim(payload.phone);
  const salesTeamSize = trim(payload.salesTeamSize);
  const interestedProducts = Array.isArray(payload.interestedProducts)
    ? payload.interestedProducts.map(trim).filter(Boolean)
    : [];

  const normalize = (label, value) => `${label}: ${value || 'n/a'}`;
  const selectedProducts = interestedProducts.length ? interestedProducts.join(', ') : 'None selected';

  const lines = [
    'New KeepUP sign-up request:',
    normalize('First name', firstName),
    normalize('Last name', lastName),
    normalize('Company name', companyName),
    normalize('Work email', workEmail),
    normalize('Phone', phone),
    normalize('Sales team size', salesTeamSize),
    normalize('Interested in other products', selectedProducts)
  ];

  const text = lines.join('\n');
  const html = `
    <div>
      <h2 style="font-family: sans-serif; margin-bottom: 16px;">New KeepUP sign-up request</h2>
      <dl style="font-family: sans-serif; margin: 0 0 16px 0;">
        <div><dt style="font-weight:bold;">First name</dt><dd>${escapeHtml(firstName || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Last name</dt><dd>${escapeHtml(lastName || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Company name</dt><dd>${escapeHtml(companyName || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Work email</dt><dd>${escapeHtml(workEmail || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Phone</dt><dd>${escapeHtml(phone || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Sales team size</dt><dd>${escapeHtml(salesTeamSize || 'n/a')}</dd></div>
        <div><dt style="font-weight:bold;">Interested in other products</dt><dd>${escapeHtml(selectedProducts)}</dd></div>
      </dl>
    </div>
  `;

  return { text, html, replyTo: workEmail };
};

const getSignupRequestRecipients = () => {
  const to =
    trim(process.env.SIGNUP_REQUEST_TO) ||
    trim(process.env.BETA_SIGNUP_TO) ||
    trim(process.env.ZOHO_SIGNUP_REQUEST_TO) ||
    trim(process.env.ZOHO_BETA_TO);
  if (!to) {
    throw new Error(
      'SIGNUP_REQUEST_TO (or legacy BETA_SIGNUP_TO / ZOHO_SIGNUP_REQUEST_TO / ZOHO_BETA_TO) is not configured'
    );
  }
  return to;
};

const getFromAddress = () => {
  const from =
    trim(process.env.SIGNUP_REQUEST_FROM) ||
    trim(process.env.BETA_SIGNUP_FROM) ||
    trim(process.env.SMTP_FROM) ||
    getDefaultFromAddress();
  return from || getDefaultFromAddress();
};

const sendSignupRequestEmail = async (payload = {}) => {
  const { text, html, replyTo } = buildEmailBody(payload);

  const to = getSignupRequestRecipients();
  const from = getFromAddress();
  const subject =
    trim(process.env.SIGNUP_REQUEST_SUBJECT) ||
    trim(process.env.BETA_SIGNUP_SUBJECT) ||
    'New KeepUP sign-up request';

  await sendEmail({
    to,
    from,
    replyTo: replyTo || from,
    subject,
    text,
    html
  });
};

module.exports = {
  sendSignupRequestEmail
};
