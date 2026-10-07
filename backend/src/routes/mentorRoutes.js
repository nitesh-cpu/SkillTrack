const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const controller = require('../controllers/mentorController');
const { body, query } = require('express-validator');
const { rejectUnknownBodyFields, rejectUnknownQueryFields, validateRequest } = require('../middleware/validateRequest');

const router = express.Router();
router.use(authenticate, requireRole('MENTOR'));
router.get('/dashboard', rejectUnknownQueryFields([]), controller.dashboard);
const listQuery = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  validateRequest,
];
const taskQuery = [
  ...listQuery,
  query('status').optional().isIn(['PENDING', 'COMPLETED']),
  validateRequest,
];
router.get('/students', rejectUnknownQueryFields(['page', 'limit', 'search']), listQuery, controller.students);
router.get('/students/:id', rejectUnknownQueryFields([]), controller.idValidation, controller.studentDetail);
router.get('/reviews', rejectUnknownQueryFields(['page', 'limit', 'search']), listQuery, controller.pendingReviews);
router.get('/reviews/history', rejectUnknownQueryFields(['page', 'limit', 'search']), listQuery, controller.reviewed);
router.get('/reviews/:id', rejectUnknownQueryFields([]), controller.idValidation, controller.reviewDetails);
router.patch('/reviews/:id/verify', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['feedback']), controller.idValidation, controller.verifyValidation, controller.verify);
router.patch('/reviews/:id/reject', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['rejectionReason', 'feedback']), controller.idValidation, controller.rejectValidation, controller.reject);
router.get('/tasks', rejectUnknownQueryFields(['page', 'limit', 'search', 'status']), taskQuery, controller.tasks);
router.post('/tasks', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['studentId', 'title', 'description', 'skillId', 'priority', 'deadline']), controller.createTaskValidation, controller.assignTask);
router.get('/tasks/:taskId', rejectUnknownQueryFields([]), controller.taskIdValidation, controller.taskDetails);
router.patch('/tasks/:taskId', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['title', 'description', 'skillId', 'priority', 'deadline']), controller.taskIdValidation, controller.updateTaskValidation, controller.updateTask);
router.delete('/tasks/:taskId', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.taskIdValidation, controller.cancelTask);
router.post('/tasks/:taskId/feedback', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['feedback']), controller.taskIdValidation, controller.addTaskFeedbackValidation, controller.addTaskFeedback);

module.exports = router;
