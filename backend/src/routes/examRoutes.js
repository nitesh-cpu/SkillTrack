const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { rejectUnknownBodyFields, rejectUnknownQueryFields } = require('../middleware/validateRequest');
const controller = require('../controllers/examController');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN', 'MENTOR'));
router.get('/', rejectUnknownQueryFields(['page', 'limit', 'search', 'status']), controller.listValidation, controller.list);
router.post('/', rejectUnknownQueryFields([]), rejectUnknownBodyFields(controller.examFields), controller.createValidation, controller.create);
router.get('/results', rejectUnknownQueryFields(['page', 'limit']), controller.resultQueryValidation, controller.results);
router.get('/:id', rejectUnknownQueryFields([]), controller.idValidation, controller.details);
router.post('/:id/assignments', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['studentIds']), controller.idValidation, controller.assignmentValidation, controller.assign);
router.patch('/:id/archive', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.idValidation, controller.archive);

module.exports = router;
