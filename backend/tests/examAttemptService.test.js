jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomInt: jest.fn(),
}));
jest.mock('../src/models/Exam', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../src/models/ExamAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../src/models/ExamAttempt', () => ({
  create: jest.fn(),
  exists: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../src/models/MentorStudent', () => ({
  find: jest.fn(),
}));

jest.mock('../src/models/Skill', () => ({
  find: jest.fn(),
}));

jest.mock('../src/models/Achievement', () => ({
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/models/AchievementSkill', () => ({
  updateOne: jest.fn(),
}));

jest.mock('../src/services/scoringService', () => ({
  recalculateForUser: jest.fn(),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn(),
}));

const Exam = require('../src/models/Exam');
const { randomInt } = require('node:crypto');
const ExamAssignment = require('../src/models/ExamAssignment');
const ExamAttempt = require('../src/models/ExamAttempt');
const MentorStudent = require('../src/models/MentorStudent');
const Skill = require('../src/models/Skill');
const Achievement = require('../src/models/Achievement');
const AchievementSkill = require('../src/models/AchievementSkill');
const { recalculateForUser } = require('../src/services/scoringService');
const { writeAudit } = require('../src/middleware/auditMiddleware');
const attemptService = require('../src/services/examAttemptService');

const studentId = '507f1f77bcf86cd799439011';
const examId = '507f1f77bcf86cd799439012';
const assignmentId = '507f1f77bcf86cd799439013';
const attemptId = '507f1f77bcf86cd799439014';
const questionId = '507f1f77bcf86cd799439015';
const now = new Date();
const exam = {
  _id: examId,
  title: 'HTTP basics',
  description: '',
  durationMinutes: 30,
  totalMarks: 2,
  passingMarks: 1,
  startAt: new Date(now.getTime() - 1000),
  endAt: new Date(now.getTime() + 60_000),
  status: 'PUBLISHED',
  questions: [{
    questionId,
    question: 'Which option is correct?',
    questionType: 'MCQ',
    options: ['A', 'B'],
    correctAnswer: 'A',
    explanation: 'A is correct.',
    topic: 'HTTP',
    skillId: '507f1f77bcf86cd799439016',
    difficulty: 'EASY',
    marks: 2,
  }],
};
const activeAttempt = {
  _id: attemptId,
  examId,
  assignmentId,
  studentId,
  questions: [{
    questionId,
    question: 'Which option is correct?',
    questionType: 'MCQ',
    options: ['A', 'B'],
    correctAnswer: 'A',
    explanation: 'A is correct.',
    topic: 'HTTP',
    skillId: '507f1f77bcf86cd799439016',
    difficulty: 'EASY',
    marks: 2,
  }],
  answers: [],
  startedAt: now,
  expiresAt: new Date(now.getTime() + 60_000),
  status: 'IN_PROGRESS',
  suspiciousActivityCount: 0,
  activityEvents: [],
  save: jest.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  jest.resetAllMocks();
  randomInt.mockImplementation(max => Math.floor(Math.random() * max));
  ExamAssignment.findOne.mockResolvedValue({ _id: assignmentId, status: 'ASSIGNED' });
  ExamAttempt.findOne.mockResolvedValue(null);
  ExamAttempt.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(null),
  });
  ExamAttempt.exists.mockResolvedValue(null);
  Exam.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(exam),
  });
  Exam.findById.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(exam),
  });
  ExamAttempt.create.mockImplementation(async value => ({ _id: attemptId, answers: [], ...value }));
  Skill.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([{ _id: '507f1f77bcf86cd799439016', name: 'Web Development' }]),
  });
  Achievement.findOneAndUpdate.mockImplementation(async (filter, update) => ({
    _id: `achievement-${String(update.$setOnInsert.data.attemptId)}-${String(update.$setOnInsert.data.assessmentId)}`,
    ...update.$setOnInsert,
  }));
  AchievementSkill.updateOne.mockResolvedValue({ upsertedCount: 1 });
  recalculateForUser.mockResolvedValue([]);
});

