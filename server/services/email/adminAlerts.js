const { getAdminAlertsConfig, getEmailProviderName } = require('./emailConfig');
const provider = require('./provider');

const buildRecipients = (list) => list.filter(Boolean);

async function sendAdminAlert({ subject, html, text }) {
  const config = getAdminAlertsConfig();
  if (!config.enabled) return { sent: false, reason: 'disabled' };
  const recipients = buildRecipients(config.to || []);
  if (!recipients.length) return { sent: false, reason: 'no_recipients' };
  if (!config.fromEmail) return { sent: false, reason: 'missing_from' };

  const payload = {
    to: recipients,
    subject: subject || 'KeepUp alert',
    html: html || '',
    text: text || '',
    from: { email: config.fromEmail, name: config.fromName }
  };

  try {
    const providerName = getEmailProviderName();
    await provider.sendEmail(payload, providerName);
    return { sent: true };
  } catch (err) {
    console.error('[admin-alert] failed to send', err);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = { sendAdminAlert };
