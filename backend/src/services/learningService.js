const mongoose = require('mongoose');
const { isIP } = require('node:net');
const { extname } = require('node:path');
const LearningCourse = require('../models/LearningCourse');
const CourseAssignment = require('../models/CourseAssignment');
const VideoProgress = require('../models/VideoProgress');
const MentorStudent = require('../models/MentorStudent');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

function validPublicUrl(value, extensions, label, required = false) {
  if (!required && !value) return '';
  if (typeof value !== 'string' || value.length > 2048) throw new AppError(`${label} must be a valid HTTPS URL.`, 400);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(`${label} must be a valid HTTPS URL.`, 400);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password
    || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.endsWith('.internal') || isIP(hostname)
    || !extensions.has(extname(url.pathname).toLowerCase())) {
    throw new AppError(`${label} must point to a public HTTPS ${required ? 'MP4, WebM, or OGG video' : 'image file'}.`, 400);
  }
  return url.toString();
}

function normalizeLesson(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Lesson details are required.', 400);
  const allowedFields = ['title', 'description', 'videoUrl', 'durationSeconds', 'thumbnailUrl', 'topic', 'skillId'];
  if (Object.keys(input).some(key => !allowedFields.includes(key))) throw new AppError('Lesson contains unsupported fields.', 400);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const durationSeconds = Number(input.durationSeconds);
  if (title.length < 2 || title.length > 150) throw new AppError('Lesson title must be between 2 and 150 characters.', 400);
  if (description.length > 2000) throw new AppError('Lesson description cannot exceed 2000 characters.', 400);
  if (!topic || topic.length > 120) throw new AppError('Lesson topic is required and cannot exceed 120 characters.', 400);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400) {
    throw new AppError('Lesson duration must be between 1 second and 24 hours.', 400);
  }
  if (!mongoose.Types.ObjectId.isValid(input.skillId)) throw new AppError('Choose an active skill for this lesson.', 400);
  return {
    title,
    description,
    videoUrl: validPublicUrl(input.videoUrl, VIDEO_EXTENSIONS, 'Video URL', true),
    durationSeconds,
    thumbnailUrl: validPublicUrl(input.thumbnailUrl || '', IMAGE_EXTENSIONS, 'Thumbnail URL'),
    topic,
    skillId: input.skillId,
  };
}

function normalizeModule(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['title', 'lessons'].includes(key))) {
    throw new AppError('Module contains unsupported fields.', 400);
  }
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (title.length < 2 || title.length > 150) throw new AppError('Module title must be between 2 and 150 characters.', 400);
  if (!Array.isArray(input.lessons) || input.lessons.length < 1 || input.lessons.length > 50) {
    throw new AppError('Each module must contain between 1 and 50 lessons.', 400);
  }
  return { title, lessons: input.lessons.map(normalizeLesson) };
}

function normalizeCourse(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Course details are required.', 400);
  const allowedFields = ['title', 'description', 'skillId', 'status', 'modules'];
  if (Object.keys(input).some(key => !allowedFields.includes(key))) throw new AppError('Course contains unsupported fields.', 400);
  const normalized = {};
  if (!partial || input.title !== undefined) {
    normalized.title = typeof input.title === 'string' ? input.title.trim() : '';
    if (normalized.title.length < 2 || normalized.title.length > 150) {
      throw new AppError('Course title must be between 2 and 150 characters.', 400);
    }
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.trim().length > 3000) {
      throw new AppError('Course description cannot exceed 3000 characters.', 400);
    }
    normalized.description = input.description.trim();
  } else if (!partial) normalized.description = '';
  if (!partial || input.skillId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(input.skillId)) throw new AppError('Choose an active skill for this course.', 400);
    normalized.skillId = input.skillId;
  }
  if (input.status !== undefined || !partial) {
    normalized.status = input.status || 'DRAFT';
    if (!COURSE_STATUSES.includes(normalized.status)) throw new AppError('Choose a supported course status.', 400);
  }
  if (!partial || input.modules !== undefined) {
    if (!Array.isArray(input.modules) || input.modules.length < 1 || input.modules.length > 30) {
      throw new AppError('A course must contain between 1 and 30 modules.', 400);
    }
    normalized.modules = input.modules.map(normalizeModule);
    const lessonCount = normalized.modules.reduce((count, module) => count + module.lessons.length, 0);
    if (lessonCount > 200) throw new AppError('A course cannot contain more than 200 lessons.', 400);
  }
  if (partial && !Object.keys(normalized).length) throw new AppError('Provide course fields to update.', 400);
  return normalized;
}

async function ensureActiveSkills(course) {
  const ids = [course.skillId, ...course.modules.flatMap(module => module.lessons.map(lesson => lesson.skillId))];
  if (ids.length && await Skill.countDocuments({ _id: { $in: ids }, isActive: true }) !== new Set(ids.map(String)).size) {
    throw new AppError('Choose active skills for this course and its lessons.', 400);
  }
}

