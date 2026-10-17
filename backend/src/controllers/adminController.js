const { body, param, query } = require('express-validator');
const Achievement = require('../models/Achievement');
const MentorStudent = require('../models/MentorStudent');
const ScoringRule = require('../models/ScoringRule');
const SkillPrerequisite = require('../models/SkillPrerequisite');
const Task = require('../models/Task');
const User = require('../models/User');
const adminService = require('../services/adminService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');
const { AppError } = require('../utils/errors');

const idValidation = [param('id').isMongoId().withMessage('A valid ID is required.'), validateRequest];
const mentorValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
  body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }).withMessage('Initial password must be between 8 and 128 characters.'),
  body('batch').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Batch name cannot exceed 100 characters.'),
  validateRequest,
];
const createUserValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
  body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }).withMessage('Initial password must be between 8 and 128 characters.'),
  body('role').isIn(['ADMIN', 'STUDENT', 'MENTOR']).withMessage('A valid account role is required.'),
  body('batch').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Batch name cannot exceed 100 characters.'),
  validateRequest,
];
const updateUserValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('role').optional().isIn(['ADMIN', 'STUDENT', 'MENTOR']).withMessage('A valid account role is required.'),
  body('batch').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Batch name cannot exceed 100 characters.'),
  body('passwordHash').not().exists().withMessage('Password hashes cannot be changed here.'),
  validateRequest,
];
const skillValidation = [
  body('name').isString().trim().isLength({ min: 1, max: 80 }).withMessage('Skill name is required.'),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('category').isString().trim().isLength({ min: 1, max: 80 }).withMessage('Skill category is required.'),
  validateRequest,
];
const updateSkillValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('category').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('isActive').optional().isBoolean().toBoolean(),
  validateRequest,
];
const relationshipValidation = [
  body('skillId').isMongoId().withMessage('A valid skill ID is required.'),
  body('prerequisiteSkillId').isMongoId().withMessage('A valid prerequisite skill ID is required.'),
  validateRequest,
];
const assignmentValidation = [
  body('mentorId').isMongoId().withMessage('A valid mentor ID is required.'),
  body('studentId').isMongoId().withMessage('A valid student ID is required.'),
  validateRequest,
];
const userQueryValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('role').optional().isIn(['ADMIN', 'STUDENT', 'MENTOR']),
  query('isActive').optional().isBoolean().toBoolean(),
  validateRequest,
];
const auditQueryValidation = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('action').optional().trim().isLength({ min: 1, max: 100 }),
  query('search').optional().trim().isLength({ max: 100 }),
  validateRequest,
];
const recalculateValidation = [
  body('userId').optional().isMongoId().withMessage('A valid student ID is required.'),
  validateRequest,
];

