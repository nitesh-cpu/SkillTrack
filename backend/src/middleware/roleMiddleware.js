const { AppError } = require('../utils/errors');

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(new AppError('Authentication is required.', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('You do not have permission to perform this action.', 403));
    return next();
  };
}

module.exports = { requireRole };
