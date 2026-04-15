const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { success, created, error, unauthorized, serverError, notFound } = require('../utils/response');
const { sanitiseUser, maskAadhaar } = require('../utils/helpers');
const { sendEmail } = require('../utils/email');
const { logAudit } = require('../middleware/auth');
const { getFileUrl } = require('../middleware/upload');

// ── REGISTER ─────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, mobile, email, aadhaar, password } = req.body;

    // Check duplicate mobile
    const existing = await query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length)
      return error(res, 'This mobile number is already registered', 409);

    // Check duplicate email
    if (email) {
      const emailExists = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (emailExists.rows.length)
        return error(res, 'This email address is already in use', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (name, mobile, email, aadhaar, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), mobile, email || null, aadhaar || null, passwordHash]
    );

    const user = result.rows[0];
    const token   = generateAccessToken({ id: user.id, type: 'user', mobile: user.mobile });
    const refresh = generateRefreshToken({ id: user.id, type: 'user' });

    // Store refresh token
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refresh]
    );

    await logAudit('user', user.id, 'REGISTER', 'user', user.id, { mobile }, req.ip);

    // Send welcome email (non-blocking)
    if (email) sendEmail(email, 'welcome', user);

    return created(res, {
      user: sanitiseUser(user),
      accessToken: token,
      refreshToken: refresh,
    }, 'Account created successfully');
  } catch (err) {
    return serverError(res, err, 'register');
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    const result = await query('SELECT * FROM users WHERE mobile = $1 AND is_active = TRUE', [mobile]);
    if (!result.rows.length)
      return unauthorized(res, 'Invalid mobile number or password');

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return unauthorized(res, 'Invalid mobile number or password');

    const token   = generateAccessToken({ id: user.id, type: 'user', mobile: user.mobile });
    const refresh = generateRefreshToken({ id: user.id, type: 'user' });

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refresh]
    );

    await logAudit('user', user.id, 'LOGIN', null, null, { mobile }, req.ip);

    return success(res, {
      user: sanitiseUser(user),
      accessToken: token,
      refreshToken: refresh,
    }, 'Login successful');
  } catch (err) {
    return serverError(res, err, 'login');
  }
};

// ── REFRESH TOKEN ─────────────────────────────────────────────────────
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return unauthorized(res, 'Refresh token required');

    // Verify JWT
    let decoded;
    try { decoded = verifyRefreshToken(refreshToken); }
    catch { return unauthorized(res, 'Invalid or expired refresh token'); }

    // Check DB
    const dbToken = await query(
      `SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
      [refreshToken, decoded.id]
    );
    if (!dbToken.rows.length) return unauthorized(res, 'Refresh token revoked or expired');

    const user = await query('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [decoded.id]);
    if (!user.rows.length) return unauthorized(res, 'User not found');

    const newAccess  = generateAccessToken({ id: decoded.id, type: 'user', mobile: user.rows[0].mobile });
    const newRefresh = generateRefreshToken({ id: decoded.id, type: 'user' });

    // Rotate refresh token
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [decoded.id, newRefresh]
    );

    return success(res, { accessToken: newAccess, refreshToken: newRefresh }, 'Token refreshed');
  } catch (err) {
    return serverError(res, err, 'refresh');
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
    await logAudit('user', req.user.id, 'LOGOUT', null, null, null, req.ip);
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    return serverError(res, err, 'logout');
  }
};

// ── GET PROFILE ───────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return notFound(res, 'User not found');
    return success(res, sanitiseUser(result.rows[0]));
  } catch (err) {
    return serverError(res, err, 'getProfile');
  }
};

// ── UPDATE PROFILE ────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = [];
    const values  = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (email !== undefined) {
      if (email) {
        const emailExists = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
        if (emailExists.rows.length) return error(res, 'Email already in use', 409);
      }
      updates.push(`email = $${idx++}`);
      values.push(email || null);
    }
    if (req.file) {
      updates.push(`photo_url = $${idx++}`);
      values.push(getFileUrl(req.file.path));
    }

    if (!updates.length) return error(res, 'No fields to update');

    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    await logAudit('user', req.user.id, 'UPDATE_PROFILE', 'user', req.user.id, { fields: updates }, req.ip);
    return success(res, sanitiseUser(result.rows[0]), 'Profile updated');
  } catch (err) {
    return serverError(res, err, 'updateProfile');
  }
};

// ── CHANGE PASSWORD ───────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user   = result.rows[0];

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return error(res, 'Current password is incorrect', 400);

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    // Revoke all refresh tokens for security
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
    await logAudit('user', req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, null, req.ip);

    return success(res, {}, 'Password changed successfully. Please log in again.');
  } catch (err) {
    return serverError(res, err, 'changePassword');
  }
};

module.exports = { register, login, refresh, logout, getProfile, updateProfile, changePassword };
