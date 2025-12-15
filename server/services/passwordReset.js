const crypto = require('crypto');
const PasswordToken = require('../models/PasswordToken');
const User = require('../models/User');
const { sendEmail } = require('./mailer');

const TOKEN_TTLS = Object.freeze({
  RESET_MS: 1000 * 60 * 60,          // 1 hour
  INVITE_MS: 1000 * 60 * 60 * 24 * 7 // 7 days
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const sanitize = (value) => (typeof value === 'string' ? value.trim() : '');

const buildBaseUrl = (baseUrlFromEnv, req) => {
  const configured = sanitize(baseUrlFromEnv || process.env.BASE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  if (req && req.protocol && req.get) {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}`;
  }
  return '';
};

const buildResetLink = ({ token, baseUrl, req }) => {
  const origin = buildBaseUrl(baseUrl, req);
  const prefix = origin || '';
  return `${prefix}/reset-password?token=${encodeURIComponent(token)}`;
};

const issuePasswordToken = async ({ userId, type, ttlMs, metadata }) => {
  if (!userId) throw new Error('userId is required to issue a password token');
  if (!type || !Object.values(PasswordToken.TOKEN_TYPES).includes(type)) {
    throw new Error(`Invalid token type: ${type}`);
  }

  const ttl = ttlMs || (type === PasswordToken.TOKEN_TYPES.RESET ? TOKEN_TTLS.RESET_MS : TOKEN_TTLS.INVITE_MS);
  const expiresAt = new Date(Date.now() + ttl);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);

  // Ensure only one active token per user/type to reduce attack surface
  await PasswordToken.deleteMany({ userId, type });

  const doc = await PasswordToken.create({
    userId,
    tokenHash,
    type,
    expiresAt,
    metadata: metadata || null
  });

  return { token: rawToken, record: doc, expiresAt };
};

const findValidToken = async (rawToken) => {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const doc = await PasswordToken.findOne({ tokenHash }).lean();
  if (!doc) return null;
  if (doc.usedAt) return null;
  if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;
  return doc;
};

const consumeToken = async (rawToken) => {
  const record = await findValidToken(rawToken);
  if (!record) return null;

  await PasswordToken.updateOne({ _id: record._id }, { $set: { usedAt: new Date() } });
  await PasswordToken.deleteMany({
    userId: record.userId,
    type: record.type,
    _id: { $ne: record._id }
  });

  return record;
};

const sendInviteEmail = async ({ user, companyName, token, baseUrl, inviterName, req }) => {
  if (!user || !user.email) throw new Error('User with email is required to send invite email');
  const link = buildResetLink({ token, baseUrl, req });
  const friendlyName = [sanitize(user.firstName), sanitize(user.lastName)].filter(Boolean).join(' ') || user.email;
  const inviter = sanitize(inviterName);
  const companyLabel = sanitize(companyName);
  const inviterLine = inviter ? ` ${inviter} invited you to join KeepUP.` : ' You have been invited to join KeepUP.';
  const companyLine = companyLabel ? ` at ${companyLabel}` : '';
  const expiresInText = 'This link will expire in 7 days.';

  const subject = companyName
    ? `${companyName} invited you to KeepUP`
    : 'Set up your KeepUP account';

  const text = [
    `Hi ${friendlyName || 'there'},`,
    '',
    `${inviterLine}${companyLine}`,
    'Use the link below to set your password and activate your account:',
    link,
    '',
    expiresInText,
    '',
    'If you did not expect this email, you can ignore it.'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p style="margin: 0 0 12px 0;">Hi ${friendlyName || 'there'},</p>
      <p style="margin: 0 0 12px 0;">${inviterLine}${companyLine}</p>
      <p style="margin: 0 0 16px 0;">Use the button below to set your password and activate your account.</p>
      <p style="margin: 0 0 18px 0;">
        <a href="${link}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Set your password</a>
      </p>
      <p style="margin: 0 0 12px 0; word-break: break-all;">Link: <a href="${link}">${link}</a></p>
      <p style="margin: 0 0 12px 0;">${expiresInText}</p>
      <p style="margin: 0;">If you did not expect this email, you can ignore it.</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

const sendResetEmail = async ({ user, token, baseUrl, req }) => {
  if (!user || !user.email) throw new Error('User with email is required to send reset email');
  const link = buildResetLink({ token, baseUrl, req });
  const friendlyName = [sanitize(user.firstName), sanitize(user.lastName)].filter(Boolean).join(' ') || user.email;
  const expiresInText = 'This link will expire in 1 hour.';

  const subject = 'Reset your KeepUP password';

  const text = [
    `Hi ${friendlyName || 'there'},`,
    '',
    'We received a request to reset your KeepUP password.',
    'Use the link below to choose a new one:',
    link,
    '',
    expiresInText,
    '',
    'If you did not request this, you can safely ignore this email.'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p style="margin: 0 0 12px 0;">Hi ${friendlyName || 'there'},</p>
      <p style="margin: 0 0 12px 0;">We received a request to reset your KeepUP password.</p>
      <p style="margin: 0 0 16px 0;">Use the button below to choose a new password.</p>
      <p style="margin: 0 0 18px 0;">
        <a href="${link}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a>
      </p>
      <p style="margin: 0 0 12px 0; word-break: break-all;">Link: <a href="${link}">${link}</a></p>
      <p style="margin: 0 0 12px 0;">${expiresInText}</p>
      <p style="margin: 0;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

const loadUserForToken = async (record) => {
  if (!record) return null;
  const user = await User.findById(record.userId)
    .select('_id email roles role status isActive company firstName lastName mustChangePassword')
    .lean();
  return user;
};

module.exports = {
  TOKEN_TTLS,
  issuePasswordToken,
  consumeToken,
  findValidToken,
  buildResetLink,
  sendInviteEmail,
  sendResetEmail,
  loadUserForToken
};
