const express = require('express');
const crypto = require('crypto');
const { getSendgridWebhookConfig } = require('../services/email/emailConfig');
const { processSendgridEvents } = require('../services/email/sendgridWebhookProcessor');

const router = express.Router();

const verifySignature = ({ signature, timestamp, payload, publicKey }) => {
  try {
    const key = crypto.createPublicKey(publicKey);
    const signedPayload = Buffer.concat([Buffer.from(timestamp), payload]);
    return crypto.verify(
      'sha256',
      signedPayload,
      key,
      Buffer.from(signature, 'base64')
    );
  } catch (err) {
    console.warn('[sendgrid webhook] signature verify failed', err);
    return false;
  }
};


router.post('/events', async (req, res) => {
  const { token, publicKey } = getSendgridWebhookConfig();
  const signature = req.get('X-Twilio-Email-Event-Webhook-Signature');
  const timestamp = req.get('X-Twilio-Email-Event-Webhook-Timestamp');
  const payload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

  if (publicKey) {
    if (!signature || !timestamp || !verifySignature({ signature, timestamp, payload, publicKey })) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } else if (token) {
    const headerToken = String(req.get('X-Webhook-Token') || '').trim();
    if (!headerToken || headerToken !== token) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
  } else {
    return res.status(401).json({ error: 'Webhook verification not configured' });
  }

  const events = Array.isArray(req.body) ? req.body : null;
  if (!events) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const result = await processSendgridEvents(events);
  return res.json({ ok: true, ...result });
});

module.exports = router;
