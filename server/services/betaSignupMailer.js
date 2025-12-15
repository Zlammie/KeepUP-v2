const { sendEmail, getDefaultFromAddress } = require('./mailer');

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

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
    trim(process.env.SMTP_FROM) ||
    getDefaultFromAddress();
  return from || getDefaultFromAddress();
};

const sendBetaSignupEmail = async (payload = {}) => {
  const { text, html, replyTo } = buildEmailBody(payload);

  const to = getBetaRecipients();
  const from = getFromAddress();
  const subject = trim(process.env.BETA_SIGNUP_SUBJECT) || 'New KeepUP beta sign-up';

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
  sendBetaSignupEmail
};
