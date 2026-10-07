const express = require('express');
const controller = require('../controllers/achievementController');
const { ACHIEVEMENT_TYPES } = require('../services/achievementService');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { body, query } = require('express-validator');
const { rejectUnknownBodyFields, rejectUnknownQueryFields, validateRequest } = require('../middleware/validateRequest');

const router = express.Router();
router.use(authenticate);
router.post('/', requireRole('STUDENT'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['type', 'title', 'description', 'data', 'skillMappings']), controller.createValidation, controller.create);
router.get('/my', requireRole('STUDENT'), rejectUnknownQueryFields(['page', 'limit', 'search', 'type', 'status']), [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('type').optional().isIn(ACHIEVEMENT_TYPES),
  query('status').optional().isIn(['PENDING', 'VERIFIED', 'REJECTED']),
  validateRequest,
], controller.mine);
router.get('/:id', requireRole('STUDENT'), rejectUnknownQueryFields([]), controller.idValidation, controller.getOne);
router.delete('/:id', requireRole('STUDENT'), rejectUnknownQueryFields([]), controller.idValidation, controller.remove);
router.patch('/:id/verify', requireRole('MENTOR', 'ADMIN'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['feedback', 'rejectionReason']), controller.idValidation, controller.verifyValidation, controller.verify);
router.patch('/:id/reject', requireRole('MENTOR', 'ADMIN'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['feedback', 'rejectionReason']), controller.idValidation, body('rejectionReason').isString().trim().isLength({ min: 5, max: 1000 }).withMessage('A helpful rejection reason of 5 to 1000 characters is required.'), validateRequest, controller.reject);

module.exports = router;
