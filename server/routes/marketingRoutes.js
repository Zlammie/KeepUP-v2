const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const SignupRequest = require('../models/SignupRequest');
const { sendSignupRequestEmail } = require('../services/signupRequestMailer');

const sanitize = (value) => (typeof value === 'string' ? value.trim() : '');
const sanitizeEmail = (value) => sanitize(value).toLowerCase();
const sanitizeArray = (value) => {
  if (Array.isArray(value)) return value.map(sanitize).filter(Boolean);
  const normalized = sanitize(value);
  return normalized ? [normalized] : [];
};
const OPEN_SIGNUP_REQUEST_STATUSES = [
  SignupRequest.STATUS.PENDING,
  SignupRequest.STATUS.CONTACTED
];
const SIGNUP_REQUEST_SUCCESS_MESSAGE =
  "Thanks for your interest in KeepUp. We\u2019ll review your request and follow up with next steps.";
const SIGNUP_REQUEST_ALREADY_ON_FILE_MESSAGE =
  "Thanks for your interest in KeepUp. We already have your request on file and will follow up with next steps.";

const INTERESTED_PRODUCT_OPTIONS = [
  'BuildRootz',
  'Interactive Maps',
  'Competition Tracking',
  'Email Automation'
];

const emptyValues = () => ({
  firstName: '',
  lastName: '',
  companyName: '',
  workEmail: '',
  phone: '',
  salesTeamSize: '',
  interestedProducts: []
});

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const renderSignupRequestView = (res, overrides = {}) => {
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

  return res.render('pages/signup-request', viewModel);
};

const handleSignupRequest = async (req, res) => {
  const values = {
    firstName: sanitize(req.body.firstName),
    lastName: sanitize(req.body.lastName),
    companyName: sanitize(req.body.companyName),
    workEmail: sanitizeEmail(req.body.workEmail || req.body.email),
    phone: sanitize(req.body.phone),
    salesTeamSize: sanitize(req.body.salesTeamSize),
    interestedProducts: sanitizeArray(req.body.interestedProducts).filter((product) =>
      INTERESTED_PRODUCT_OPTIONS.includes(product)
    )
  };
  const phoneDigits = values.phone.replace(/\D/g, '');

  const errors = [];
  if (!values.firstName) errors.push('First name is required.');
  if (!values.lastName) errors.push('Last name is required.');
  if (!values.workEmail) errors.push('Work email is required.');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.workEmail)) {
    errors.push('Enter a valid email.');
  }
  if (!values.phone) errors.push('Phone is required.');
  else if (phoneDigits.length < 7) {
    errors.push('Phone number looks too short.');
  }
  if (!values.salesTeamSize) errors.push('Sales team size is required.');
  else if (!/^\d+$/.test(values.salesTeamSize) || Number(values.salesTeamSize) < 1) {
    errors.push('Enter a valid sales team size.');
  }

  if (errors.length) {
    const response = res.status(400);
    return renderSignupRequestView(response, {
      values,
      error: errors.join(' '),
      status: 'error'
    });
  }

  try {
    const existingOpenRequest = await SignupRequest.findOne({
      workEmail: values.workEmail,
      status: { $in: OPEN_SIGNUP_REQUEST_STATUSES }
    })
      .sort({ submittedAt: -1 })
      .exec();

    if (existingOpenRequest) {
      existingOpenRequest.firstName = values.firstName;
      existingOpenRequest.lastName = values.lastName;
      existingOpenRequest.companyName = values.companyName;
      existingOpenRequest.workEmail = values.workEmail;
      existingOpenRequest.phone = values.phone;
      existingOpenRequest.salesTeamSize = values.salesTeamSize;
      existingOpenRequest.interestedProducts = values.interestedProducts;
      existingOpenRequest.submittedAt = new Date();
      await existingOpenRequest.save();

      return renderSignupRequestView(res, {
        values: emptyValues(),
        status: 'success',
        message: SIGNUP_REQUEST_ALREADY_ON_FILE_MESSAGE
      });
    }

    const signupRequest = await SignupRequest.create({
      ...values,
      status: SignupRequest.STATUS.PENDING
    });

    try {
      await sendSignupRequestEmail(values);
    } catch (err) {
      console.error(
        '[signup-request] saved request but failed to send email',
        {
          signupRequestId: String(signupRequest._id),
          workEmail: values.workEmail
        },
        err
      );
    }

    return renderSignupRequestView(res, {
      values: emptyValues(),
      status: 'success',
      message: SIGNUP_REQUEST_SUCCESS_MESSAGE
    });
  } catch (err) {
    console.error('[signup-request] failed to save request', err);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'We could not submit your request right now. Please try again in a moment.';
    const response = res.status(500);
    return renderSignupRequestView(response, {
      values,
      status: 'error',
      error: errorMessage
    });
  }
};

router.get('/signup-request', (req, res) => renderSignupRequestView(res));
router.get('/beta-signup', (req, res) => res.redirect(302, '/signup-request'));

router.get('/public/communities/:communityId', (req, res) => {
  const communityId = isId(req.params.communityId) ? req.params.communityId : '';
  return res.render('pages/public-community', { communityId });
});

router.post('/signup-request', handleSignupRequest);
router.post('/beta-signup', handleSignupRequest);

module.exports = router;
