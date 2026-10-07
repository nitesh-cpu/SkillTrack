const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { rejectUnknownBodyFields, rejectUnknownQueryFields } = require('../middleware/validateRequest');
const controller = require('../controllers/learningController');

const router = express.Router();
router.use(authenticate);
router.get('/courses', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), controller.courses);
router.post('/courses', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(controller.courseFields), controller.courseValidation, controller.createCourse);
router.patch('/courses/:courseId', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['title', 'description', 'skillId', 'status']), controller.courseIdValidation, controller.courseUpdateValidation, controller.updateCourse);
router.post('/courses/:courseId/modules', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(controller.moduleFields), controller.courseIdValidation, controller.moduleValidation, controller.addModule);
router.patch('/courses/:courseId/lessons/:lessonId', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['title', 'description', 'videoUrl', 'durationSeconds', 'thumbnailUrl', 'topic', 'skillId']), controller.courseIdValidation, controller.lessonIdValidation, controller.lessonUpdateValidation, controller.updateLesson);
router.post('/courses/:courseId/assignments', requireRole('ADMIN', 'MENTOR'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['studentIds']), controller.courseIdValidation, controller.assignmentValidation, controller.assignCourse);
router.get('/student/courses', requireRole('STUDENT'), rejectUnknownQueryFields([]), controller.studentCourses);
router.get('/student/lessons/:lessonId', requireRole('STUDENT'), rejectUnknownQueryFields([]), controller.lessonIdValidation, controller.studentLesson);
router.patch('/student/lessons/:lessonId/progress', requireRole('STUDENT'), rejectUnknownQueryFields([]), rejectUnknownBodyFields(['lastPosition', 'watchedSeconds']), controller.lessonIdValidation, controller.progressValidation, controller.saveProgress);

module.exports = router;
