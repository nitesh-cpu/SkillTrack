const { body, param, query } = require('express-validator');
const questionService = require('../services/questionService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');

const idValidation = [param('id').isMongoId().withMessage('A valid question ID is required.'), validateRequest];
const listValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('topic').optional().trim().isLength({ max: 120 }),
  query('skillId').optional().isMongoId(),
  query('questionType').optional().isIn(['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE']),
  query('difficulty').optional().isIn(['EASY', 'MEDIUM', 'HARD']),
  query('status').optional().isIn(['DRAFT', 'APPROVED', 'ARCHIVED']),
  validateRequest,
];
const questionFields = ['question', 'questionType', 'options', 'correctAnswer', 'explanation', 'topic', 'skillId', 'difficulty', 'marks'];
const questionValidation = [
  body('question').isString().trim().isLength({ min: 5, max: 2000 }),
  body('questionType').isIn(['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE']),
  body('options').optional().isArray({ max: 8 }),
  body('options.*').optional().isString().trim().isLength({ min: 1, max: 500 }),
  body('correctAnswer').isString().trim().isLength({ min: 1, max: 1000 }),
  body('explanation').optional().isString().isLength({ max: 2000 }),
  body('topic').isString().trim().isLength({ min: 1, max: 120 }),
  body('skillId').isMongoId(),
  body('difficulty').isIn(['EASY', 'MEDIUM', 'HARD']),
  body('marks').isFloat({ min: 0.25, max: 100 }).toFloat(),
  validateRequest,
];
const updateValidation = [
  body('question').optional().isString().trim().isLength({ min: 5, max: 2000 }),
  body('questionType').optional().isIn(['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE']),
  body('options').optional().isArray({ max: 8 }),
  body('options.*').optional().isString().trim().isLength({ min: 1, max: 500 }),
  body('correctAnswer').optional().isString().trim().isLength({ min: 1, max: 1000 }),
  body('explanation').optional().isString().isLength({ max: 2000 }),
  body('topic').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('skillId').optional().isMongoId(),
  body('difficulty').optional().isIn(['EASY', 'MEDIUM', 'HARD']),
  body('marks').optional().isFloat({ min: 0.25, max: 100 }).toFloat(),
  validateRequest,
];

const list = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Questions loaded.', await questionService.listQuestions(req.user, {
  ...req.query,
  page: req.query.page ?? 1,
})));
const create = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Question saved as a draft.', {
  question: await questionService.createQuestion(req.user, req.body),
}));
const update = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Question updated.', {
  question: await questionService.updateQuestion(req.user, req.params.id, req.body),
}));
const approve = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Question approved for use in exams.', {
  question: await questionService.approveQuestion(req.user, req.params.id),
}));
const archive = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Question archived.', {
  question: await questionService.archiveQuestion(req.user, req.params.id),
}));

module.exports = {
  archive,
  approve,
  create,
  idValidation,
  list,
  listValidation,
  questionFields,
  questionValidation,
  update,
  updateValidation,
};
