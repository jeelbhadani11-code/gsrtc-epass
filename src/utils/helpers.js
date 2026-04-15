/**
 * Generate a unique GSRTC application ID
 * Format: GP-YYYY-NNNNN
 */
const generateAppId = () => {
  const year   = new Date().getFullYear();
  const random = Math.floor(Math.random() * 90000 + 10000);
  return `GP-${year}-${random}`;
};

/**
 * Mask Aadhaar for display: show only last 4 digits
 */
const maskAadhaar = (aadhaar) => {
  if (!aadhaar) return null;
  const digits = aadhaar.replace(/\s/g, '');
  return 'XXXX XXXX ' + digits.slice(-4);
};

/**
 * Calculate validity dates from submittedAt + validity label
 */
const calculateValidityDates = (submittedAt, validityLabel) => {
  const monthsMap = {
    '1 Month':   1,
    '3 Months':  3,
    '6 Months':  6,
    'Annual':    12,
  };
  const months   = monthsMap[validityLabel] || 1;
  const from     = new Date(submittedAt);
  const until    = new Date(from);
  until.setMonth(until.getMonth() + months);
  return { validFrom: from, validUntil: until };
};

/**
 * Calculate pass amount from base amount and validity multiplier
 */
const VALIDITY_MULTIPLIERS = {
  '1 Month':   1.00,
  '3 Months':  2.75,
  '6 Months':  5.00,
  'Annual':    9.00,
};

const calculateAmount = (baseAmount, validity) => {
  const multiplier = VALIDITY_MULTIPLIERS[validity] || 1;
  return Math.round(baseAmount * multiplier * 100) / 100;
};

/**
 * Sanitise user output — strip sensitive fields
 */
const sanitiseUser = (user) => {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  if (safe.aadhaar) safe.aadhaar = maskAadhaar(safe.aadhaar);
  return safe;
};

/**
 * Parse pagination query params with defaults
 */
const parsePagination = (query, defaultLimit = 20) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, parseInt(query.limit) || defaultLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Format date to Indian locale string
 */
const formatDateIN = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

module.exports = {
  generateAppId,
  maskAadhaar,
  calculateValidityDates,
  calculateAmount,
  sanitiseUser,
  parsePagination,
  formatDateIN,
  VALIDITY_MULTIPLIERS,
};
