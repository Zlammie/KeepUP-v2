const crypto = require('crypto');
const { normalizeEmail } = require('../../utils/normalizeEmail');
const { getUnsubscribeConfig } = require('./emailConfig');

const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');

const decodePayload = (value) => {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
};

const signPayload = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const timingSafeEqual = (a, b) => {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const buildUnsubscribeToken = ({ companyId, email }) => {
  const { secret } = getUnsubscribeConfig();
  if (!secret) return null;
  const normalized = normalizeEmail(email);
  if (!companyId || !normalized) return null;
  const payload = {
    companyId: String(companyId),
    email: normalized,
    ts: Date.now()
  };
  const encoded = encodePayload(payload);
  const signature = signPayload(encoded, secret);
  return `${encoded}.${signature}`;
};

const parseUnsubscribeToken = (token) => {
  const { secret } = getUnsubscribeConfig();
  if (!secret || !token) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = signPayload(encoded, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  const payload = decodePayload(encoded);
  if (!payload?.companyId || !payload?.email) return null;
  return payload;
};

const buildUnsubscribeUrl = ({ companyId, email }) => {
  const { baseUrl } = getUnsubscribeConfig();
  if (!baseUrl) return null;
  const token = buildUnsubscribeToken({ companyId, email });
  if (!token) return null;
  const prefix = String(baseUrl || '').replace(/\/+$/, '');
  return `${prefix}/email/unsubscribe?token=${encodeURIComponent(token)}`;
};

module.exports = {
  buildUnsubscribeToken,
  parseUnsubscribeToken,
  buildUnsubscribeUrl
};
