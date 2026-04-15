const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { success, error, unauthorized, serverError } = require('../utils/response');
const { logAudit } = require('../middleware/auth');

// ── ADMIN LOGIN ───────────────────────────────────────────────────────
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await query(
      'SELECT * FROM admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    if (!result.rows.length) return unauthorized(res, 'Invalid credentials');

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return unauthorized(res, 'Invalid credentials');

    const token   = generateAccessToken({ id: admin.id, type: 'admin', role: admin.role, username: admin.username });
    const refresh = generateRefreshToken({ id: admin.id, type: 'admin' });

    // Store refresh token
    await query(
      `INSERT INTO refresh_tokens (admin_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
      [admin.id, refresh]
    );

    // Update last_login
    await query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    await logAudit('admin', admin.id, 'ADMIN_LOGIN', null, null, { username }, req.ip);

    const { password_hash, ...safeAdmin } = admin;
    return success(res, { admin: safeAdmin, accessToken: token, refreshToken: refresh }, 'Admin login successful');
  } catch (err) {
    return serverError(res, err, 'adminLogin');
  }
};

// ── ADMIN LOGOUT ──────────────────────────────────────────────────────
const adminLogout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
    await logAudit('admin', req.user.id, 'ADMIN_LOGOUT', null, null, null, req.ip);
    return success(res, {}, 'Logged out');
  } catch (err) {
    return serverError(res, err, 'adminLogout');
  }
};

// ── ADMIN REFRESH TOKEN ───────────────────────────────────────────────
const adminRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return unauthorized(res, 'Refresh token required');

    let decoded;
    try { decoded = verifyRefreshToken(refreshToken); }
    catch { return unauthorized(res, 'Invalid or expired refresh token'); }

    const dbToken = await query(
      `SELECT * FROM refresh_tokens WHERE token = $1 AND admin_id = $2 AND expires_at > NOW()`,
      [refreshToken, decoded.id]
    );
    if (!dbToken.rows.length) return unauthorized(res, 'Refresh token revoked');

    const admin = await query('SELECT * FROM admins WHERE id = $1 AND is_active = TRUE', [decoded.id]);
    if (!admin.rows.length) return unauthorized(res, 'Admin not found');

    const a = admin.rows[0];
    const newAccess  = generateAccessToken({ id: a.id, type: 'admin', role: a.role, username: a.username });
    const newRefresh = generateRefreshToken({ id: a.id, type: 'admin' });

    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await query(
      `INSERT INTO refresh_tokens (admin_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
      [a.id, newRefresh]
    );

    return success(res, { accessToken: newAccess, refreshToken: newRefresh }, 'Token refreshed');
  } catch (err) {
    return serverError(res, err, 'adminRefresh');
  }
};

// ── GET AUDIT LOGS (Admin) ─────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countRes = await query(`SELECT COUNT(*) FROM audit_logs`);
    return success(res, {
      logs:       result.rows,
      total:      parseInt(countRes.rows[0].count),
      page, limit,
    });
  } catch (err) {
    return serverError(res, err, 'getAuditLogs');
  }
};

module.exports = { adminLogin, adminLogout, adminRefresh, getAuditLogs };
