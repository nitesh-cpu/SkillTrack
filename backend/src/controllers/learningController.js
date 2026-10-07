const { body, param } = require('express-validator');
const learningService = require('../services/learningService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');

const courseIdValidation = [param('courseId').isMongoId().withMessage('A valid course ID is required.'), validateRequest];
const lessonIdValidation = [param('lessonId').isMongoId().withMessage('A valid lesson ID is required.'), validateRequest];
const lessonFields = ['title', 'description', 'videoUrl', 'durationSeconds', 'thumbnailUrl', 'topic', 'skillId'];
const moduleFields = ['title', 'lessons'];
const courseFields = ['title', 'description', 'skillId', 'status', 'modules'];
const courseValidation = [
  body('title').isString().trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().isLength({ max: 3000 }),
  body('skillId').isMongoId(),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  body('modules').isArray({ min: 1, max: 30 }),
  body('modules.*').isObject().custom(value => Object.keys(value).every(key => moduleFields.includes(key))),
  body('modules.*.title').isString().trim().isLength({ min: 2, max: 150 }),
  body('modules.*.lessons').isArray({ min: 1, max: 50 }),
  body('modules.*.lessons.*').isObject().custom(value => Object.keys(value).every(key => lessonFields.includes(key))),
  body('modules.*.lessons.*.title').isString().trim().isLength({ min: 2, max: 150 }),
  body('modules.*.lessons.*.description').optional().isString().isLength({ max: 2000 }),
  body('modules.*.lessons.*.videoUrl').isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('modules.*.lessons.*.durationSeconds').isInt({ min: 1, max: 86400 }).toInt(),
  body('modules.*.lessons.*.thumbnailUrl').optional({ values: 'falsy' }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('modules.*.lessons.*.topic').isString().trim().isLength({ min: 1, max: 120 }),
  body('modules.*.lessons.*.skillId').isMongoId(),
  validateRequest,
];
const courseUpdateValidation = [
  body().custom(value => Object.keys(value).length > 0).withMessage('Provide course fields to update.'),
  body('title').optional().isString().trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().isLength({ max: 3000 }),
  body('skillId').optional().isMongoId(),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  validateRequest,
];
const moduleValidation = [
  body('title').isString().trim().isLength({ min: 2, max: 150 }),
  body('lessons').isArray({ min: 1, max: 50 }),
  body('lessons.*').isObject().custom(value => Object.keys(value).every(key => lessonFields.includes(key))),
  body('lessons.*.title').isString().trim().isLength({ min: 2, max: 150 }),
  body('lessons.*.description').optional().isString().isLength({ max: 2000 }),
  body('lessons.*.videoUrl').isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('lessons.*.durationSeconds').isInt({ min: 1, max: 86400 }).toInt(),
  body('lessons.*.thumbnailUrl').optional({ values: 'falsy' }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('lessons.*.topic').isString().trim().isLength({ min: 1, max: 120 }),
  body('lessons.*.skillId').isMongoId(),
  validateRequest,
];
const lessonUpdateValidation = [
  body().custom(value => Object.keys(value).length > 0).withMessage('Provide lesson fields to update.'),
  body('title').optional().isString().trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('videoUrl').optional().isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('durationSeconds').optional().isInt({ min: 1, max: 86400 }).toInt(),
  body('thumbnailUrl').optional({ values: 'falsy' }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 2048 }),
  body('topic').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('skillId').optional().isMongoId(),
  validateRequest,
];
const assignmentValidation = [
  body('studentIds').isArray({ min: 1, max: 500 }),
  body('studentIds.*').isMongoId(),
  validateRequest,
];
const progressValidation = [
  body('lastPosition').isFloat({ min: 0 }).toFloat(),
  body('watchedSeconds').isFloat({ min: 0 }).toFloat(),
  validateRequest,
];

const courses = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Learning courses loaded.', {
  courses: await learningService.listCourses(req.user),
}));
const createCourse = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Learning course created.', {
  course: await learningService.createCourse(req.user, req.body),
}));
const updateCourse = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Learning course updated.', {
  course: await learningService.updateCourse(req.user, req.params.courseId, req.body),
}));
const addModule = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Course module added.', {
  course: await learningService.addModule(req.user, req.params.courseId, req.body),
}));
const updateLesson = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Course lesson updated.', {
  course: await learningService.updateLesson(req.user, req.params.courseId, req.params.lessonId, req.body),
}));
const assignCourse = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Learning course assigned.', await learningService.assignCourse(
  req.user,
  req.params.courseId,
  req.body.studentIds,
)));
const studentCourses = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Your assigned courses loaded.', {
  courses: await learningService.listCourses(req.user),
}));
const studentLesson = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Learning lesson loaded.', {
  lesson: await learningService.studentLesson(req.user._id, req.params.lessonId),
}));
const saveProgress = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Video progress saved.', {
  progress: await learningService.saveStudentProgress(req.user._id, req.params.lessonId, req.body),
}));

module.exports = {
  addModule,
  assignmentValidation,
  assignCourse,
  courseFields,
  courseIdValidation,
  courseUpdateValidation,
  courseValidation,
  courses,
  createCourse,
  lessonIdValidation,
  lessonUpdateValidation,
  moduleFields,
  moduleValidation,
  progressValidation,
  saveProgress,
  studentCourses,
  studentLesson,
  updateCourse,
  updateLesson,
};
