const { query } = require('../config/db');
const { success, created, error, notFound, serverError } = require('../utils/response');

// ── GET ALL PASS TYPES (Public) ───────────────────────────────────────
const getPassTypes = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM pass_types WHERE is_active = TRUE ORDER BY name'
    );
    return success(res, result.rows);
  } catch (err) {
    return serverError(res, err, 'getPassTypes');
  }
};

// ── GET ALL VALIDITY OPTIONS (Public) ─────────────────────────────────
const getValidityOptions = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM validity_options WHERE is_active = TRUE ORDER BY months'
    );
    return success(res, result.rows);
  } catch (err) {
    return serverError(res, err, 'getValidityOptions');
  }
};

// ── CALCULATE AMOUNT (Public) ─────────────────────────────────────────
const calculatePassAmount = async (req, res) => {
  try {
    const { passType, validity } = req.query;
    if (!passType || !validity)
      return error(res, 'passType and validity are required', 400);

    const ptRes = await query(
      'SELECT base_amount FROM pass_types WHERE name = $1 AND is_active = TRUE',
      [passType]
    );
    if (!ptRes.rows.length) return notFound(res, 'Pass type not found');

    const voRes = await query(
      'SELECT multiplier FROM validity_options WHERE label = $1 AND is_active = TRUE',
      [validity]
    );
    if (!voRes.rows.length) return notFound(res, 'Validity option not found');

    const baseAmount = parseFloat(ptRes.rows[0].base_amount);
    const multiplier = parseFloat(voRes.rows[0].multiplier);
    const amount     = Math.round(baseAmount * multiplier * 100) / 100;

    return success(res, { passType, validity, baseAmount, multiplier, amount });
  } catch (err) {
    return serverError(res, err, 'calculatePassAmount');
  }
};

// ── ADMIN: CREATE PASS TYPE ────────────────────────────────────────────
const adminCreatePassType = async (req, res) => {
  try {
    const { name, description, baseAmount } = req.body;
    if (!name || baseAmount === undefined) return error(res, 'name and baseAmount are required');

    const result = await query(
      `INSERT INTO pass_types (name, description, base_amount)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || null, parseFloat(baseAmount)]
    );
    return created(res, result.rows[0], 'Pass type created');
  } catch (err) {
    if (err.code === '23505') return error(res, 'Pass type name already exists', 409);
    return serverError(res, err, 'adminCreatePassType');
  }
};

// ── ADMIN: UPDATE PASS TYPE ───────────────────────────────────────────
const adminUpdatePassType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, baseAmount, isActive } = req.body;

    const result = await query(
      `UPDATE pass_types SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         base_amount = COALESCE($3, base_amount),
         is_active = COALESCE($4, is_active)
       WHERE id = $5 RETURNING *`,
      [name || null, description || null, baseAmount ? parseFloat(baseAmount) : null, isActive, id]
    );
    if (!result.rows.length) return notFound(res, 'Pass type not found');
    return success(res, result.rows[0], 'Pass type updated');
  } catch (err) {
    return serverError(res, err, 'adminUpdatePassType');
  }
};

module.exports = {
  getPassTypes,
  getValidityOptions,
  calculatePassAmount,
  adminCreatePassType,
  adminUpdatePassType,
};
