const { body, param } = require('express-validator');
const User = require('../models/User');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');
const authService = require('../services/authService');

const registerValidation = [
  body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
  body('email').isString().trim().isLength({ max: 254 }).isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }).isByteLength({ max: 72 }).withMessage('Password must be 8 to 128 characters and no more than 72 UTF-8 bytes.'),
  validateRequest,
];
const loginValidation = [
  body('email').isString().trim().isLength({ max: 254 }).isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').isString().notEmpty().isByteLength({ max: 72 }).withMessage('Email or password is incorrect.'),
  validateRequest,
];
const forgotValidation = [
  body('email').isString().trim().isLength({ max: 254 }).isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  validateRequest,
];
const resetValidation = [
  body('token').isString().isLength({ min: 64, max: 64 }).isHexadecimal().withMessage('A valid reset token is required.'),
  body('password').isString().isLength({ min: 8, max: 128 }).isByteLength({ max: 72 }).withMessage('Password must be 8 to 128 characters and no more than 72 UTF-8 bytes.'),
  validateRequest,
];

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerStudent({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
  }, req.app.locals.config);
  return sendSuccess(res, 201, 'Student account created.', result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req.app.locals.config);
  return sendSuccess(res, 200, 'Signed in successfully.', result);
});

const me = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Current user loaded.', { user: authService.publicUser(req.user) }));

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.createPasswordReset(req.body, req.app.locals.config);
  return sendSuccess(res, 200, result.message);
});

const resetPassword = asyncHandler(async (req, res) => {
  const user = await authService.resetPassword(req.body);
  return sendSuccess(res, 200, 'Password updated. Please sign in again.', { user });
});

module.exports = {
  forgotPassword,
  forgotValidation,
  login,
  loginValidation,
  me,
  register,
  registerValidation,
  resetPassword,
  resetValidation,
};
