const { body, param, query } = require('express-validator');
const examService = require('../services/examService');
const examAttemptService = require('../services/examAttemptService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');

const idValidation = [param('id').isMongoId().withMessage('A valid exam ID is required.'), validateRequest];
const studentIdValidation = [param('studentId').isMongoId().withMessage('A valid student ID is required.'), validateRequest];
const listValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('status').optional().isIn(['PUBLISHED', 'ARCHIVED']),
  validateRequest,
];
const examFields = ['title', 'description', 'durationMinutes', 'passingMarks', 'startAt', 'endAt', 'difficulty', 'selectionMode', 'questionIds', 'randomCriteria', 'security'];
const createValidation = [
  body('title').isString().trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('durationMinutes').isInt({ min: 1, max: 360 }).toInt(),
  body('passingMarks').isFloat({ min: 0, max: 10000 }).toFloat(),
  body('startAt').isISO8601().toDate(),
  body('endAt').isISO8601().toDate(),
  body('difficulty').optional().isIn(['EASY', 'MEDIUM', 'HARD', 'MIXED']),
  body('selectionMode').isIn(['MANUAL', 'RANDOM']),
  body('questionIds').optional().isArray({ min: 1, max: 100 }),
  body('questionIds.*').optional().isMongoId(),
  body('randomCriteria').optional().isObject().custom(value => Object.keys(value).every(key => ['count', 'topic', 'skillId', 'difficulty'].includes(key)))
    .withMessage('Random selection contains unsupported filters.'),
  body('randomCriteria.count').optional().isInt({ min: 1, max: 100 }).toInt(),
  body('randomCriteria.topic').optional().isString().trim().isLength({ max: 120 }),
  body('randomCriteria.skillId').optional().isMongoId(),
  body('randomCriteria.difficulty').optional().isIn(['EASY', 'MEDIUM', 'HARD']),
  body('security').optional().isObject().custom(value => Object.keys(value).every(key => ['requireFullscreen', 'requireCamera', 'requireMicrophone', 'maxViolations', 'violationAction'].includes(key))),
  body('security.requireFullscreen').optional().isBoolean().toBoolean(),
  body('security.requireCamera').optional().isBoolean().toBoolean(),
  body('security.requireMicrophone').optional().isBoolean().toBoolean(),
  body('security.maxViolations').optional().isInt({ min: 1, max: 10 }).toInt(),
  body('security.violationAction').optional().isIn(['AUTO_SUBMIT', 'REVIEW']),
  validateRequest,
];
const assignmentValidation = [
  body('studentIds').isArray({ min: 1, max: 500 }),
  body('studentIds.*').isMongoId(),
  validateRequest,
];
const resultQueryValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest,
];

const list = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exams loaded.', await examService.listExams(req.user, {
  ...req.query,
  page: req.query.page ?? 1,
})));
const results = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam results loaded.', await examAttemptService.listResults(
  req.user,
  { page: req.query.page ?? 1, limit: req.query.limit ?? 25 },
)));
const create = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Exam created and published.', {
  exam: await examService.createExam(req.user, req.body),
}));
const details = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam details loaded.', {
  exam: await examService.getExam(req.user, req.params.id),
}));
const assign = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam assignment updated.', await examService.assignExam(
  req.user,
  req.params.id,
  req.body.studentIds,
)));
const archive = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam archived.', {
  exam: await examService.archiveExam(req.user, req.params.id),
}));
const revokeAssignment = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam assignment revoked.', {
  assignment: await examService.revokeExamAssignment(req.user, req.params.id, req.params.studentId),
}));
const deleteExam = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Exam deleted.', {
  exam: await examService.deleteExam(req.user, req.params.id),
}));

module.exports = { archive, assign, assignmentValidation, create, createValidation, deleteExam, details, examFields, idValidation, list, listValidation, results, resultQueryValidation, revokeAssignment, studentIdValidation };
