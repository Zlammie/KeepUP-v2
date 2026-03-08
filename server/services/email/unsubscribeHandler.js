const { applyUnsubscribeBehavior } = require('./unsubscribe');
const { parseUnsubscribeToken } = require('./unsubscribeToken');

async function processUnsubscribeToken(token) {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) {
    return { ok: false, status: 400, message: 'Invalid or expired unsubscribe token.' };
  }

  await applyUnsubscribeBehavior({
    companyId: parsed.companyId,
    email: parsed.email
  });

  return { ok: true, status: 200, message: 'You have been unsubscribed.' };
}

module.exports = { processUnsubscribeToken };
