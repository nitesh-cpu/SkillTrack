jest.mock('../src/models/Exam', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/models/ExamAssignment', () => ({
  find: jest.fn(),
  bulkWrite: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/models/MentorStudent', () => ({
  distinct: jest.fn(),
}));

jest.mock('../src/models/Question', () => ({
  find: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock('../src/models/Skill', () => ({
  exists: jest.fn(),
}));

jest.mock('../src/models/User', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn(),
}));

const Exam = require('../src/models/Exam');
const ExamAssignment = require('../src/models/ExamAssignment');
const MentorStudent = require('../src/models/MentorStudent');
const Question = require('../src/models/Question');
const Skill = require('../src/models/Skill');
const User = require('../src/models/User');
const { writeAudit } = require('../src/middleware/auditMiddleware');
const examService = require('../src/services/examService');

const admin = { _id: '507f1f77bcf86cd799439013', role: 'ADMIN' };
const mentor = { _id: '507f1f77bcf86cd799439012', role: 'MENTOR' };
const questionId = '507f1f77bcf86cd799439015';
const skillId = '507f1f77bcf86cd799439016';
const studentId = '507f1f77bcf86cd799439017';
const question = {
  _id: questionId,
  question: 'Which answer is correct?',
  questionType: 'MCQ',
  options: ['Correct', 'Incorrect'],
  correctAnswer: 'Correct',
  explanation: 'The first response is correct.',
  topic: 'HTTP',
  skillId,
  difficulty: 'MEDIUM',
  marks: 4,
};
const validExam = {
  title: 'HTTP fundamentals',
  description: '',
  durationMinutes: 30,
  passingMarks: 2,
  startAt: '2030-01-01T10:00:00.000Z',
  endAt: '2030-01-01T11:00:00.000Z',
  selectionMode: 'MANUAL',
  questionIds: [questionId],
};

beforeEach(() => {
  jest.clearAllMocks();
  Skill.exists.mockResolvedValue(true);
  const questionQuery = { populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([question]) };
  Question.find.mockReturnValue(questionQuery);
  Exam.create.mockImplementation(async value => ({ _id: '507f1f77bcf86cd799439018', ...value }));
});

describe('exam authoring and assignment service', () => {
  test('creates an exam from approved questions and stores a stable answer snapshot', async () => {
    const result = await examService.createExam(admin, validExam);
    expect(Question.find).toHaveBeenCalledWith({ _id: { $in: [questionId] }, status: 'APPROVED' });
    expect(result).toMatchObject({
      totalMarks: 4,
      difficulty: 'MEDIUM',
      selectionMode: 'MANUAL',
      questions: [{
        questionId,
        correctAnswer: 'Correct',
        options: ['Correct', 'Incorrect'],
        marks: 4,
      }],
      createdBy: admin._id,
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXAM_CREATED' }));
  });

  test('persists the configured secure-exam policy', async () => {
    const result = await examService.createExam(admin, {
      ...validExam,
      security: {
        requireFullscreen: true,
        requireCamera: true,
        requireMicrophone: false,
        maxViolations: 2,
        violationAction: 'REVIEW',
      },
    });

    expect(result.security).toEqual({
      requireFullscreen: true,
      requireCamera: true,
      requireMicrophone: false,
      maxViolations: 2,
      violationAction: 'REVIEW',
    });
  });

  test('does not create an exam with unapproved or unavailable questions', async () => {
    Question.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    await expect(examService.createExam(admin, validExam)).rejects.toThrow('Every selected question must be approved');
    expect(Exam.create).not.toHaveBeenCalled();
  });

  test('random selection is restricted to approved question filters and requires enough matches', async () => {
    Question.aggregate.mockResolvedValue([question]);
    const result = await examService.createExam(admin, {
      ...validExam,
      selectionMode: 'RANDOM',
      questionIds: undefined,
      randomCriteria: { count: 1, topic: 'HTTP', skillId, difficulty: 'MEDIUM' },
    });
    expect(Skill.exists).toHaveBeenCalledWith({ _id: skillId, isActive: true });
    expect(Question.aggregate).toHaveBeenCalledWith([
      { $match: { status: 'APPROVED', topic: /HTTP/i, skillId, difficulty: 'MEDIUM' } },
      { $sample: { size: 1 } },
    ]);
    expect(result.questions).toHaveLength(1);

    Question.aggregate.mockResolvedValue([]);
    await expect(examService.createExam(admin, {
      ...validExam,
      selectionMode: 'RANDOM',
      questionIds: undefined,
      randomCriteria: { count: 1, topic: 'Empty topic' },
    })).rejects.toThrow('There are only 0 approved questions');
  });

  test('calculates total marks and rejects an invalid passing threshold', async () => {
    await expect(examService.createExam(admin, { ...validExam, passingMarks: 5 }))
      .rejects.toThrow('Passing marks must be between 0 and 4');
    expect(Exam.create).not.toHaveBeenCalled();
  });

  test('mentors may assign exams only to their own assigned students', async () => {
    Exam.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439018' }) });
    User.countDocuments.mockResolvedValue(1);
    MentorStudent.distinct.mockResolvedValue([]);
    await expect(examService.assignExam(mentor, '507f1f77bcf86cd799439018', [studentId]))
      .rejects.toThrow('only assign exams to your assigned students');
    expect(ExamAssignment.bulkWrite).not.toHaveBeenCalled();
  });

  test('assignment persistence is idempotent and audit metadata contains only counts', async () => {
    Exam.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439018' }) });
    User.countDocuments.mockResolvedValue(1);
    MentorStudent.distinct.mockResolvedValue([studentId]);
    ExamAssignment.bulkWrite.mockResolvedValue({ upsertedCount: 1 });
    ExamAssignment.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ studentId: { _id: studentId, name: 'Student' } }]),
    });
    const result = await examService.assignExam(mentor, '507f1f77bcf86cd799439018', [studentId]);
    expect(result.newlyAssigned).toBe(1);
    expect(ExamAssignment.bulkWrite).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXAM_ASSIGNED',
      metadata: { studentCount: 1 },
    }));
  });

  test('revokes an assigned exam before the student starts it', async () => {
    Exam.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439018' }) });
    ExamAssignment.findOneAndUpdate.mockResolvedValue({ _id: 'assignment-id', status: 'REVOKED' });

    const result = await examService.revokeExamAssignment(admin, '507f1f77bcf86cd799439018', studentId);

    expect(ExamAssignment.findOneAndUpdate).toHaveBeenCalledWith(
      { examId: '507f1f77bcf86cd799439018', studentId, status: 'ASSIGNED' },
      { $set: { status: 'REVOKED' } },
      { new: true },
    );
    expect(result.status).toBe('REVOKED');
  });
});
