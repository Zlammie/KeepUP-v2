const express = require('express');
const router = express.Router();

const { sendBetaSignupEmail } = require('../services/betaSignupMailer');

const sanitize = (value) => (typeof value === 'string' ? value.trim() : '');

const emptyValues = () => ({
  fullName: '',
  company: '',
  email: '',
  phone: '',
  notes: ''
});

const renderView = (res, overrides = {}) => {
  const defaults = {
    values: emptyValues(),
    status: null,
    error: null,
    message: ''
  };

  const mergedValues = { ...defaults.values, ...(overrides.values || {}) };
  const viewModel = {
    ...defaults,
    ...overrides,
    values: mergedValues
  };

  return res.render('pages/beta-signup', viewModel);
};

router.get('/beta-signup', (req, res) => renderView(res));

router.post('/beta-signup', async (req, res) => {
  const values = {
    fullName: sanitize(req.body.fullName || req.body.name),
    company: sanitize(req.body.company),
    email: sanitize(req.body.email),
    phone: sanitize(req.body.phone),
    notes: sanitize(req.body.notes || req.body.message)
  };

  const errors = [];
  if (!values.fullName) errors.push('Name is required.');
  if (!values.email) errors.push('Email is required.');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) errors.push('Enter a valid email.');

  if (values.phone && values.phone.length < 7) {
    errors.push('Phone number looks too short.');
  }

  if (errors.length) {
    const response = res.status(400);
    return renderView(response, {
      values,
      error: errors.join(' '),
      status: 'error'
    });
  }

  try {
    await sendBetaSignupEmail(values);
    return renderView(res, {
      values: emptyValues(),
      status: 'success',
      message: 'Thanks! We just received your request and will be in touch.'
    });
  } catch (err) {
    console.error('[beta-signup] failed to send email', err);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'We could not submit your request right now. Please try again in a moment.';
    const response = res.status(500);
    return renderView(response, {
      values,
      status: 'error',
      error: errorMessage
    });
  }
});

module.exports = router;
