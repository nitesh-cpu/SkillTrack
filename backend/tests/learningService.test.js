jest.mock('../src/models/LearningCourse', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../src/models/CourseAssignment', () => ({
  find: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/models/VideoProgress', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/models/MentorStudent', () => ({
  find: jest.fn(),
}));
jest.mock('../src/models/Skill', () => ({
  countDocuments: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  find: jest.fn(),
}));
jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn(),
}));

const LearningCourse = require('../src/models/LearningCourse');
const CourseAssignment = require('../src/models/CourseAssignment');
const VideoProgress = require('../src/models/VideoProgress');
const MentorStudent = require('../src/models/MentorStudent');
const Skill = require('../src/models/Skill');
const User = require('../src/models/User');
const { writeAudit } = require('../src/middleware/auditMiddleware');
const learningService = require('../src/services/learningService');

const mentorId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439012';
const courseId = '507f1f77bcf86cd799439013';
const skillId = '507f1f77bcf86cd799439014';
const lessonId = '507f1f77bcf86cd799439015';
const course = {
  _id: courseId,
  createdBy: mentorId,
  status: 'PUBLISHED',
  title: 'HTTP foundations',
  skillId,
  modules: [{
    _id: '507f1f77bcf86cd799439016',
    title: 'Requests',
    lessons: [{
      _id: lessonId,
      title: 'Request basics',
      description: '',
      videoUrl: 'https://media.example.com/request-basics.mp4',
      durationSeconds: 600,
      thumbnailUrl: '',
      topic: 'HTTP',
      skillId,
    }],
  }],
  save: jest.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  jest.clearAllMocks();
  Skill.countDocuments.mockResolvedValue(1);
  Skill.exists.mockResolvedValue({ _id: skillId });
});

const courseInput = {
  title: 'HTTP foundations',
  description: '',
  skillId,
  status: 'PUBLISHED',
  modules: [{
    title: 'Requests',
    lessons: [{
      title: 'Request basics',
      description: '',
      videoUrl: 'https://media.example.com/request-basics.mp4',
      durationSeconds: 600,
      thumbnailUrl: '',
      topic: 'HTTP',
      skillId,
    }],
  }],
};

