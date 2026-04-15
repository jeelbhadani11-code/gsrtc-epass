const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
const { unauthorized, forbidden, serverError } = require('../utils/response');
const { query } = require('../config/db');

/**
 * Protect routes — requires a valid user or admin JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) return unauthorized(res, 'Access token required');

    const decoded = verifyAccessToken(token);
    req.user = decoded; // { id, type: 'user'|'admin', role, ... }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
    return serverError(res, err, 'authenticate');
  }
};

/**
 * Restrict to authenticated users only (not admins)
 */
const requireUser = (req, res, next) => {
  if (req.user?.type !== 'user') return forbidden(res, 'User access required');
  next();
};

/**
 * Restrict to authenticated admins only
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.type !== 'admin') return forbidden(res, 'Admin access required');
  next();
};

/**
 * Restrict to superadmin role
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.type !== 'admin' || req.user?.role !== 'superadmin')
    return forbidden(res, 'Superadmin access required');
  next();
};

/**
 * Optional auth — attaches user to req if token present, doesn't block
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (token) req.user = verifyAccessToken(token);
  } catch (_) {}
  next();
};

/**
 * Audit log helper — call after successful actions
 */
const logAudit = async (actorType, actorId, action, targetType = null, targetId = null, meta = null, ip = null) => {
  try {
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, meta, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorType, actorId, action, targetType, targetId, meta ? JSON.stringify(meta) : null, ip]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { authenticate, requireUser, requireAdmin, requireSuperAdmin, optionalAuth, logAudit };
