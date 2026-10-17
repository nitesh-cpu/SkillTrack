const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');
const controller = require('../controllers/authController');
const { rejectUnknownBodyFields, rejectUnknownQueryFields } = require('../middleware/validateRequest');

const router = express.Router();
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 });

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});
router.post('/login', loginLimiter, rejectUnknownQueryFields([]), rejectUnknownBodyFields(['email', 'password', 'role']), controller.loginValidation, controller.login);
router.get('/me', rejectUnknownQueryFields([]), authenticate, controller.me);
router.post('/forgot-password', resetLimiter, rejectUnknownQueryFields([]), rejectUnknownBodyFields(['email']), controller.forgotValidation, controller.forgotPassword);
router.post('/reset-password', resetLimiter, rejectUnknownQueryFields([]), rejectUnknownBodyFields(['token', 'password']), controller.resetValidation, controller.resetPassword);

module.exports = router;