const dashboard = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Admin dashboard loaded.', await adminService.getDashboard()));
const users = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Users loaded.', await adminService.listUsersPage({
  page: req.query.page || 1,
  limit: req.query.limit || 25,
  search: req.query.search,
  role: req.query.role,
  isActive: req.query.isActive,
})));
const createUser = asyncHandler(async (req, res) => {
  const user = await adminService.createUser(req.body, req.user._id);
  return sendSuccess(res, 201, 'User created. Share the initial password securely.', { user });
});
const updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(req.params.id, req.body, req.user._id);
  return sendSuccess(res, 200, 'User updated.', { user });
});
const mentors = asyncHandler(async (req, res) => {
  const directory = await adminService.getUserDirectory();
  return sendSuccess(res, 200, 'Mentors loaded.', { mentors: directory.mentors });
});
const students = asyncHandler(async (req, res) => {
  const directory = await adminService.getUserDirectory();
  return sendSuccess(res, 200, 'Students loaded.', { students: directory.students });
});
const createMentor = asyncHandler(async (req, res) => {
  const user = await adminService.createUser({ ...req.body, role: 'MENTOR' }, req.user._id);
  return sendSuccess(res, 201, 'Mentor account created.', { mentor: user });
});
const assignMentor = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Mentor assigned to student.', {
  assignment: await adminService.assignMentor(req.body, req.user._id),
}));
const unassignMentor = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Mentor assignment removed.', {
  assignment: await adminService.removeMentorAssignment(req.params.studentId, req.user._id),
}));
const skills = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skills loaded.', { skills: await adminService.listSkills() }));
const createSkill = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Skill created.', { skill: await adminService.addSkill(req.body, req.user._id) }));
const updateSkill = asyncHandler(async (req, res) => {
  const input = {};
  for (const key of ['name', 'description', 'category', 'isActive']) if (req.body[key] !== undefined) input[key] = req.body[key];
  if (!Object.keys(input).length) throw new AppError('At least one skill field is required.', 400);
  const skill = await adminService.updateSkill(req.params.id, input, req.user._id);
  return sendSuccess(res, 200, 'Skill updated.', { skill });
});
const deleteSkill = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill deactivated.', { skill: await adminService.deactivateSkill(req.params.id, req.user._id) }));
const relationships = asyncHandler(async (req, res) => {
  const items = await SkillPrerequisite.find({}).populate('skillId', 'name category').populate('prerequisiteSkillId', 'name category').sort({ createdAt: -1 }).lean();
  return sendSuccess(res, 200, 'Skill relationships loaded.', { relationships: items });
});
const createRelationship = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Skill prerequisite created.', {
  relationship: await adminService.createSkillRelationship({ ...req.body, actorId: req.user._id }),
}));
const deleteRelationship = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Skill prerequisite deleted.', {
  relationship: await adminService.deleteSkillRelationship(req.params.id, req.user._id),
}));
const scoringRules = asyncHandler(async (req, res) => {
  const rules = await ScoringRule.find({}).populate('createdBy', 'name email').sort({ version: -1 }).lean();
  return sendSuccess(res, 200, 'Scoring rules loaded.', { rules, activeRule: rules.find(rule => rule.isActive) || null });
});
const createScoringRuleValidation = [
  body('typeWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['PROJECT', 'ASSESSMENT', 'CODING', 'COURSE', 'INTERVIEW'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Type weights must use supported achievement types and values between 0 and 1.'),
  body('reliabilityWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['SELF', 'MENTOR', 'PLATFORM'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Reliability weights must use supported sources and values between 0 and 1.'),
  body('verificationWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['PENDING', 'VERIFIED', 'REJECTED'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Verification weights must use supported statuses and values between 0 and 1.'),
  body('difficultyFloor').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('difficultyCeiling').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('recencyHalfLifeDays').optional().isInt({ min: 1, max: 3650 }).toInt(),
  body('recencyFloor').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('masteryThreshold').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('practiceThreshold').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body().custom(value => value.difficultyFloor === undefined || value.difficultyCeiling === undefined || value.difficultyFloor <= value.difficultyCeiling)
    .withMessage('Difficulty floor cannot exceed the difficulty ceiling.'),
  body().custom(value => value.masteryThreshold === undefined || value.practiceThreshold === undefined || value.masteryThreshold <= value.practiceThreshold)
    .withMessage('Mastery threshold cannot exceed the practice threshold.'),
  validateRequest,
];
const updateScoringRuleValidation = [
  body('typeWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['PROJECT', 'ASSESSMENT', 'CODING', 'COURSE', 'INTERVIEW'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Type weights must use supported achievement types and values between 0 and 1.'),
  body('reliabilityWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['SELF', 'MENTOR', 'PLATFORM'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Reliability weights must use supported sources and values between 0 and 1.'),
  body('verificationWeights').optional().isObject().custom(values => Object.entries(values).every(([key, value]) =>
    ['PENDING', 'VERIFIED', 'REJECTED'].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1,
  )).withMessage('Verification weights must use supported statuses and values between 0 and 1.'),
  body('difficultyFloor').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('difficultyCeiling').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('recencyHalfLifeDays').optional().isInt({ min: 1, max: 3650 }).toInt(),
  body('recencyFloor').optional().isFloat({ min: 0, max: 1 }).toFloat(),
  body('masteryThreshold').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('practiceThreshold').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body().custom(value => value.difficultyFloor === undefined || value.difficultyCeiling === undefined || value.difficultyFloor <= value.difficultyCeiling)
    .withMessage('Difficulty floor cannot exceed the difficulty ceiling.'),
  body().custom(value => value.masteryThreshold === undefined || value.practiceThreshold === undefined || value.masteryThreshold <= value.practiceThreshold)
    .withMessage('Mastery threshold cannot exceed the practice threshold.'),
  body().custom(value => Boolean(
    value.typeWeights || value.reliabilityWeights || value.verificationWeights
    || value.difficultyFloor !== undefined || value.difficultyCeiling !== undefined
    || value.recencyHalfLifeDays !== undefined || value.recencyFloor !== undefined
    || value.masteryThreshold !== undefined || value.practiceThreshold !== undefined,
  )).withMessage('At least one scoring factor must be provided.'),
  validateRequest,
];
const updateScoringRule = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Scoring rule draft updated.', {
  rule: await adminService.updateScoringRule(req.params.id, req.body, req.user._id),
}));
const createScoringRule = asyncHandler(async (req, res) => {
  const rule = await adminService.createScoringRule(req.body, req.user._id);
  return sendSuccess(res, 201, 'Scoring rule draft created.', { rule });
});
const activateScoringRule = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Scoring rule activated and affected student scores recalculated.', {
  rule: await adminService.activateScoringRule(req.params.id, req.user._id),
}));
const auditLogs = asyncHandler(async (req, res) => {
  const result = await adminService.getAuditLogs({
    page: req.query.page || 1,
    limit: req.query.limit || 25,
    action: req.query.action,
    search: req.query.search,
  });
  return sendSuccess(res, 200, 'Audit logs loaded.', result);
});
const recalculateScores = asyncHandler(async (req, res) => {
  const studentsUpdated = await adminService.recalculateStudentScores(req.body?.userId);
  return sendSuccess(res, 200, 'Student scores recalculated.', { studentsUpdated });
});
const activity = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Platform activity loaded.', { activity: await adminService.getAuditLogs({ page: 1, limit: 20 }) }));

module.exports = {
  activity,
  activateScoringRule,
  assignMentor,
  assignmentValidation,
  auditQueryValidation,
  auditLogs,
  createMentor,
  mentorValidation,
  createRelationship,
  createScoringRule,
  createScoringRuleValidation,
  createSkill,
  createUser,
  createUserValidation,
  dashboard,
  deleteRelationship,
  deleteSkill,
  idValidation,
  mentors,
  relationshipValidation,
  recalculateScores,
  recalculateValidation,
  relationships,
  scoringRules,
  skills,
  students,
  unassignMentor,
  updateSkill,
  updateScoringRule,
  updateScoringRuleValidation,
  updateUser,
  updateUserValidation,
  users,
  userQueryValidation,
  skillValidation,
  updateSkillValidation,
};
