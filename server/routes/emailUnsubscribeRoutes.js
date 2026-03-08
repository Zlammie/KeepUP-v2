const express = require('express');
const { processUnsubscribeToken } = require('../services/email/unsubscribeHandler');

const router = express.Router();

const renderUnsubscribe = (res, status, message) =>
  res.render('pages/unsubscribe', { status, message });

const handleUnsubscribe = async (req, res) => {
  const token = String(req.query?.token || req.body?.token || '').trim();
  if (!token) {
    return renderUnsubscribe(res.status(400), 'error', 'Missing unsubscribe token.');
  }

  try {
    const result = await processUnsubscribeToken(token);
    if (!result.ok) {
      return renderUnsubscribe(res.status(result.status || 400), 'error', result.message);
    }
    return renderUnsubscribe(res, 'success', result.message);
  } catch (err) {
    console.error('[unsubscribe] failed', err);
    return renderUnsubscribe(res.status(500), 'error', 'Unable to process unsubscribe right now.');
  }
};

router.get('/email/unsubscribe', handleUnsubscribe);
router.post('/email/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribe);

module.exports = router;
