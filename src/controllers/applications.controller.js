const { query, getClient } = require('../config/db');
const {
  success, created, error, notFound, serverError, paginated,
} = require('../utils/response');
const {
  generateAppId, calculateValidityDates, calculateAmount, parsePagination,
} = require('../utils/helpers');
const { sendEmail } = require('../utils/email');
const { logAudit } = require('../middleware/auth');
const { getFileUrl } = require('../middleware/upload');

// ── SUBMIT APPLICATION (User) ─────────────────────────────────────────
const submitApplication = async (req, res) => {
  try {
    const {
      applicantName, passType, mobile, email, collegeOrg,
      fromCity, toCity, validity,
    } = req.body;

    // Fetch base amount from pass_types
    const ptRes = await query(
      'SELECT base_amount FROM pass_types WHERE name = $1 AND is_active = TRUE',
      [passType]
    );
    if (!ptRes.rows.length) return error(res, 'Invalid pass type', 400);

    const baseAmount = parseFloat(ptRes.rows[0].base_amount);
    const amount     = calculateAmount(baseAmount, validity);

    // Generate unique ID (retry on collision)
    let appId;
    for (let i = 0; i < 5; i++) {
      appId = generateAppId();
      const exists = await query('SELECT id FROM applications WHERE id = $1', [appId]);
      if (!exists.rows.length) break;
    }

    const photoUrl    = req.files?.photo?.[0]    ? getFileUrl(req.files.photo[0].path)    : null;
    const documentUrl = req.files?.document?.[0] ? getFileUrl(req.files.document[0].path) : null;

    const result = await query(
      `INSERT INTO applications
        (id, user_id, applicant_name, pass_type, mobile, email, college_org,
         from_city, to_city, validity, amount, photo_url, document_url, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        appId, req.user.id, applicantName.trim(), passType, mobile,
        email || null, collegeOrg?.trim() || null,
        fromCity.trim(), toCity.trim(), validity, amount, photoUrl, documentUrl, 'Unpaid'
      ]
    );

    const app = result.rows[0];

    await logAudit('user', req.user.id, 'SUBMIT_APPLICATION', 'application', appId, { passType, validity }, req.ip);

    // Send confirmation email
    const userRes = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const userEmail = email || userRes.rows[0]?.email;
    if (userEmail) sendEmail(userEmail, 'applicationSubmitted', app);

    return created(res, app, `Application submitted. Your ID is ${appId}`);
  } catch (err) {
    return serverError(res, err, 'submitApplication');
  }
};

// ── GET MY APPLICATIONS (User) ────────────────────────────────────────
const getMyApplications = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { status } = req.query;

    let sql    = `SELECT * FROM applications WHERE user_id = $1`;
    const vals = [req.user.id];
    let idx    = 2;

    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      sql += ` AND status = $${idx++}`;
      vals.push(status);
    }

    const countRes = await query(sql.replace('SELECT *', 'SELECT COUNT(*)'), vals);
    sql += ` ORDER BY submitted_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    vals.push(limit, offset);

    const result = await query(sql, vals);
    return paginated(res, result.rows, parseInt(countRes.rows[0].count), page, limit);
  } catch (err) {
    return serverError(res, err, 'getMyApplications');
  }
};

// ── GET SINGLE APPLICATION (User — own only) ──────────────────────────
const getApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT * FROM applications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (!result.rows.length) return notFound(res, 'Application not found');
    return success(res, result.rows[0]);
  } catch (err) {
    return serverError(res, err, 'getApplication');
  }
};

// ── TRACK APPLICATION (Public — by app ID) ────────────────────────────
const trackApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, applicant_name, pass_type, from_city, to_city, validity,
              amount, status, rejection_reason, submitted_at, reviewed_at,
              valid_from, valid_until, payment_status, payment_txn_id
       FROM applications WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return notFound(res, 'No application found with this ID');
    return success(res, result.rows[0]);
  } catch (err) {
    return serverError(res, err, 'trackApplication');
  }
};

