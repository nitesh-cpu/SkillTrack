const { AppError } = require('../utils/errors');

function notFoundHandler(req, res, next) {
  next(new AppError('Requested endpoint was not found.', 404));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let safeMessage;
  let statusCode;
  if (error.name === 'ValidationError') {
    statusCode = 400;
    safeMessage = 'Request data is invalid.';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    safeMessage = 'Invalid resource ID.';
  } else if (error.code === 11000) {
    statusCode = 409;
    safeMessage = 'A record with this value already exists.';
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    safeMessage = 'Request body must contain valid JSON.';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413;
    safeMessage = 'Request body is too large.';
  } else if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
    statusCode = 415;
    safeMessage = 'Request encoding is not supported.';
  }
  if (safeMessage) return res.status(statusCode).json({
    success: false,
    message: safeMessage,
    requestId: req.requestId,
  });
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.', requestId: req.requestId });
  }
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Your session is invalid. Please sign in again.', requestId: req.requestId });
  }
  statusCode = error instanceof AppError ? error.statusCode : 500;
  if (statusCode >= 500) {
    if (req.app.locals.config.nodeEnv !== 'test') {
      console.error(JSON.stringify({
        level: 'error',
        event: 'api_error',
        requestId: req.requestId,
        name: error.name || 'Error',
        code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined,
        method: req.method,
        path: req.path,
        statusCode,
      }));
    }
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'An unexpected server error occurred.' : error.message,
    requestId: req.requestId,
  });
}

module.exports = { errorHandler, notFoundHandler };
