const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');
const { asyncHandler } = require('../utils/asyncHandler');
const User = require('../models/User');

const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw new AppError('Authentication is required.', 401);

  const config = req.app.locals.config;
  const claims = jwt.verify(match[1], config.jwtSecret, {
    algorithms: ['HS256'],
    audience: config.jwtAudience || 'skilltrack-client',
    issuer: config.jwtIssuer || 'skilltrack-api',
  });
  if (
    !claims.userId
    || !claims.sub
    || claims.sub !== claims.userId
    || !['STUDENT', 'MENTOR', 'ADMIN'].includes(claims.role)
    || !Number.isInteger(claims.authVersion)
  ) {
    throw new AppError('Invalid authentication token.', 401);
  }
  const user = await User.findById(claims.userId).select('_id name email role isActive +authVersion');
  if (!user || !user.isActive) throw new AppError('This account is unavailable.', 401);
  if (claims.role !== user.role || claims.authVersion !== Number(user.authVersion || 0)) {
    throw new AppError('Your account permissions changed. Please sign in again.', 401);
  }

  req.user = user;
  return next();
});

module.exports = { authenticate };