// ── GET APPROVED PASSES FOR DOWNLOAD (User) ───────────────────────────
const getDownloadablePasses = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM applications WHERE user_id = $1 AND status = 'Approved' ORDER BY reviewed_at DESC`,
      [req.user.id]
    );
    return success(res, result.rows);
  } catch (err) {
    return serverError(res, err, 'getDownloadablePasses');
  }
};

// ══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ══════════════════════════════════════════════════════════════

// ── GET ALL APPLICATIONS (Admin) ──────────────────────────────────────
const adminGetApplications = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 15);
    const { status, search, from, to, passType } = req.query;

    let sql = `
      SELECT a.*, u.name as user_name, u.mobile as user_mobile, u.email as user_email
      FROM applications a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const vals = [];
    let idx = 1;

    if (status && status !== 'All') { sql += ` AND a.status = $${idx++}`; vals.push(status); }
    if (passType)                   { sql += ` AND a.pass_type = $${idx++}`; vals.push(passType); }
    if (from)                       { sql += ` AND a.submitted_at >= $${idx++}`; vals.push(from); }
    if (to)                         { sql += ` AND a.submitted_at <= $${idx++} + INTERVAL '1 day'`; vals.push(to); }
    if (search) {
      sql += ` AND (a.applicant_name ILIKE $${idx} OR a.id ILIKE $${idx} OR a.mobile ILIKE $${idx} OR u.name ILIKE $${idx})`;
      vals.push(`%${search}%`); idx++;
    }

    const countRes = await query(sql.replace(/SELECT a\.\*.*FROM/, 'SELECT COUNT(*) FROM'), vals);
    sql += ` ORDER BY a.submitted_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    vals.push(limit, offset);

    const result = await query(sql, vals);
    return paginated(res, result.rows, parseInt(countRes.rows[0].count), page, limit);
  } catch (err) {
    return serverError(res, err, 'adminGetApplications');
  }
};

// ── REVIEW APPLICATION (Admin: Approve / Reject) ──────────────────────
const reviewApplication = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const appRes = await client.query('SELECT * FROM applications WHERE id = $1', [id]);
    if (!appRes.rows.length) { await client.query('ROLLBACK'); return notFound(res, 'Application not found'); }

    const app = appRes.rows[0];
    if (app.status !== 'Pending') {
      await client.query('ROLLBACK');
      return error(res, `Application is already ${app.status}`, 409);
    }

    let validFrom = null, validUntil = null;

    if (status === 'Approved') {
      const { validFrom: vf, validUntil: vu } = calculateValidityDates(new Date(), app.validity);
      validFrom  = vf;
      validUntil = vu;
    }

    const result = await client.query(
      `UPDATE applications SET
         status = $1, rejection_reason = $2, reviewed_by = $3,
         reviewed_at = NOW(), valid_from = $4, valid_until = $5,
         pass_issued_at = $6
       WHERE id = $7 RETURNING *`,
      [
        status,
        status === 'Rejected' ? rejectionReason : null,
        req.user.id,
        validFrom,
        validUntil,
        status === 'Approved' ? new Date() : null,
        id,
      ]
    );

    await client.query('COMMIT');
    const updated = result.rows[0];

    await logAudit('admin', req.user.id, `APPLICATION_${status.toUpperCase()}`, 'application', id, { rejectionReason }, req.ip);

    // Send notification email
    const userRes = await query('SELECT email FROM users WHERE id = $1', [app.user_id]);
    const userEmail = updated.email || userRes.rows[0]?.email;
    if (userEmail) {
      const tpl = status === 'Approved' ? 'applicationApproved' : 'applicationRejected';
      sendEmail(userEmail, tpl, updated);
    }

    return success(res, updated, `Application ${status.toLowerCase()} successfully`);
  } catch (err) {
    await client.query('ROLLBACK');
    return serverError(res, err, 'reviewApplication');
  } finally {
    client.release();
  }
};

// ── ADMIN STATS DASHBOARD ─────────────────────────────────────────────
const adminStats = async (req, res) => {
  try {
    const [totals, byStatus, byType, byMonth, recent, topRoutes, totalUsers] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'Approved' THEN amount ELSE 0 END) as revenue
        FROM applications
      `),
      query(`SELECT status, COUNT(*) as count FROM applications GROUP BY status`),
      query(`SELECT pass_type, COUNT(*) as count FROM applications GROUP BY pass_type ORDER BY count DESC`),
      query(`
        SELECT TO_CHAR(DATE_TRUNC('month', submitted_at), 'Mon YY') as month,
               COUNT(*) as count, SUM(amount) as revenue
        FROM applications
        WHERE submitted_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', submitted_at)
        ORDER BY DATE_TRUNC('month', submitted_at)
      `),
      query(`
        SELECT a.*, u.name as user_name
        FROM applications a JOIN users u ON a.user_id = u.id
        ORDER BY a.submitted_at DESC LIMIT 5
      `),
      query(`
        SELECT from_city || ' → ' || to_city as route, COUNT(*) as count
        FROM applications
        GROUP BY from_city, to_city
        ORDER BY count DESC
        LIMIT 6
      `),
      query(`SELECT COUNT(*) as total FROM users`),
    ]);

    const statusMap = {};
    byStatus.rows.forEach(r => { statusMap[r.status] = parseInt(r.count); });

    return success(res, {
      overview: {
        totalApplications: parseInt(totals.rows[0].total),
        totalRevenue:      parseFloat(totals.rows[0].revenue || 0),
        totalUsers:        parseInt(totalUsers.rows[0].total),
        pending:           statusMap.Pending  || 0,
        approved:          statusMap.Approved || 0,
        rejected:          statusMap.Rejected || 0,
      },
      byPassType:    byType.rows,
      byMonth:       byMonth.rows,
      topRoutes:     topRoutes.rows,
      recentApps:    recent.rows,
    });
  } catch (err) {
    return serverError(res, err, 'adminStats');
  }
};

