jest.mock('../src/models/Question', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  exists: jest.fn(),
}));

jest.mock('../src/models/Skill', () => ({
  exists: jest.fn(),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn(),
}));

const Question = require('../src/models/Question');
const Skill = require('../src/models/Skill');
const { writeAudit } = require('../src/middleware/auditMiddleware');
const questionService = require('../src/services/questionService');

const admin = { _id: '507f1f77bcf86cd799439013', role: 'ADMIN' };
const mentor = { _id: '507f1f77bcf86cd799439012', role: 'MENTOR' };
const skillId = '507f1f77bcf86cd799439014';
const validQuestion = {
  question: 'Which response is correct?',
  questionType: 'MCQ',
  options: ['First', 'Second'],
  correctAnswer: 'First',
  explanation: '',
  topic: 'HTTP',
  skillId,
  difficulty: 'MEDIUM',
  marks: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  Skill.exists.mockResolvedValue({ _id: skillId });
  Question.create.mockImplementation(async value => ({ _id: '507f1f77bcf86cd799439015', ...value }));
});

describe('question bank service', () => {
  test('creates valid questions as drafts and audits creation', async () => {
    const result = await questionService.createQuestion(mentor, validQuestion);
    expect(result).toMatchObject({ question: validQuestion.question, status: 'DRAFT', createdBy: mentor._id });
    expect(Question.create).toHaveBeenCalledWith(expect.objectContaining({
      questionType: 'MCQ',
      options: ['First', 'Second'],
      correctAnswer: 'First',
      createdBy: mentor._id,
      status: 'DRAFT',
    }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'QUESTION_CREATED',
      actorId: mentor._id,
      entityId: result._id,
    }));
  });

  test.each([
    [{ ...validQuestion, options: ['Only one'] }, /between 2 and 8 options/],
    [{ ...validQuestion, correctAnswer: 'Missing' }, /must match one of the options/],
    [{ ...validQuestion, questionType: 'TRUE_FALSE', options: [], correctAnswer: 'Maybe' }, /True or False/],
    [{ ...validQuestion, questionType: 'SHORT_OBJECTIVE', options: ['Option'] }, /do not use answer options/],
    [{ ...validQuestion, marks: 0 }, /between 0.25 and 100/],
  ])('rejects invalid question content before saving', async (input, message) => {
    await expect(questionService.createQuestion(admin, input)).rejects.toThrow(message);
    expect(Skill.exists).not.toHaveBeenCalled();
    expect(Question.create).not.toHaveBeenCalled();
  });

  test('requires an active skill', async () => {
    Skill.exists.mockResolvedValue(null);
    await expect(questionService.createQuestion(admin, validQuestion)).rejects.toThrow('Choose an active skill');
    expect(Question.create).not.toHaveBeenCalled();
  });

  test('mentor question queries are restricted to approved content and their own drafts', async () => {
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Question.find.mockReturnValue(query);
    Question.countDocuments.mockResolvedValue(0);
    await questionService.listQuestions(mentor, { status: 'DRAFT', search: 'HTTP' });
    expect(Question.find).toHaveBeenCalledWith(expect.objectContaining({
      $and: [
        { $or: [{ createdBy: mentor._id }, { status: 'APPROVED' }] },
        { status: 'DRAFT', createdBy: mentor._id },
        { $or: [{ question: /HTTP/i }, { topic: /HTTP/i }] },
      ],
    }));
  });

  test('students cannot call question bank operations directly', async () => {
    await expect(questionService.listQuestions({ _id: 'student', role: 'STUDENT' })).rejects.toThrow('permission');
    await expect(questionService.approveQuestion(mentor, '507f1f77bcf86cd799439015')).rejects.toThrow('permission');
    expect(Question.find).not.toHaveBeenCalled();
  });

  test('mentors cannot edit questions they do not own or drafts they no longer own', async () => {
    Question.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439015',
      createdBy: '507f1f77bcf86cd799439016',
      status: 'DRAFT',
    });
    await expect(questionService.updateQuestion(mentor, '507f1f77bcf86cd799439015', validQuestion))
      .rejects.toThrow('only edit your own draft');
    expect(Skill.exists).not.toHaveBeenCalled();
  });

  test('only admins can approve draft questions through the service operation', async () => {
    Question.findOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439015', status: 'APPROVED' });
    const approved = await questionService.approveQuestion(admin, '507f1f77bcf86cd799439015');
    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439015', status: 'DRAFT' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'APPROVED', approvedBy: admin._id }) }),
      { new: true, runValidators: true },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'QUESTION_APPROVED', entityId: approved._id }));
  });
});