describe('learning course service', () => {
  test('creates URL-based lessons and records a safe audit event', async () => {
    LearningCourse.create.mockResolvedValue(course);
    const result = await learningService.createCourse({ _id: mentorId, role: 'MENTOR' }, courseInput);
    expect(result).toBe(course);
    expect(LearningCourse.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'HTTP foundations',
      createdBy: mentorId,
      status: 'PUBLISHED',
    }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: mentorId,
      action: 'VIDEO_CREATED',
      metadata: { moduleCount: 1, lessonCount: 1 },
    }));
  });

  test('rejects insecure or unsupported video URLs before persistence', async () => {
    const input = {
      ...courseInput,
      modules: [{ ...courseInput.modules[0], lessons: [{
        ...courseInput.modules[0].lessons[0],
        videoUrl: 'http://media.example.com/request-basics.mp4',
      }] }],
    };
    await expect(learningService.createCourse({ _id: mentorId, role: 'MENTOR' }, input)).rejects.toThrow('HTTPS');
    input.modules[0].lessons[0].videoUrl = 'https://media.example.com/request-basics.html';
    await expect(learningService.createCourse({ _id: mentorId, role: 'MENTOR' }, input)).rejects.toThrow('MP4, WebM, or OGG');
    expect(LearningCourse.create).not.toHaveBeenCalled();
  });

  test('mentors can assign a published course only to their own assigned students', async () => {
    LearningCourse.findById.mockResolvedValue(course);
    MentorStudent.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ studentId }]),
      }),
    });
    CourseAssignment.updateOne.mockResolvedValue({ upsertedCount: 1 });
    const result = await learningService.assignCourse(
      { _id: mentorId, role: 'MENTOR' },
      courseId,
      [studentId],
    );
    expect(result).toEqual({ newlyAssigned: 1, alreadyAssigned: 0 });
    expect(CourseAssignment.updateOne).toHaveBeenCalledWith(
      { courseId, studentId },
      { $setOnInsert: { assignedBy: mentorId } },
      { upsert: true },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'COURSE_ASSIGNED' }));
  });

  test('rejects mentors attempting to assign courses outside their roster', async () => {
    LearningCourse.findById.mockResolvedValue(course);
    MentorStudent.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    await expect(learningService.assignCourse({ _id: mentorId, role: 'MENTOR' }, courseId, [studentId]))
      .rejects.toThrow('not available');
    expect(CourseAssignment.updateOne).not.toHaveBeenCalled();
  });

  test('updates lessons in place so progress remains attached to the same lesson', async () => {
    LearningCourse.findById.mockResolvedValue(course);
    const result = await learningService.updateLesson(
      { _id: mentorId, role: 'MENTOR' },
      courseId,
      lessonId,
      { title: 'Request essentials', topic: 'HTTP requests' },
    );
    expect(result.modules[0].lessons[0]._id).toBe(lessonId);
    expect(result.modules[0].lessons[0].title).toBe('Request essentials');
    expect(course.save).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'VIDEO_UPDATED',
      metadata: { lessonId, topic: 'HTTP requests' },
    }));
  });

  test('prevents mentors from editing lessons in another mentor’s course', async () => {
    LearningCourse.findById.mockResolvedValue({ ...course, createdBy: '507f1f77bcf86cd799439099' });
    await expect(learningService.updateLesson(
      { _id: mentorId, role: 'MENTOR' },
      courseId,
      lessonId,
      { title: 'Changed title' },
    )).rejects.toThrow('courses you created');
  });

  test('students see only assigned published courses with lesson progress', async () => {
    CourseAssignment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ courseId }]),
      }),
    });
    LearningCourse.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([course]),
    });
    VideoProgress.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{
        studentId, lessonId, watchedSeconds: 210, lastPosition: 220, completed: false,
      }]),
    });
    const result = await learningService.listCourses({ _id: studentId, role: 'STUDENT' });
    expect(LearningCourse.find).toHaveBeenCalledWith({ _id: { $in: [courseId] }, status: 'PUBLISHED' });
    expect(result[0].modules[0].lessons[0].progress).toMatchObject({ watchedSeconds: 210, completed: false });
  });

  test('resume data is restricted to assigned courses and progress requires valid durations', async () => {
    CourseAssignment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ courseId }]) }),
    });
    LearningCourse.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(course),
    });
    VideoProgress.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ watchedSeconds: 210, lastPosition: 220, completed: false }),
    });
    VideoProgress.findOneAndUpdate.mockResolvedValue({
      watchedSeconds: 540, lastPosition: 550, completed: true,
    });
    const progress = await learningService.saveStudentProgress(studentId, lessonId, { watchedSeconds: 540, lastPosition: 550 });
    expect(progress).toMatchObject({ watchedSeconds: 540, completed: true });
    expect(VideoProgress.findOneAndUpdate).toHaveBeenCalledWith(
      { studentId, lessonId },
      { $set: { watchedSeconds: 540, lastPosition: 550, completed: true } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await expect(learningService.saveStudentProgress(studentId, lessonId, { watchedSeconds: 800, lastPosition: 800 }))
      .rejects.toThrow('outside the lesson duration');
  });

  test('only admins can assign a course to active students across the platform', async () => {
    LearningCourse.findById.mockResolvedValue(course);
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: studentId }]),
      }),
    });
    CourseAssignment.updateOne.mockResolvedValue({ upsertedCount: 0 });
    const result = await learningService.assignCourse({ _id: mentorId, role: 'ADMIN' }, courseId, [studentId]);
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: [studentId] }, role: 'STUDENT', isActive: true });
    expect(result).toEqual({ newlyAssigned: 0, alreadyAssigned: 1 });
  });
});
