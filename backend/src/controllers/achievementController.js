const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');
const achievementService = require('../services/achievementService');

const types = achievementService.ACHIEVEMENT_TYPES;
const createValidation = [
  body('type').isIn(types).withMessage(`Type must be one of: ${types.join(', ')}.`),
  body('title').isString().trim().isLength({ min: 2, max: 150 }).withMessage('Title must be between 2 and 150 characters.'),
  body('description').isString().trim().isLength({ min: 5, max: 3000 }).withMessage('Description must be between 5 and 3000 characters.'),
  body('data').optional().isObject().withMessage('Achievement data must be an object.'),
  body('skillMappings').optional().isArray({ max: 20 }).withMessage('Skill mappings must be an array with at most 20 items.'),
  body('skillMappings.*.skillId').if(body('skillMappings').exists()).isMongoId().withMessage('Each mapped skill needs a valid skill ID.'),
  body('skillMappings.*.relevance').if(body('skillMappings').exists()).isFloat({ min: 0, max: 1 }).withMessage('Skill relevance must be between 0 and 1.'),
  body('status').not().exists().withMessage('Achievement status is assigned by the review workflow.'),
  body('reviewedBy').not().exists().withMessage('Reviewer is assigned by the review workflow.'),
  validateRequest,
];
const idValidation = [param('id').isMongoId().withMessage('A valid achievement ID is required.'), validateRequest];

const create = asyncHandler(async (req, res) => {
  const achievement = await achievementService.submitAchievement(req.user, req.body);
  return sendSuccess(res, 201, 'Achievement submitted for mentor review.', { achievement });
});

const mine = asyncHandler(async (req, res) => {
  const options = { ...req.query };
  if (options.page === undefined && (options.limit !== undefined || options.search || options.status || options.type)) options.page = 1;
  return sendSuccess(res, 200, 'Achievements loaded.', await achievementService.listOwnedAchievements(req.user._id, options));
});

const getOne = asyncHandler(async (req, res) => {
  const achievement = await achievementService.getOwnedAchievement(req.user._id, req.params.id);
  return sendSuccess(res, 200, 'Achievement loaded.', { achievement });
});

const remove = asyncHandler(async (req, res) => {
  const achievement = await achievementService.deletePendingAchievement(req.user._id, req.params.id);
  return sendSuccess(res, 200, 'Pending achievement deleted.', { achievement });
});

const verify = asyncHandler(async (req, res) => {
  if (req.body.rejectionReason !== undefined) throw new AppError('A rejection reason is not valid when verifying.', 400);
  const achievement = await achievementService.reviewAchievement({ achievementId: req.params.id, mentor: req.user, status: 'VERIFIED', feedback: req.body.feedback });
  return sendSuccess(res, 200, 'Achievement verified and skill scores recalculated.', { achievement });
});

const reject = asyncHandler(async (req, res) => {
  const achievement = await achievementService.reviewAchievement({ achievementId: req.params.id, mentor: req.user, status: 'REJECTED', rejectionReason: req.body.rejectionReason });
  return sendSuccess(res, 200, 'Achievement rejected with feedback.', { achievement });
});

const verifyValidation = [
  body('feedback').optional().isString().trim().isLength({ max: 1000 }).withMessage('Feedback cannot exceed 1000 characters.'),
  validateRequest,
];

const rejectValidation = [
  body('rejectionReason').isString().trim().isLength({ min: 5, max: 1000 }).withMessage('A helpful rejection reason of 5 to 1000 characters is required.'),
  body('feedback').optional().isString().trim().isLength({ max: 1000 }).withMessage('Feedback cannot exceed 1000 characters.'),
  validateRequest,
];

module.exports = {
  authenticate,
  create,
  createValidation,
  getOne,
  idValidation,
  mine,
  reject,
  rejectValidation,
  remove,
  requireRole,
  verifyValidation,
  verify,
};
