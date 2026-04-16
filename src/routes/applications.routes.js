const router = require('express').Router();
const {
  submitApplication,
  getMyApplications,
  getApplication,
  trackApplication,
  getDownloadablePasses,
  adminGetApplications,
  reviewApplication,
  adminStats,
  adminGetUsers,
  toggleUserActive,
  processPayment,
  deleteApplication,
} = require('../controllers/applications.controller');
const { downloadPass } = require('../controllers/pass.controller');
const { authenticate, requireUser, requireAdmin } = require('../middleware/auth');
const { uploadBoth, handleUploadError, processUploads } = require('../middleware/upload');
const { applyRules, reviewRules, appIdParam, validate } = require('../middleware/validators');

// ── PUBLIC ─────────────────────────────────────────────────────────────
// Track an application by ID (no auth needed)
router.get('/track/:id', trackApplication);

// ── USER PROTECTED ─────────────────────────────────────────────────────
// Submit a new application
router.post(
  '/',
  authenticate, requireUser,
  uploadBoth, handleUploadError,
  processUploads,
  applyRules, validate,
  submitApplication
);

// Get logged-in user's applications
router.get('/my',         authenticate, requireUser, getMyApplications);
router.get('/downloads',  authenticate, requireUser, getDownloadablePasses);
router.get('/my/downloads', authenticate, requireUser, getDownloadablePasses);

// Get single application (owner only)
router.get('/:id', authenticate, requireUser, appIdParam, validate, getApplication);

// Process payment via mock gateway
router.post('/:id/pay', authenticate, requireUser, appIdParam, validate, processPayment);

// Download approved pass (user = own only, admin = any)
router.get('/:appId/download', authenticate, downloadPass);

// ── ADMIN PROTECTED ────────────────────────────────────────────────────
// Admin: list all applications with filters + pagination
router.get('/admin/all',   authenticate, requireAdmin, adminGetApplications);
router.get('/admin',       authenticate, requireAdmin, adminGetApplications);

// Admin: dashboard stats
router.get('/admin/stats', authenticate, requireAdmin, adminStats);

// Admin: all users
router.get('/admin/users',              authenticate, requireAdmin, adminGetUsers);
router.patch('/admin/users/:userId/toggle', authenticate, requireAdmin, toggleUserActive);

// Admin: review (approve / reject) an application
router.patch('/admin/:id/review', authenticate, requireAdmin, reviewRules, validate, reviewApplication);

// Admin: delete an application
router.delete('/admin/:id', authenticate, requireAdmin, deleteApplication);

module.exports = router;
