const { body, param, query, validationResult } = require('express-validator');
const { error } = require('../utils/response');

// Run validation and return errors if any
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }
  next();
};

// ── USER AUTH VALIDATORS ──────────────────────────────────────────

const registerRules = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters')
    .matches(/^[A-Za-z\s]+$/).withMessage('Name must contain only letters and spaces'),

  body('mobile')
    .trim().notEmpty().withMessage('Mobile number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim().isEmail().withMessage('Invalid email address')
    .normalizeEmail(),

  body('aadhaar')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .customSanitizer(v => v?.replace(/\s/g, ''))
    .isLength({ min: 12, max: 12 }).withMessage('Aadhaar must be exactly 12 digits')
    .isNumeric().withMessage('Aadhaar must contain only digits'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-zA-Z]/).withMessage('Password must contain at least one letter')
    .matches(/\d/).withMessage('Password must contain at least one number'),
];

const loginRules = [
  body('mobile')
    .trim().notEmpty().withMessage('Mobile number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number'),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[a-zA-Z]/).withMessage('Must contain at least one letter')
    .matches(/\d/).withMessage('Must contain at least one number'),
];

// ── APPLICATION VALIDATORS ────────────────────────────────────────

const applyRules = [
  body('applicantName')
    .trim().notEmpty().withMessage('Applicant name is required')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters'),

  body('passType').trim().notEmpty().withMessage('Pass type is required'),

  body('mobile')
    .trim().notEmpty().withMessage('Mobile is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit mobile number'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim().isEmail().withMessage('Invalid email address'),

  body('fromCity')
    .trim().notEmpty().withMessage('From city is required')
    .isLength({ min: 2 }).withMessage('Enter valid city name'),

  body('toCity')
    .trim().notEmpty().withMessage('To city is required')
    .isLength({ min: 2 }).withMessage('Enter valid city name'),

  body('validity')
    .notEmpty().withMessage('Validity is required')
    .isIn(['1 Month', '3 Months', '6 Months', 'Annual']).withMessage('Invalid validity option'),
];

// ── ADMIN VALIDATORS ─────────────────────────────────────────────

const adminLoginRules = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const reviewRules = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['Approved', 'Rejected']).withMessage('Status must be Approved or Rejected'),
  body('rejectionReason')
    .if(body('status').equals('Rejected'))
    .notEmpty().withMessage('Rejection reason is required when rejecting'),
];

// ── PARAM VALIDATORS ─────────────────────────────────────────────

const appIdParam = [
  param('id').trim().notEmpty().withMessage('Application ID is required'),
];

module.exports = {
  validate,
  registerRules,
  loginRules,
  changePasswordRules,
  applyRules,
  adminLoginRules,
  reviewRules,
  appIdParam,
};
