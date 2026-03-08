const sgMail = require('@sendgrid/mail');
const { getSendgridConfig } = require('./emailConfig');

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  const { apiKey } = getSendgridConfig();
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is missing');
  }
  sgMail.setApiKey(apiKey);
  initialized = true;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function injectPreviewText(html, previewText) {
  const safePreview = escapeHtml(previewText || '').trim();
  if (!safePreview || !html) return html;
  const preheader =
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">` +
    `${safePreview}` +
    `</div>`;
  return `${preheader}${html}`;
}

async function sendEmail(payload, options = {}) {
  ensureInitialized();
  const config = getSendgridConfig();
  if (!config.fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL is missing');
  }

  const fallbackFrom = config.fromName
    ? { email: config.fromEmail, name: config.fromName }
    : { email: config.fromEmail };

  const from = payload.from?.email
    ? (payload.from.name ? { email: payload.from.email, name: payload.from.name } : { email: payload.from.email })
    : fallbackFrom;

  const replyTo = payload.replyTo?.email
    ? (payload.replyTo.name ? { email: payload.replyTo.email, name: payload.replyTo.name } : { email: payload.replyTo.email })
    : null;

  const msg = {
    to: payload.to,
    from,
    subject: payload.subject || '',
    html: injectPreviewText(payload.html || '', payload.previewText || ''),
    text: payload.text || '',
    custom_args: payload.customArgs || undefined
  };
  if (payload.headers && typeof payload.headers === 'object') {
    msg.headers = payload.headers;
  }
  if (replyTo) {
    msg.replyTo = replyTo;
  }

  if (config.sandboxMode) {
    msg.mail_settings = {
      sandbox_mode: { enable: true }
    };
  }

  try {
    const [response] = await sgMail.send(msg);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      response?.headers?.['X-Message-ID'] ||
      null;
    return { messageId, response };
  } catch (err) {
    const status = err?.code || err?.response?.statusCode;
    const body = err?.response?.body;
    const headers = err?.response?.headers;

    console.error('[sendgrid] send failed', {
      status,
      body,
      headers,
      from: msg?.from,
      to: msg?.to
    });

    throw err;
  }
}

module.exports = { sendEmail };
