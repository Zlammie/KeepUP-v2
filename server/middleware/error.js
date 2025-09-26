// server/middleware/error.js
function wantsJSON(req) {
  return req.path.startsWith('/api/')
      || req.xhr
      || req.get('accept')?.includes('application/json');
}

function notFound(req, res, next) {
  if (wantsJSON(req)) {
    return res.status(404).json({ error: 'Route not found', path: req.originalUrl });
  }
  try {
    return res.status(404).render('pages/404', { url: req.originalUrl });
  } catch (e) {
    return res.status(404).send('404 Not Found');
  }
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || 500;

  if (wantsJSON(req)) {
    return res.status(status).json({ error: err.message || 'Internal Server Error' });
  }

  // Try to render the 500 page; if that fails, fall back to JSON/text
  try {
    return res.status(status).render('pages/500', { error: err });
  } catch (renderErr) {
    try {
      return res.status(status).json({ error: err.message || 'Internal Server Error' });
    } catch {
      return res.status(status).send('Internal Server Error');
    }
  }
}

module.exports = { notFound, errorHandler };