function canManageCourse(actor, course) {
  return actor.role === 'ADMIN' || String(course.createdBy) === String(actor._id);
}

function lessonIds(courses) {
  return courses.flatMap(course => course.modules.flatMap(module => module.lessons.map(lesson => lesson._id)));
}

async function attachProgress(courses, studentId) {
  const ids = lessonIds(courses);
  const progress = ids.length ? await VideoProgress.find({ studentId, lessonId: { $in: ids } }).lean() : [];
  const progressByLesson = new Map(progress.map(item => [String(item.lessonId), item]));
  return courses.map(course => ({
    ...course,
    modules: course.modules.map(module => ({
      ...module,
      lessons: module.lessons.map(lesson => ({
        ...lesson,
        progress: progressByLesson.get(String(lesson._id)) || {
          watchedSeconds: 0,
          lastPosition: 0,
          completed: false,
        },
      })),
    })),
  }));
}

async function listCourses(actor) {
  if (actor.role === 'STUDENT') {
    const assignments = await CourseAssignment.find({ studentId: actor._id }).select('courseId').lean();
    const courseIds = assignments.map(item => item.courseId);
    const courses = courseIds.length
      ? await LearningCourse.find({ _id: { $in: courseIds }, status: 'PUBLISHED' }).populate('skillId', 'name').sort({ updatedAt: -1 }).lean()
      : [];
    return attachProgress(courses, actor._id);
  }
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to view learning courses.', 403);
  const filter = actor.role === 'ADMIN' ? {} : { createdBy: actor._id };
  return LearningCourse.find(filter).populate('skillId', 'name').sort({ updatedAt: -1, _id: -1 }).lean();
}

async function createCourse(actor, input) {
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to create learning courses.', 403);
  const course = normalizeCourse(input);
  await ensureActiveSkills(course);
  const created = await LearningCourse.create({ ...course, createdBy: actor._id, updatedBy: actor._id });
  await writeAudit({
    actorId: actor._id,
    action: 'VIDEO_CREATED',
    entity: 'LearningCourse',
    entityId: created._id,
    metadata: { moduleCount: created.modules.length, lessonCount: lessonIds([created]).length },
  });
  return created;
}

async function updateCourse(actor, courseId, input) {
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to update learning courses.', 403);
  const normalized = normalizeCourse(input, true);
  const course = await LearningCourse.findById(courseId);
  if (!course) throw new AppError('Learning course not found.', 404);
  if (!canManageCourse(actor, course)) throw new AppError('You can only manage courses you created.', 403);
  if (normalized.skillId && !(await Skill.exists({ _id: normalized.skillId, isActive: true }))) {
    throw new AppError('Choose an active skill for this course.', 400);
  }
  Object.assign(course, normalized, { updatedBy: actor._id });
  await course.save();
  await writeAudit({ actorId: actor._id, action: 'VIDEO_UPDATED', entity: 'LearningCourse', entityId: course._id, metadata: { status: course.status } });
  return course;
}

async function addModule(actor, courseId, input) {
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to update learning courses.', 403);
  const module = normalizeModule(input);
  const course = await LearningCourse.findById(courseId);
  if (!course) throw new AppError('Learning course not found.', 404);
  if (!canManageCourse(actor, course)) throw new AppError('You can only manage courses you created.', 403);
  await ensureActiveSkills({ skillId: course.skillId, modules: [module] });
  if (course.modules.length >= 30 || lessonIds([course]).length + module.lessons.length > 200) {
    throw new AppError('This course has reached its module or lesson limit.', 409);
  }
  course.modules.push(module);
  course.updatedBy = actor._id;
  await course.save();
  await writeAudit({ actorId: actor._id, action: 'VIDEO_UPDATED', entity: 'LearningCourse', entityId: course._id, metadata: { moduleCount: course.modules.length } });
  return course;
}

async function updateLesson(actor, courseId, lessonId, input) {
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to update learning courses.', 403);
  if (!mongoose.Types.ObjectId.isValid(lessonId)) throw new AppError('A valid lesson ID is required.', 400);
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) {
    throw new AppError('Provide lesson fields to update.', 400);
  }
  const course = await LearningCourse.findById(courseId);
  if (!course) throw new AppError('Learning course not found.', 404);
  if (!canManageCourse(actor, course)) throw new AppError('You can only manage courses you created.', 403);
  const lesson = course.modules.flatMap(module => module.lessons)
    .find(item => String(item._id) === String(lessonId));
  if (!lesson) throw new AppError('Course lesson not found.', 404);
  const normalized = normalizeLesson({
    title: lesson.title,
    description: lesson.description,
    videoUrl: lesson.videoUrl,
    durationSeconds: lesson.durationSeconds,
    thumbnailUrl: lesson.thumbnailUrl,
    topic: lesson.topic,
    skillId: lesson.skillId,
    ...input,
  });
  if (!(await Skill.exists({ _id: normalized.skillId, isActive: true }))) {
    throw new AppError('Choose an active skill for this lesson.', 400);
  }
  Object.assign(lesson, normalized);
  course.updatedBy = actor._id;
  await course.save();
  await writeAudit({
    actorId: actor._id,
    action: 'VIDEO_UPDATED',
    entity: 'LearningCourse',
    entityId: course._id,
    metadata: { lessonId: String(lesson._id), topic: lesson.topic },
  });
  return course;
}

