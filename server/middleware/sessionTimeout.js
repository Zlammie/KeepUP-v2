const SESSION_TIMEOUT_STATUS = 440; // Login Timeout (used by IE & MS servers)

function wantsJson(req) {
  if (!req) return false;
  if (req.originalUrl && req.originalUrl.startsWith('/api')) return true;
  if (req.path && req.path.startsWith('/api')) return true;
  if (req.headers?.accept && req.headers.accept.includes('application/json')) return true;
  return req.xhr === true;
}

module.exports = function sessionTimeout(options = {}) {
  const idleTimeoutMs = Math.max(0, Number(options.idleTimeoutMs) || 0);
  const absoluteTimeoutMs = Math.max(0, Number(options.absoluteTimeoutMs) || 0);
  const cookieName = options.cookieName || process.env.SESSION_COOKIE_NAME || 'sid';
  const cookieDomain = (options.cookieDomain || process.env.SESSION_COOKIE_DOMAIN || '').trim() || undefined;
  const cookieSecure =
    typeof options.cookieSecure === 'boolean' ? options.cookieSecure : undefined;
  const timeoutEnabled = idleTimeoutMs > 0 || absoluteTimeoutMs > 0;

  return (req, res, next) => {
    if (!timeoutEnabled || !req.session) return next();

    const hasPrincipal =
      Boolean(req.session.userId) ||
      Boolean(req.session.user && req.session.user._id);
    if (!hasPrincipal) return next();

    if (!req.session._security) {
      req.session._security = {};
    }

    const meta = req.session._security;
    const now = Date.now();
    if (!meta.createdAt) meta.createdAt = now;
    if (!meta.lastSeenAt) meta.lastSeenAt = now;

    const absoluteExpired = absoluteTimeoutMs > 0 && now - meta.createdAt > absoluteTimeoutMs;
    const idleExpired = idleTimeoutMs > 0 && now - meta.lastSeenAt > idleTimeoutMs;

    if (absoluteExpired || idleExpired) {
      const reason = absoluteExpired ? 'absolute' : 'idle';
      const respond = () => {
        if (!res.headersSent) {
          const cookieOptions = { path: '/', httpOnly: true };
          if (cookieDomain) cookieOptions.domain = cookieDomain;
          if (cookieSecure !== undefined) cookieOptions.secure = cookieSecure;
          res.clearCookie(cookieName, cookieOptions);
        }

        if (wantsJson(req)) {
          return res.status(SESSION_TIMEOUT_STATUS).json({
            error: 'Session expired',
            reason
          });
        }

        return res.redirect(303, `/login?expired=${reason}`);
      };

      return req.session.destroy((err) => {
        if (err) {
          console.error('[sessionTimeout] Failed to destroy expired session', err);
        }
        return respond();
      });
    }

    meta.lastSeenAt = now;
    return next();
  };
};
