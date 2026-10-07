jest.mock('../src/models/Achievement', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../src/models/AchievementSkill', () => ({
  find: jest.fn(),
}));
jest.mock('../src/models/MentorStudent', () => ({
  find: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../src/models/SkillScore', () => ({
  aggregate: jest.fn(),
}));
jest.mock('../src/models/Skill', () => ({
  exists: jest.fn(),
}));
jest.mock('../src/models/Task', () => ({
  create: jest.fn(),
  exists: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
}));
jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));

const Achievement = require('../src/models/Achievement');
const AchievementSkill = require('../src/models/AchievementSkill');
const MentorStudent = require('../src/models/MentorStudent');
const SkillScore = require('../src/models/SkillScore');
const Skill = require('../src/models/Skill');
const Task = require('../src/models/Task');
const User = require('../src/models/User');
const {
  addTaskFeedback,
  assignTask,
  cancelMentorTask,
  getMentorTask,
  getStudentDetail,
  updateMentorTask,
} = require('../src/services/mentorService');

const mentorId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439012';
const taskId = '507f1f77bcf86cd799439013';

beforeEach(() => jest.clearAllMocks());

function setAssignedStudents(ids = [studentId]) {
  MentorStudent.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(ids.map(id => ({ studentId: id }))),
  });
}

describe('mentor ownership boundaries', () => {
  test('student detail rejects students outside the mentor assignment before reading profile data', async () => {
    MentorStudent.exists.mockResolvedValue(null);

    await expect(getStudentDetail(mentorId, studentId))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('task assignment refuses students outside the mentor assignment', async () => {
    MentorStudent.exists.mockResolvedValue(null);

    await expect(assignTask(mentorId, { studentId, title: 'Practice', skillId: 'skill-id' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(Task.create).not.toHaveBeenCalled();
  });

  test('task assignment rejects inactive skills after confirming student assignment', async () => {
    const { assignTask } = require('../src/services/mentorService');
    MentorStudent.exists.mockResolvedValue(true);
    Skill.exists.mockResolvedValue(null);

    await expect(assignTask(mentorId, { studentId, title: 'Practice', skillId: 'skill-id' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(Task.create).not.toHaveBeenCalled();
  });

  test('task feedback update is scoped to the mentor who owns the task', async () => {
    setAssignedStudents();
    const noOwnedTask = Promise.resolve(null);
    noOwnedTask.populate = jest.fn().mockReturnValue(noOwnedTask);
    Task.findOneAndUpdate.mockReturnValue(noOwnedTask);

    await expect(addTaskFeedback(mentorId, taskId, 'Good work.'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(Task.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: taskId, mentorId, studentId: { $in: [studentId] } },
      { $push: { feedbackHistory: expect.objectContaining({ mentorId, feedback: 'Good work.' }) } },
      { new: true, runValidators: true },
    );
  });

  test('task details are not visible when its student is no longer assigned', async () => {
    setAssignedStudents([]);
    const noTask = {
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    };
    Task.findOne.mockReturnValue(noTask);

    await expect(getMentorTask(mentorId, taskId)).rejects.toMatchObject({ statusCode: 404 });
    expect(Task.findOne).toHaveBeenCalledWith({
      _id: taskId,
      mentorId,
      studentId: { $in: [] },
    });
  });

  test('task updates are restricted to pending tasks and currently assigned students', async () => {
    setAssignedStudents();
    Skill.exists.mockResolvedValue(true);
    const updatedTask = {
      _id: taskId,
      studentId: { _id: studentId },
      populate: jest.fn().mockReturnThis(),
    };
    Task.findOneAndUpdate.mockReturnValue(updatedTask);

    await updateMentorTask(mentorId, taskId, { title: 'Updated task', skillId: 'skill-id' });

    expect(Task.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: taskId, mentorId, studentId: { $in: [studentId] }, status: 'PENDING' },
      { $set: { title: 'Updated task', skillId: 'skill-id' } },
      { new: true, runValidators: true },
    );
  });

  test('only a pending task belonging to an assigned student can be cancelled', async () => {
    setAssignedStudents();
    const pendingTask = {
      status: 'PENDING',
      studentId,
      select: jest.fn().mockResolvedValue({ status: 'PENDING', studentId }),
    };
    Task.findOne.mockReturnValue(pendingTask);
    Task.findOneAndDelete.mockResolvedValue({ _id: taskId, studentId });

    await cancelMentorTask(mentorId, taskId);

    expect(Task.findOneAndDelete).toHaveBeenCalledWith({
      _id: taskId,
      mentorId,
      studentId: { $in: [studentId] },
      status: 'PENDING',
    });
  });

  test('completed tasks cannot be cancelled', async () => {
    setAssignedStudents();
    Task.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ status: 'COMPLETED', studentId }),
    });

    await expect(cancelMentorTask(mentorId, taskId)).rejects.toMatchObject({ statusCode: 409 });
    expect(Task.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('review lookup only searches among the mentor assigned student IDs', async () => {
    MentorStudent.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ studentId }]),
    });
    const noReview = {
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    };
    Achievement.findOne.mockReturnValue(noReview);

    await expect(require('../src/services/mentorService').getReview(mentorId, 'evidence-id'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(Achievement.findOne).toHaveBeenCalledWith({
      _id: 'evidence-id',
      userId: { $in: [studentId] },
    });
  });
});
