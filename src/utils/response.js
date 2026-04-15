/**
 * Standardised API response helpers
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created successfully') =>
  res.status(201).json({ success: true, message, data });

const error = (res, message = 'An error occurred', statusCode = 400, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const notFound = (res, message = 'Resource not found') =>
  res.status(404).json({ success: false, message });

const unauthorized = (res, message = 'Unauthorized') =>
  res.status(401).json({ success: false, message });

const forbidden = (res, message = 'Forbidden') =>
  res.status(403).json({ success: false, message });

const serverError = (res, err, context = '') => {
  console.error(`❌ Server error${context ? ' in ' + context : ''}:`, err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
  });
};

/**
 * Build paginated response
 */
const paginated = (res, rows, total, page, limit, message = 'Success') =>
  res.status(200).json({
    success: true,
    message,
    data: rows,
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / limit),
    },
  });

module.exports = { success, created, error, notFound, unauthorized, forbidden, serverError, paginated };
