const express = require('express');
const { param } = require('express-validator');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');
const { getActiveSkill, getSkillGraph, listActiveSkills } = require('../services/skillService');
const { rejectUnknownQueryFields } = require('../middleware/validateRequest');

const router = express.Router();
router.get('/graph', rejectUnknownQueryFields([]), asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill graph loaded.', await getSkillGraph())));
router.get('/', rejectUnknownQueryFields([]), asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skills loaded.', { skills: await listActiveSkills() })));
router.get('/:id', rejectUnknownQueryFields([]), [param('id').isMongoId().withMessage('A valid skill ID is required.'), validateRequest], asyncHandler(async (req, res) => sendSuccess(
  res,
  200,
  'Skill loaded.',
  await getActiveSkill(req.params.id),
)));

module.exports = router;
