const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

function rejectUnknownBodyFields(allowedFields = []) {
  const allowed = new Set(allowedFields);
  return function validateBodyShape(req, res, next) {
    const body = req.body;
    if (body === undefined) return next();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return next(new AppError('Request body must be a JSON object.', 400));
    }
    if (Object.keys(body).some(field => !allowed.has(field))) {
      return next(new AppError('Request contains unsupported fields.', 400));
    }
    return next();
  };
}

function rejectUnknownQueryFields(allowedFields = []) {
  const allowed = new Set(allowedFields);
  return function validateQueryShape(req, res, next) {
    if (Object.keys(req.query).some(field => !allowed.has(field))) {
      return next(new AppError('Request contains unsupported query parameters.', 400));
    }
    return next();
  };
}

function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const message = result.array().map(error => error.msg).join(' ');
    return next(new AppError(message, 400));
  }
  return next();
}

module.exports = { rejectUnknownBodyFields, rejectUnknownQueryFields, validateRequest };
