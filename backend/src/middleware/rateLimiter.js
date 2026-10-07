const { AppError } = require('../utils/errors');

function createRateLimiter({ windowMs = 60 * 1000, maxRequests = 10, message = 'Too many requests from this device. Please wait a minute and try again.' } = {}) {
  const requestsMap = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requestsMap.entries()) {
      if (now > record.resetTime) {
        requestsMap.delete(key);
      }
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'] || 'global';
    const now = Date.now();
    const record = requestsMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    requestsMap.set(key, record);

    if (record.count > maxRequests) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.resetTime - now) / 1000))));
      return next(new AppError(message, 429));
    }

    return next();
  };
}

module.exports = { createRateLimiter };
