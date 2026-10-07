const { body, param, query } = require('express-validator');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');
const studentService = require('../services/studentService');
const { getRecommendations } = require('../services/recommendationService');
const { getLatestScores } = require('../services/scoringService');
const User = require('../models/User');
const { writeAudit } = require('../middleware/auditMiddleware');
const examAttemptService = require('../services/examAttemptService');

const idValidation = [param('id').isMongoId().withMessage('A valid ID is required.'), validateRequest];

const dashboard = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Student dashboard loaded.', await studentService.getDashboard(req.user)));
const profile = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Student profile loaded.', { user: req.user }));
const progress = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Student progress loaded.', await studentService.getProgress(req.user._id)));
const recommendations = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Recommendations loaded.', await getRecommendations(req.user._id)));

const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
  body('email').optional().trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('role').not().exists().withMessage('Your role cannot be changed.'),
  body('passwordHash').not().exists().withMessage('Password cannot be changed through profile settings.'),
  validateRequest,
];
const updateProfile = asyncHandler(async (req, res) => {
  const updated = await studentService.updateProfile(req.user, { name: req.body.name, email: req.body.email });
  await writeAudit({ actorId: req.user._id, action: 'PROFILE_UPDATED', entity: 'User', entityId: req.user._id, metadata: { fields: Object.keys(req.body) } });
  return sendSuccess(res, 200, 'Profile updated.', { user: updated });
});

const listTasks = asyncHandler(async (req, res) => {
  const options = { ...req.query };
  if (options.page === undefined && (options.limit !== undefined || options.search || options.status)) options.page = 1;
  return sendSuccess(res, 200, 'Student tasks loaded.', await studentService.getStudentTasks(req.user._id, options));
});
const completeTask = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Task completed.', { task: await studentService.completeTask(req.user._id, req.params.id) }));
const studentExams = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Your assigned exams loaded.', {
  exams: await examAttemptService.listStudentExams(req.user._id),
}));
const studentExamResults = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Your exam results loaded.', await examAttemptService.listStudentResults(
  req.user._id,
  { page: req.query.page ?? 1, limit: req.query.limit ?? 25 },
)));
const examResultsValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest,
];
const startExamValidation = [param('examId').isMongoId().withMessage('A valid exam ID is required.'), validateRequest];
const startExam = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Exam attempt started.', {
  attempt: await examAttemptService.startAttempt(req.user._id, req.params.examId),
}));
const attemptIdValidation = [param('attemptId').isMongoId().withMessage('A valid attempt ID is required.'), validateRequest];
const getExamAttempt = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam attempt loaded.', {
  attempt: await examAttemptService.getAttempt(req.user._id, req.params.attemptId),
}));
const saveExamAnswerValidation = [
  body('questionId').isMongoId().withMessage('A valid question ID is required.'),
  body('answer').isString().isLength({ max: 1000 }).withMessage('Answer must be text up to 1000 characters.'),
  validateRequest,
];
const saveExamAnswer = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Answer saved.', {
  attempt: await examAttemptService.saveAnswer(req.user._id, req.params.attemptId, req.body),
}));
const examActivityValidation = [
  body('type').isIn(['TAB_HIDDEN', 'FULLSCREEN_EXITED']).withMessage('Choose a supported exam activity.'),
  validateRequest,
];
const recordExamActivity = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam activity recorded.', {
  activity: await examAttemptService.recordActivity(req.user._id, req.params.attemptId, req.body.type),
}));
const submitExamAttempt = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam attempt submitted.', {
  attempt: await examAttemptService.submitAttempt(req.user._id, req.params.attemptId),
}));

module.exports = {
  completeTask,
  dashboard,
  idValidation,
  listTasks,
  progress,
  profile,
  recommendations,
  studentExams,
  studentExamResults,
  examResultsValidation,
  startExam,
  startExamValidation,
  attemptIdValidation,
  getExamAttempt,
  saveExamAnswer,
  saveExamAnswerValidation,
  examActivityValidation,
  recordExamActivity,
  submitExamAttempt,
  updateProfile,
  updateProfileValidation,
};
