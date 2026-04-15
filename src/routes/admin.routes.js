const router = require('express').Router();
const { adminLogin, adminLogout, adminRefresh, getAuditLogs } = require('../controllers/admin.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { adminLoginRules, validate } = require('../middleware/validators');
const rateLimit = require('express-rate-limit');

const adminAuthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many admin login attempts. Please wait 1 minute.' },
});

// ── PUBLIC ─────────────────────────────────────────────────────────────
router.post('/login',   adminAuthLimiter, adminLoginRules, validate, adminLogin);
router.post('/refresh', adminRefresh);

// ── PROTECTED (admin) ──────────────────────────────────────────────────
router.post('/logout',      authenticate, requireAdmin, adminLogout);
router.get ('/audit-logs',  authenticate, requireAdmin, getAuditLogs);

module.exports = router;