// ── GET ALL USERS (Admin) ─────────────────────────────────────────────
const adminGetUsers = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 20);
    const { search } = req.query;

    let sql = `
      SELECT u.id, u.name, u.mobile, u.email, u.is_active, u.created_at,
             u.aadhaar,
             COUNT(a.id) as app_count
      FROM users u LEFT JOIN applications a ON a.user_id = u.id
      WHERE 1=1
    `;
    const vals = [];
    let idx = 1;

    if (search) {
      sql += ` AND (u.name ILIKE $${idx} OR u.mobile ILIKE $${idx} OR u.email ILIKE $${idx})`;
      vals.push(`%${search}%`); idx++;
    }

    sql += ` GROUP BY u.id ORDER BY u.created_at DESC`;
    const countRes = await query(
      `SELECT COUNT(*) FROM users u WHERE 1=1${search ? ` AND (u.name ILIKE $1 OR u.mobile ILIKE $1 OR u.email ILIKE $1)` : ''}`,
      search ? [`%${search}%`] : []
    );

    sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
    vals.push(limit, offset);

    const result = await query(sql, vals);
    return paginated(res, result.rows, parseInt(countRes.rows[0].count), page, limit);
  } catch (err) {
    return serverError(res, err, 'adminGetUsers');
  }
};

// ── TOGGLE USER ACTIVE (Admin) ────────────────────────────────────────
const toggleUserActive = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await query(
      `UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active`,
      [userId]
    );
    if (!result.rows.length) return notFound(res, 'User not found');
    const u = result.rows[0];
    await logAudit('admin', req.user.id, u.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', userId, null, req.ip);
    return success(res, u, `User ${u.is_active ? 'activated' : 'deactivated'}`);
  } catch (err) {
    return serverError(res, err, 'toggleUserActive');
  }
};

// ── PROCESS PAYMENT (Mock Gateway) ────────────────────────────────────
const processPayment = async (req, res) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { cardNumber } = req.body;

    await client.query('BEGIN');
    const appRes = await client.query('SELECT * FROM applications WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!appRes.rows.length) { await client.query('ROLLBACK'); return notFound(res, 'Application not found'); }

    const app = appRes.rows[0];
    if (app.payment_status === 'Paid') {
      await client.query('ROLLBACK');
      return error(res, 'Application is already paid', 400);
    }

    const mockTxnId = 'TXN_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const result = await client.query(
      `UPDATE applications SET payment_status = 'Paid', payment_txn_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [mockTxnId, id]
    );

    await client.query('COMMIT');
    const updated = result.rows[0];

    await logAudit('user', req.user.id, 'PAYMENT_SUCCESSFUL', 'application', id, { txnId: mockTxnId, amount: updated.amount }, req.ip);

    return success(res, updated, 'Payment processed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    return serverError(res, err, 'processPayment');
  } finally {
    client.release();
  }
};

module.exports = {
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
};
