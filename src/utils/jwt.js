const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_SECRET || 'fallback_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Generate an access token for a user or admin
 * @param {object} payload  - { id, role, type: 'user'|'admin' }
 */
const generateAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });

/**
 * Generate a long-lived refresh token
 */
const generateRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });

/**
 * Verify an access token — returns decoded or throws
 */
const verifyAccessToken = (token) =>
  jwt.verify(token, ACCESS_SECRET);

/**
 * Verify a refresh token — returns decoded or throws
 */
const verifyRefreshToken = (token) =>
  jwt.verify(token, REFRESH_SECRET);

/**
 * Extract token from 'Authorization: Bearer <token>' header
 */
const extractBearerToken = (req) => {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
};