async function assignCourse(actor, courseId, studentIds) {
  if (!['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to assign learning courses.', 403);
  if (!Array.isArray(studentIds) || studentIds.length < 1 || studentIds.length > 500
    || studentIds.some(id => !mongoose.Types.ObjectId.isValid(id))
    || new Set(studentIds.map(String)).size !== studentIds.length) {
    throw new AppError('Choose between 1 and 500 unique students.', 400);
  }
  const course = await LearningCourse.findById(courseId);
  if (!course) throw new AppError('Learning course not found.', 404);
  if (!canManageCourse(actor, course)) throw new AppError('You can only assign courses you created.', 403);
  if (course.status !== 'PUBLISHED') throw new AppError('Publish the course before assigning it.', 409);
  let validStudents;
  if (actor.role === 'MENTOR') {
    validStudents = await MentorStudent.find({ mentorId: actor._id, studentId: { $in: studentIds } }).select('studentId').lean();
  } else {
    validStudents = await User.find({ _id: { $in: studentIds }, role: 'STUDENT', isActive: true }).select('_id').lean();
    validStudents = validStudents.map(student => ({ studentId: student._id }));
  }
  if (validStudents.length !== studentIds.length) throw new AppError('One or more students are not available for this assignment.', 403);
  const writes = await Promise.all(studentIds.map(async studentId => {
    try {
      return await CourseAssignment.updateOne(
        { courseId, studentId },
        { $setOnInsert: { assignedBy: actor._id } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code === 11000) return { upsertedCount: 0 };
      throw error;
    }
  }));
  const newlyAssigned = writes.reduce((count, result) => count + (result.upsertedCount || 0), 0);
  await writeAudit({
    actorId: actor._id,
    action: 'COURSE_ASSIGNED',
    entity: 'LearningCourse',
    entityId: courseId,
    metadata: { newlyAssigned },
  });
  return { newlyAssigned, alreadyAssigned: studentIds.length - newlyAssigned };
}

async function studentLesson(studentId, lessonId) {
  if (!mongoose.Types.ObjectId.isValid(lessonId)) throw new AppError('A valid lesson ID is required.', 400);
  const assignments = await CourseAssignment.find({ studentId }).select('courseId').lean();
  const courseIds = assignments.map(item => item.courseId);
  const course = courseIds.length
    ? await LearningCourse.findOne({ _id: { $in: courseIds }, status: 'PUBLISHED', 'modules.lessons._id': lessonId })
      .populate('skillId', 'name').lean()
    : null;
  if (!course) throw new AppError('Assigned lesson not found.', 404);
  for (const module of course.modules) {
    const lesson = module.lessons.find(item => String(item._id) === String(lessonId));
    if (lesson) {
      const progress = await VideoProgress.findOne({ studentId, lessonId }).lean();
      return {
        course: { id: String(course._id), title: course.title },
        module: { id: String(module._id), title: module.title },
        lesson,
        progress: progress || { watchedSeconds: 0, lastPosition: 0, completed: false },
      };
    }
  }
  throw new AppError('Assigned lesson not found.', 404);
}

async function saveStudentProgress(studentId, lessonId, input) {
  const context = await studentLesson(studentId, lessonId);
  const lastPosition = Number(input.lastPosition);
  const watchedSeconds = Number(input.watchedSeconds);
  const duration = context.lesson.durationSeconds;
  if (!Number.isFinite(lastPosition) || lastPosition < 0 || lastPosition > duration
    || !Number.isFinite(watchedSeconds) || watchedSeconds < 0 || watchedSeconds > duration) {
    throw new AppError('Video progress is outside the lesson duration.', 400);
  }
  const watched = Math.max(watchedSeconds, context.progress.watchedSeconds);
  const completed = context.progress.completed || (watched >= duration * 0.9 && lastPosition >= duration * 0.9);
  const progress = await VideoProgress.findOneAndUpdate(
    { studentId, lessonId },
    { $set: { lastPosition, watchedSeconds: watched, completed } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return progress;
}

module.exports = { addModule, assignCourse, createCourse, listCourses, saveStudentProgress, studentLesson, updateCourse, updateLesson };
