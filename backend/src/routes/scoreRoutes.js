const express = require('express');
const { param } = require('express-validator');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const { getLatestScores, getSkillHistory, getSkillScore } = require('../services/scoringService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { rejectUnknownQueryFields } = require('../middleware/validateRequest');

const router = express.Router();
router.use(authenticate, requireRole('STUDENT'));
router.get('/me', rejectUnknownQueryFields([]), asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill scores loaded.', { scores: await getLatestScores(req.user._id) })));
router.get('/me/:skillId/history', rejectUnknownQueryFields([]), [param('skillId').isMongoId().withMessage('A valid skill ID is required.'), validateRequest], asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill score history loaded.', { history: await getSkillHistory(req.user._id, req.params.skillId) })));
router.get('/me/:skillId', rejectUnknownQueryFields([]), [param('skillId').isMongoId().withMessage('A valid skill ID is required.'), validateRequest], asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill score loaded.', await getSkillScore(req.user._id, req.params.skillId))));

module.exports = router;
