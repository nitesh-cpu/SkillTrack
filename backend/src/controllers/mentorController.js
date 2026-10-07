const { body, param } = require('express-validator');
const Skill = require('../models/Skill');
const mentorService = require('../services/mentorService');
const achievementService = require('../services/achievementService');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { validateRequest } = require('../middleware/validateRequest');

const idValidation = [param('id').isMongoId().withMessage('A valid ID is required.'), validateRequest];
const taskIdValidation = [param('taskId').isMongoId().withMessage('A valid task ID is required.'), validateRequest];
const dashboard = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Mentor dashboard loaded.', await mentorService.getMentorDashboard(req.user._id)));
const students = asyncHandler(async (req, res) => {
  const options = { ...req.query };
  if (options.page === undefined && (options.limit !== undefined || options.search)) options.page = 1;
  return sendSuccess(res, 200, 'Assigned students loaded.', await mentorService.getStudents(req.user._id, options));
});
const studentDetail = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Assigned student profile loaded.', await mentorService.getStudentDetail(req.user._id, req.params.id)));
const pendingReviews = asyncHandler(async (req, res) => {
  const options = { ...req.query, statuses: ['PENDING'] };
  if (options.page === undefined && (options.limit !== undefined || options.search)) options.page = 1;
  return sendSuccess(res, 200, 'Pending submissions loaded.', await mentorService.listMentorAchievements(req.user._id, options));
});
const reviewed = asyncHandler(async (req, res) => {
  const options = { ...req.query, statuses: ['VERIFIED', 'REJECTED'] };
  if (options.page === undefined && (options.limit !== undefined || options.search)) options.page = 1;
  return sendSuccess(res, 200, 'Reviewed submissions loaded.', await mentorService.listMentorAchievements(req.user._id, options));
});
const reviewDetails = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Submission loaded.', { achievement: await mentorService.getReview(req.user._id, req.params.id) }));
const verify = asyncHandler(async (req, res) => {
  const achievement = await achievementService.reviewAchievement({ achievementId: req.params.id, mentor: req.user, status: 'VERIFIED', feedback: req.body.feedback });
  return sendSuccess(res, 200, 'Achievement verified and scores recalculated.', { achievement });
});
const reject = asyncHandler(async (req, res) => {
  const achievement = await achievementService.reviewAchievement({ achievementId: req.params.id, mentor: req.user, status: 'REJECTED', rejectionReason: req.body.rejectionReason, feedback: req.body.feedback });
  return sendSuccess(res, 200, 'Achievement rejected with feedback.', { achievement });
});
const tasks = asyncHandler(async (req, res) => {
  const options = { ...req.query };
  if (options.page === undefined && (options.limit !== undefined || options.search || options.status)) options.page = 1;
  return sendSuccess(res, 200, 'Mentor tasks loaded.', await mentorService.listMentorTasks(req.user._id, options));
});
const taskDetails = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Task details loaded.', {
  task: await mentorService.getMentorTask(req.user._id, req.params.taskId),
}));
const addTaskFeedbackValidation = [
  body('feedback').isString().trim().isLength({ min: 2, max: 1000 }).withMessage('Feedback must be between 2 and 1000 characters.'),
  validateRequest,
];
const addTaskFeedback = asyncHandler(async (req, res) => sendSuccess(res, 201, 'Task feedback added.', {
  task: await mentorService.addTaskFeedback(req.user._id, req.params.taskId, req.body.feedback),
}));

const createTaskValidation = [
  body('studentId').isMongoId().withMessage('A valid student ID is required.'),
  body('title').isString().trim().isLength({ min: 2, max: 150 }).withMessage('Task title must be between 2 and 150 characters.'),
  body('description').optional().isString().trim().isLength({ max: 1500 }).withMessage('Task description cannot exceed 1500 characters.'),
  body('skillId').isMongoId().withMessage('A valid skill ID is required.'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Priority must be LOW, MEDIUM, or HIGH.'),
  body('deadline').optional({ values: 'falsy' }).isISO8601().withMessage('Deadline must be a valid date.'),
  validateRequest,
];
const verifyValidation = [
  body('feedback').optional().isString().trim().isLength({ max: 1000 }).withMessage('Feedback cannot exceed 1000 characters.'),
  validateRequest,
];
const rejectValidation = [
  body('rejectionReason').isString().trim().isLength({ min: 5, max: 1000 }).withMessage('A helpful rejection reason of 5 to 1000 characters is required.'),
  body('feedback').optional().isString().trim().isLength({ max: 1000 }).withMessage('Feedback cannot exceed 1000 characters.'),
  validateRequest,
];

const assignTask = asyncHandler(async (req, res) => {
  const task = await mentorService.assignTask(req.user._id, req.body);
  return sendSuccess(res, 201, 'Task assigned to student.', { task });
});
const updateTaskValidation = [
  body('title').optional().isString().trim().isLength({ min: 2, max: 150 }).withMessage('Task title must be between 2 and 150 characters.'),
  body('description').optional().isString().trim().isLength({ max: 1500 }).withMessage('Task description cannot exceed 1500 characters.'),
  body('skillId').optional().isMongoId().withMessage('A valid skill ID is required.'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Priority must be LOW, MEDIUM, or HIGH.'),
  body('deadline').optional({ values: 'null' }).isISO8601().withMessage('Deadline must be a valid date.'),
  validateRequest,
];
const updateTask = asyncHandler(async (req, res) => sendSuccess(res, 200, 'Task updated.', {
  task: await mentorService.updateMentorTask(req.user._id, req.params.taskId, req.body),
}));
const cancelTask = asyncHandler(async (req, res) => {
  await mentorService.cancelMentorTask(req.user._id, req.params.taskId);
  return sendSuccess(res, 200, 'Task cancelled.');
});

module.exports = {
  assignTask,
  addTaskFeedback,
  addTaskFeedbackValidation,
  cancelTask,
  createTaskValidation,
  dashboard,
  idValidation,
  pendingReviews,
  reviewDetails,
  reviewed,
  studentDetail,
  students,
  taskDetails,
  tasks,
  taskIdValidation,
  updateTask,
  updateTaskValidation,
  verify,
  verifyValidation,
  reject,
  rejectValidation,
};