describe('student exam attempt service', () => {
  test('starts an assigned exam and never returns answer keys to the student', async () => {
    const result = await attemptService.startAttempt(studentId, examId);
    expect(ExamAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      studentId,
      examId,
      assignmentId,
      status: 'IN_PROGRESS',
      questions: [expect.objectContaining({ correctAnswer: 'A' })],
    }));
    expect(result.questions[0]).not.toHaveProperty('correctAnswer');
    expect(result.questions[0]).not.toHaveProperty('explanation');
    expect(result.questions[0]).toMatchObject({ question: 'Which option is correct?', answer: '' });
    expect(ExamAssignment.updateOne).toHaveBeenCalledWith(
      { _id: assignmentId, status: 'ASSIGNED' },
      { $set: { status: 'IN_PROGRESS' } },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXAM_STARTED', actorId: studentId }));
  });

  test('randomizes persisted question and MCQ option order for a new attempt', async () => {
    const questions = ['q1', 'q2', 'q3'].map((label, index) => ({
      ...exam.questions[0],
      questionId: `507f1f77bcf86cd7994390${20 + index}`,
      question: label,
      options: ['A', 'B', 'C'],
      correctAnswer: 'A',
    }));
    Exam.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...exam, questions }),
    });
    randomInt.mockReturnValue(0);
    await attemptService.startAttempt(studentId, examId);
    const savedQuestions = ExamAttempt.create.mock.calls[0][0].questions;
    expect(savedQuestions.map(question => question.question)).not.toEqual(['q1', 'q2', 'q3']);
    expect(savedQuestions.map(question => question.question).sort()).toEqual(['q1', 'q2', 'q3']);
    expect(savedQuestions.every(question => question.options.length === 3 && question.correctAnswer === 'A')).toBe(true);
    expect(savedQuestions.every(question => question.options[0] !== 'A')).toBe(true);
  });

  test('refuses unassigned exams and a second concurrent attempt', async () => {
    ExamAssignment.findOne.mockResolvedValue(null);
    await expect(attemptService.startAttempt(studentId, examId)).rejects.toThrow('not assigned');

    ExamAssignment.findOne.mockResolvedValue({ _id: assignmentId, status: 'ASSIGNED' });
    ExamAttempt.exists.mockResolvedValue({ _id: 'another-attempt' });
    await expect(attemptService.startAttempt(studentId, examId)).rejects.toThrow('current exam attempt');
    expect(ExamAttempt.create).not.toHaveBeenCalled();
  });

  test('resumes the current attempt rather than creating a duplicate', async () => {
    ExamAttempt.findOne.mockResolvedValue(activeAttempt);
    const result = await attemptService.startAttempt(studentId, examId);
    expect(result.id).toBe(attemptId);
    expect(ExamAttempt.create).not.toHaveBeenCalled();
  });

  test('does not return an attempt if its exam details are missing', async () => {
    ExamAttempt.findOne.mockResolvedValue(activeAttempt);
    Exam.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(attemptService.getAttempt(studentId, attemptId)).rejects.toThrow('Exam details are unavailable');
  });

  test('autosaves valid answers and rejects invalid options or questions', async () => {
    ExamAttempt.findOne.mockResolvedValue(activeAttempt);
    const result = await attemptService.saveAnswer(studentId, attemptId, { questionId, answer: 'B' });
    expect(activeAttempt.answers).toEqual([expect.objectContaining({ questionId, answer: 'B' })]);
    expect(activeAttempt.save).toHaveBeenCalled();
    expect(result.questions[0].answer).toBe('B');

    await expect(attemptService.saveAnswer(studentId, attemptId, { questionId, answer: 'Not an option' }))
      .rejects.toThrow('available options');
    await expect(attemptService.saveAnswer(studentId, attemptId, {
      questionId: '507f1f77bcf86cd799439099', answer: 'A',
    })).rejects.toThrow('does not belong');
  });

  test('evaluates objectively gradable answers with breakdowns without double-awarding a submission', async () => {
    const secondQuestionId = '507f1f77bcf86cd799439017';
    const thirdQuestionId = '507f1f77bcf86cd799439018';
    const fourthQuestionId = '507f1f77bcf86cd799439020';
    const secondSkillId = '507f1f77bcf86cd799439019';
    const submitted = {
      ...activeAttempt,
      status: 'SUBMITTED',
      questions: [
        { ...activeAttempt.questions[0], skillId: '507f1f77bcf86cd799439016' },
        {
          questionId: secondQuestionId, question: 'Is the request safe?', questionType: 'TRUE_FALSE',
          options: ['True', 'False'], correctAnswer: 'True', topic: 'Auth', skillId: secondSkillId,
          difficulty: 'MEDIUM', marks: 1,
        },
        {
          questionId: thirdQuestionId, question: 'HTTP method?', questionType: 'SHORT_OBJECTIVE',
          options: [], correctAnswer: 'get /api', topic: 'HTTP', skillId: '507f1f77bcf86cd799439016',
          difficulty: 'EASY', marks: 1,
        },
        {
          questionId: fourthQuestionId, question: 'Token type?', questionType: 'SHORT_OBJECTIVE',
          options: [], correctAnswer: 'bearer', topic: 'Auth', skillId: secondSkillId,
          difficulty: 'HARD', marks: 1,
        },
      ],
      answers: [
        { questionId, answer: ' a ' },
        { questionId: secondQuestionId, answer: 'false' },
        { questionId: thirdQuestionId, answer: 'GET   /api' },
      ],
      result: undefined,
    };
    submitted.questions[0].skillId = '507f1f77bcf86cd799439016';
    ExamAttempt.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(submitted),
    });
    const evaluatedResult = {
      score: 3,
      percentage: 60,
      passed: false,
      correctCount: 2,
      incorrectCount: 1,
      unansweredCount: 1,
      topicWise: [
        { label: 'HTTP', score: 3, maxScore: 3, correctCount: 2, incorrectCount: 0, unansweredCount: 0 },
        { label: 'Auth', score: 0, maxScore: 2, correctCount: 0, incorrectCount: 1, unansweredCount: 1 },
      ],
      skillWise: [
        { label: 'Web Development', skillId: '507f1f77bcf86cd799439016', score: 3, maxScore: 3, correctCount: 2, incorrectCount: 0, unansweredCount: 0 },
        { label: 'Inactive skill', skillId: secondSkillId, score: 0, maxScore: 2, correctCount: 0, incorrectCount: 1, unansweredCount: 1 },
      ],
      difficultyWise: [
        { label: 'EASY', score: 3, maxScore: 3, correctCount: 2, incorrectCount: 0, unansweredCount: 0 },
        { label: 'MEDIUM', score: 0, maxScore: 1, correctCount: 0, incorrectCount: 1, unansweredCount: 0 },
        { label: 'HARD', score: 0, maxScore: 1, correctCount: 0, incorrectCount: 0, unansweredCount: 1 },
      ],
      evaluatedAt: expect.any(Date),
    };
    Exam.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ passingMarks: 4, title: 'HTTP basics' }),
    });
    ExamAttempt.findOneAndUpdate.mockImplementation(async (filter, update) => {
      if (update.$set.evidenceSyncStartedAt) {
        submitted.evidenceSyncStartedAt = update.$set.evidenceSyncStartedAt;
      } else if (update.$set.evidenceSyncedAt) {
        submitted.evidenceSyncedAt = update.$set.evidenceSyncedAt;
        delete submitted.evidenceSyncStartedAt;
      } else {
        submitted.result = update.$set.result;
      }
      if (filter.evidenceSyncStartedAt && update.$set.evidenceSyncStartedAt) {
        return submitted;
      }
      return submitted;
    });
    const result = await attemptService.evaluateSubmittedAttempt(attemptId);

    expect(result.result).toEqual(evaluatedResult);
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenNthCalledWith(1,
      { _id: attemptId, status: 'SUBMITTED', result: { $exists: false } },
      { $set: { result: expect.objectContaining({ score: 3, percentage: 60, passed: false }) } },
      { new: true, runValidators: true },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXAM_EVALUATED' }));
    expect(Achievement.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: studentId, evidenceFingerprint: expect.any(String) }),
      { $setOnInsert: expect.objectContaining({
        type: 'ASSESSMENT',
        status: 'VERIFIED',
        source: 'PLATFORM',
        sourceExamAttemptId: attemptId,
        data: expect.objectContaining({
          sourceType: 'EXAM',
          assessmentId: examId,
          attemptId,
        }),
      }) },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
    expect(Achievement.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(AchievementSkill.updateOne).toHaveBeenCalledTimes(2);
    expect(recalculateForUser).toHaveBeenCalledWith(studentId, { reason: 'exam_result_evaluated' });

    submitted.result = evaluatedResult;
    ExamAttempt.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(submitted) });
    await attemptService.evaluateSubmittedAttempt(attemptId);
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(Achievement.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(recalculateForUser).toHaveBeenCalledTimes(1);
  });

  test('automatically submits an expired attempt and completes its assignment', async () => {
    const expired = { ...activeAttempt, expiresAt: new Date(Date.now() - 1000), answers: [] };
    const submitted = {
      ...expired,
      status: 'SUBMITTED',
      submittedAt: expired.expiresAt,
      evidenceSyncedAt: undefined,
    };
    ExamAttempt.findOne.mockResolvedValueOnce(expired).mockResolvedValueOnce(submitted);
    ExamAttempt.findById.mockImplementation(() => {
      const query = Promise.resolve(submitted);
      query.select = jest.fn().mockResolvedValue(submitted);
      return query;
    });
    Exam.findById.mockImplementation(() => ({
      select: jest.fn(selection => selection === 'passingMarks' || selection === 'title'
        ? Promise.resolve({ passingMarks: 1, title: 'HTTP basics' })
        : { lean: jest.fn().mockResolvedValue(exam) }),
    }));
    ExamAttempt.findOneAndUpdate.mockImplementation(async (filter, update) => {
      if (update.$set.status === 'SUBMITTED') {
        submitted.status = 'SUBMITTED';
        submitted.submittedAt = update.$set.submittedAt;
      } else if (update.$set.result) submitted.result = update.$set.result;
      else if (update.$set.evidenceSyncStartedAt) submitted.evidenceSyncStartedAt = update.$set.evidenceSyncStartedAt;
      else if (update.$set.evidenceSyncedAt) {
        submitted.evidenceSyncedAt = update.$set.evidenceSyncedAt;
        delete submitted.evidenceSyncStartedAt;
      }
      return submitted;
    });
    const result = await attemptService.submitAttempt(studentId, attemptId);
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: attemptId, status: 'IN_PROGRESS' },
      { $set: { status: 'SUBMITTED', submittedAt: expired.expiresAt } },
      { new: true, runValidators: true },
    );
    expect(ExamAssignment.updateOne).toHaveBeenCalledWith(
      { _id: assignmentId },
      { $set: { status: 'COMPLETED' } },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXAM_SUBMITTED',
      metadata: expect.objectContaining({ automatic: true }),
    }));
    expect(result.status).toBe('SUBMITTED');
  });

  test('students receive only their own evaluated results', async () => {
    const results = [{ _id: attemptId, studentId, examId, result: { score: 2 } }];
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(results),
    };
    ExamAttempt.find.mockReturnValue(query);
    ExamAttempt.countDocuments.mockResolvedValue(1);
    const result = await attemptService.listStudentResults(studentId);
    expect(ExamAttempt.find).toHaveBeenCalledWith({ studentId, status: 'SUBMITTED', result: { $exists: true } });
    expect(result.results).toHaveLength(1);
  });

  test('mentors see results only for their currently assigned students', async () => {
    MentorStudent.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ studentId }]),
      }),
    });
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    ExamAttempt.find.mockReturnValue(query);
    ExamAttempt.countDocuments.mockResolvedValue(0);
    const result = await attemptService.listResults({ _id: 'mentor-id', role: 'MENTOR' });
    expect(ExamAttempt.find).toHaveBeenCalledWith({
      status: 'SUBMITTED',
      result: { $exists: true },
      studentId: { $in: [studentId] },
    });
    expect(result.results).toEqual([]);
  });

  test('expiry worker retries persisted submissions that still need evaluation', async () => {
    const noPendingResultsQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const pendingEvidenceQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: attemptId }]),
    };
    const noExpiredQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    ExamAttempt.find.mockReturnValueOnce(noExpiredQuery).mockReturnValueOnce(noPendingResultsQuery).mockReturnValueOnce(pendingEvidenceQuery);
    const submitted = { ...activeAttempt, status: 'SUBMITTED', result: {
      score: 1, percentage: 50, passed: true, evaluatedAt: new Date(), correctCount: 1, incorrectCount: 0, unansweredCount: 0,
      skillWise: [{ skillId: '507f1f77bcf86cd799439016', label: 'Web Development', score: 1, maxScore: 2 }],
    }, evidenceSyncedAt: undefined };
    ExamAttempt.findById.mockResolvedValue(submitted);
    Exam.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ title: 'HTTP basics' }) });
    ExamAttempt.findOneAndUpdate.mockImplementation(async (filter, update) => {
      if (update.$set.evidenceSyncStartedAt) submitted.evidenceSyncStartedAt = update.$set.evidenceSyncStartedAt;
      if (update.$set.evidenceSyncedAt) {
        submitted.evidenceSyncedAt = update.$set.evidenceSyncedAt;
        delete submitted.evidenceSyncStartedAt;
      }
      return submitted;
    });

    await expect(attemptService.expireDueAttempts()).resolves.toBe(0);
    expect(ExamAttempt.find).toHaveBeenNthCalledWith(3, expect.objectContaining({
      status: 'SUBMITTED', result: { $exists: true }, evidenceSyncedAt: { $exists: false },
      $or: expect.any(Array),
    }));
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: attemptId, status: 'SUBMITTED', evidenceSyncStartedAt: expect.any(Date), evidenceSyncedAt: { $exists: false } },
      { $set: { evidenceSyncedAt: expect.any(Date) }, $unset: { evidenceSyncStartedAt: '' } },
      { new: true },
    );
    expect(recalculateForUser).toHaveBeenCalledWith(studentId, { reason: 'exam_result_evaluated' });
  });

  test('records tab changes without failing an attempt and throttles duplicate events', async () => {
    const recordedAt = new Date();
    const inProgress = { ...activeAttempt, expiresAt: new Date(Date.now() + 60_000) };
    ExamAttempt.findOne.mockResolvedValueOnce(inProgress).mockResolvedValueOnce(inProgress).mockResolvedValueOnce({
      ...activeAttempt,
      expiresAt: inProgress.expiresAt,
      suspiciousActivityCount: 1,
      activityEvents: [{ type: 'TAB_HIDDEN', occurredAt: recordedAt }],
    });
    ExamAttempt.findOneAndUpdate.mockResolvedValueOnce({
      ...activeAttempt,
      suspiciousActivityCount: 1,
    }).mockResolvedValueOnce(null);
    const result = await attemptService.recordActivity(studentId, attemptId, 'TAB_HIDDEN');
    expect(result).toEqual({ suspiciousActivityCount: 1, recorded: true });
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({
      _id: attemptId,
      studentId,
      status: 'IN_PROGRESS',
      activityEvents: expect.objectContaining({ $not: expect.any(Object) }),
    }), expect.objectContaining({
      $inc: { suspiciousActivityCount: 1 },
      $push: { activityEvents: expect.objectContaining({ $each: [expect.objectContaining({ type: 'TAB_HIDDEN' })], $slice: -100 }) },
    }), { new: true, runValidators: true });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXAM_ACTIVITY_RECORDED' }));

    const duplicate = await attemptService.recordActivity(studentId, attemptId, 'TAB_HIDDEN');
    expect(duplicate).toEqual({ suspiciousActivityCount: 1, recorded: false });
    expect(ExamAttempt.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  test('does not accept activity logs for another student attempt', async () => {
    ExamAttempt.findOne.mockResolvedValue(null);
    await expect(attemptService.recordActivity('507f1f77bcf86cd799439099', attemptId, 'TAB_HIDDEN'))
      .rejects.toThrow('not found');
    expect(ExamAttempt.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
