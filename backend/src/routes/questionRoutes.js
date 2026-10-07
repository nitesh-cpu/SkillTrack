const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { rejectUnknownBodyFields, rejectUnknownQueryFields } = require('../middleware/validateRequest');
const controller = require('../controllers/questionController');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN', 'MENTOR'));
router.get('/', rejectUnknownQueryFields(['page', 'limit', 'search', 'topic', 'skillId', 'questionType', 'difficulty', 'status']), controller.listValidation, controller.list);
router.post('/', rejectUnknownQueryFields([]), rejectUnknownBodyFields(controller.questionFields), controller.questionValidation, controller.create);
router.patch('/:id', rejectUnknownQueryFields([]), rejectUnknownBodyFields(controller.questionFields), controller.idValidation, controller.updateValidation, controller.update);
router.patch('/:id/approve', requireRole('ADMIN'), rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.idValidation, controller.approve);
router.patch('/:id/archive', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.idValidation, controller.archive);

module.exports = router;
