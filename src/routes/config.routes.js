const router = require('express').Router();
const {
  getPassTypes,
  getValidityOptions,
  calculatePassAmount,
  adminCreatePassType,
  adminUpdatePassType,
} = require('../controllers/passTypes.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ── PUBLIC ─────────────────────────────────────────────────────────────
router.get('/pass-types',       getPassTypes);
router.get('/validity-options', getValidityOptions);
router.get('/calculate-amount', calculatePassAmount);

// ── ADMIN PROTECTED ────────────────────────────────────────────────────
router.post('/pass-types',       authenticate, requireAdmin, adminCreatePassType);
router.put ('/pass-types/:id',   authenticate, requireAdmin, adminUpdatePassType);

module.exports = router;
