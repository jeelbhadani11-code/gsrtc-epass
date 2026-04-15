const router = require('express').Router();
const {
  register, login, refresh, logout, getProfile, updateProfile, changePassword,
} = require('../controllers/auth.controller');
const { authenticate, requireUser } = require('../middleware/auth');
const { uploadPhoto, handleUploadError } = require('../middleware/upload');
const {
  registerRules, loginRules, changePasswordRules, validate,
} = require('../middleware/validators');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── PUBLIC ─────────────────────────────────────────────────────────────
router.post('/register', authLimiter, registerRules, validate, register);
router.post('/login',    authLimiter, loginRules,    validate, login);
router.post('/refresh',  refresh);

// ── PROTECTED (user) ───────────────────────────────────────────────────
router.post('/logout',           authenticate, requireUser, logout);
router.get ('/profile',          authenticate, requireUser, getProfile);
router.put ('/profile',          authenticate, requireUser, uploadPhoto, handleUploadError, updateProfile);
router.put ('/change-password',  authenticate, requireUser, changePasswordRules, validate, changePassword);

module.exports = router;
