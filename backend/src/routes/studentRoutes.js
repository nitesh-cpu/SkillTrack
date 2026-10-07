const express = require('express');
const { param, query } = require('express-validator');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const controller = require('../controllers/studentController');
const { getSkillGraph } = require('../services/skillService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { rejectUnknownBodyFields, rejectUnknownQueryFields, validateRequest } = require('../middleware/validateRequest');

const router = express.Router();
router.use(authenticate, requireRole('STUDENT'));
router.get('/dashboard', rejectUnknownQueryFields([]), controller.dashboard);
router.get('/profile', rejectUnknownQueryFields([]), controller.profile);
router.patch('/profile', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['name', 'email']), controller.updateProfileValidation, controller.updateProfile);
router.get('/progress', rejectUnknownQueryFields([]), controller.progress);
router.get('/recommendations', rejectUnknownQueryFields([]), controller.recommendations);
router.get('/skill-graph', rejectUnknownQueryFields([]), asyncHandler(async (req, res) => sendSuccess(res, 200, 'Personalized skill graph loaded.', await getSkillGraph(req.user._id))));
router.get('/tasks', rejectUnknownQueryFields(['page', 'limit', 'search', 'status']), [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('status').optional().isIn(['PENDING', 'COMPLETED']),
  validateRequest,
], controller.listTasks);
router.patch('/tasks/:id/complete', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.idValidation, controller.completeTask);
router.get('/exams', rejectUnknownQueryFields([]), controller.studentExams);
router.get('/results', rejectUnknownQueryFields(['page', 'limit']), controller.examResultsValidation, controller.studentExamResults);
router.post('/exams/:examId/start', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.startExamValidation, controller.startExam);
router.get('/exam-attempts/:attemptId', rejectUnknownQueryFields([]), controller.attemptIdValidation, controller.getExamAttempt);
router.patch('/exam-attempts/:attemptId/answers', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['questionId', 'answer']), controller.attemptIdValidation, controller.saveExamAnswerValidation, controller.saveExamAnswer);
router.post('/exam-attempts/:attemptId/activity', rejectUnknownQueryFields([]), rejectUnknownBodyFields(['type']), controller.attemptIdValidation, controller.examActivityValidation, controller.recordExamActivity);
router.post('/exam-attempts/:attemptId/submit', rejectUnknownQueryFields([]), rejectUnknownBodyFields([]), controller.attemptIdValidation, controller.submitExamAttempt);

module.exports = router;
