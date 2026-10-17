const { createHash, randomInt } = require('node:crypto');
const Achievement = require('../models/Achievement');
const AchievementSkill = require('../models/AchievementSkill');
const Exam = require('../models/Exam');
const ExamAssignment = require('../models/ExamAssignment');
const ExamAttempt = require('../models/ExamAttempt');
const MentorStudent = require('../models/MentorStudent');
const Skill = require('../models/Skill');
const { writeAudit } = require('../middleware/auditMiddleware');
const { recalculateForUser } = require('./scoringService');
const { AppError } = require('../utils/errors');

const DEFAULT_SECURITY = Object.freeze({
  requireFullscreen: true,
  requireCamera: true,
  requireMicrophone: true,
  maxViolations: 1,
  violationAction: 'AUTO_SUBMIT',
});

function securityPolicy(exam) {
  return { ...DEFAULT_SECURITY, ...(exam?.security || DEFAULT_SECURITY) };
}

function safeAttempt(attempt, exam) {
  if (!exam) throw new AppError('Exam details are unavailable for this attempt.', 409);
  const answers = new Map(attempt.answers.map(entry => [String(entry.questionId), entry.answer]));
  return {
    id: String(attempt._id),
    exam: {
      id: String(exam._id),
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      startAt: exam.startAt,
      endAt: exam.endAt,
      security: securityPolicy(exam),
    },
    questions: attempt.questions.map((question, index) => ({
      id: String(question.questionId),
      number: index + 1,
      question: question.question,
      questionType: question.questionType,
      options: question.options,
      topic: question.topic,
      difficulty: question.difficulty,
      marks: question.marks,
      answer: answers.get(String(question.questionId)) || '',
    })),
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt || null,
    status: attempt.status,
    result: attempt.result || null,
    suspiciousActivityCount: attempt.suspiciousActivityCount || 0,
    serverTime: new Date(),
  };
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function normalizedAnswer(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildPerformanceRows(questions, answers, keyFor, labelFor) {
  const groups = new Map();
  for (const question of questions) {
    const key = keyFor(question);
    if (!groups.has(key)) groups.set(key, {
      label: labelFor(question),
      ...(keyFor === skillKey ? { skillId: question.skillId } : {}),
      score: 0,
      maxScore: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
    });
    const group = groups.get(key);
    group.maxScore += question.marks;
    const answer = normalizedAnswer(answers.get(String(question.questionId)));
    if (!answer) group.unansweredCount += 1;
    else if (answer === normalizedAnswer(question.correctAnswer)) {
      group.correctCount += 1;
      group.score += question.marks;
    } else group.incorrectCount += 1;
  }
  return [...groups.values()].map(group => ({
    ...group,
    score: Number(group.score.toFixed(2)),
    maxScore: Number(group.maxScore.toFixed(2)),
  }));
}

function topicKey(question) { return question.topic; }
function skillKey(question) { return String(question.skillId); }
function difficultyKey(question) { return question.difficulty; }

async function ensureExamEvidence(attempt) {
  if (!attempt?.result || attempt.evidenceSyncedAt) return attempt;
  const now = new Date();
  const leaseExpiredAt = new Date(now.getTime() - 30_000);
  const claimed = await ExamAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      status: 'SUBMITTED',
      result: { $exists: true },
      evidenceSyncedAt: { $exists: false },
      $or: [
        { evidenceSyncStartedAt: { $exists: false } },
        { evidenceSyncStartedAt: { $lte: leaseExpiredAt } },
      ],
    },
    { $set: { evidenceSyncStartedAt: now } },
    { new: true },
  );
  if (!claimed) return await ExamAttempt.findById(attempt._id) || attempt;
  const exam = await Exam.findById(claimed.examId).select('title');
  if (!exam) throw new AppError('Exam details are unavailable for evidence integration.', 409);
  const difficultyValues = { EASY: 0.25, MEDIUM: 0.5, HARD: 1 };
  for (const performance of claimed.result.skillWise) {
    const skillId = String(performance.skillId || '');
    const matchedQuestions = claimed.questions.filter(question => String(question.skillId) === skillId);
    if (!skillId || !matchedQuestions.length) throw new AppError('Exam skill breakdown is incomplete.', 409);
    const difficulty = matchedQuestions.reduce((sum, question) => sum + difficultyValues[question.difficulty], 0) / matchedQuestions.length;
    const topics = [...new Set(matchedQuestions.map(question => question.topic))].join(', ').slice(0, 120);
    const fingerprint = createHash('sha256')
      .update(`${claimed.studentId}:${claimed._id}:${skillId}`)
      .digest('hex');
    const evidence = await Achievement.findOneAndUpdate(
      { userId: claimed.studentId, evidenceFingerprint: fingerprint },
      {
        $setOnInsert: {
          userId: claimed.studentId,
          type: 'ASSESSMENT',
          title: `${exam.title} - ${performance.label}`.slice(0, 150),
          description: `Automatically verified exam result for ${exam.title} (${performance.label}).`,
          data: {
            sourceType: 'EXAM',
            assessmentId: String(claimed.examId),
            attemptId: String(claimed._id),
            assessmentName: exam.title,
            score: performance.score,
            totalMarks: performance.maxScore,
            percentage: performance.maxScore ? Number((performance.score / performance.maxScore * 100).toFixed(2)) : 0,
            passed: claimed.result.passed,
            difficulty,
            topic: topics,
          },
          sourceExamAttemptId: claimed._id,
          evidenceFingerprint: fingerprint,
          status: 'VERIFIED',
          source: 'PLATFORM',
          submittedAt: claimed.submittedAt || claimed.result.evaluatedAt,
          reviewedAt: claimed.result.evaluatedAt,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (!evidence) throw new AppError('Exam evidence could not be stored.', 500);
    await AchievementSkill.updateOne(
      { achievementId: evidence._id, skillId: performance.skillId },
      { $setOnInsert: { relevance: 1 } },
      { upsert: true },
    );
  }
  await recalculateForUser(claimed.studentId, { reason: 'exam_result_evaluated' });
  const synced = await ExamAttempt.findOneAndUpdate(
    { _id: claimed._id, status: 'SUBMITTED', evidenceSyncStartedAt: now, evidenceSyncedAt: { $exists: false } },
    { $set: { evidenceSyncedAt: new Date() }, $unset: { evidenceSyncStartedAt: '' } },
    { new: true },
  );
  return synced || await ExamAttempt.findById(claimed._id) || claimed;
}

async function evaluateSubmittedAttempt(attemptId) {
  const attempt = await ExamAttempt.findById(attemptId).select('+questions.correctAnswer');
  if (!attempt || attempt.status !== 'SUBMITTED') return attempt;
  if (attempt.result) return ensureExamEvidence(attempt);
  const exam = await Exam.findById(attempt.examId).select('passingMarks');
  if (!exam) throw new AppError('Exam details are unavailable for result evaluation.', 409);
  const answers = new Map(attempt.answers.map(item => [String(item.questionId), item.answer]));
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let score = 0;
  for (const question of attempt.questions) {
    const answer = normalizedAnswer(answers.get(String(question.questionId)));
    if (!answer) unansweredCount += 1;
    else if (answer === normalizedAnswer(question.correctAnswer)) {
      correctCount += 1;
      score += question.marks;
    } else incorrectCount += 1;
  }
  const maxScore = Number(attempt.questions.reduce((sum, question) => sum + question.marks, 0).toFixed(2));
  score = Number(score.toFixed(2));
  const skillIds = [...new Set(attempt.questions.map(question => String(question.skillId)))];
  const skills = await Skill.find({ _id: { $in: skillIds } }).select('name').lean();
  const skillNames = new Map(skills.map(skill => [String(skill._id), skill.name]));
  const evaluatedAt = new Date();
  const result = {
    score,
    percentage: maxScore ? Number((score / maxScore * 100).toFixed(2)) : 0,
    passed: score >= exam.passingMarks,
    correctCount,
    incorrectCount,
    unansweredCount,
    evaluatedAt,
    topicWise: buildPerformanceRows(attempt.questions, answers, topicKey, question => question.topic),
    skillWise: buildPerformanceRows(attempt.questions, answers, skillKey, question => skillNames.get(String(question.skillId)) || 'Inactive skill'),
    difficultyWise: buildPerformanceRows(attempt.questions, answers, difficultyKey, question => question.difficulty),
  };
  const evaluated = await ExamAttempt.findOneAndUpdate(
    { _id: attemptId, status: 'SUBMITTED', result: { $exists: false } },
    { $set: { result } },
    { new: true, runValidators: true },
  );
  const finalAttempt = evaluated || await ExamAttempt.findById(attemptId).select('+questions.correctAnswer');
  if (evaluated) {
    await writeAudit({
      actorId: attempt.studentId,
      action: 'EXAM_EVALUATED',
      entity: 'ExamAttempt',
      entityId: attemptId,
      metadata: { score, percentage: result.percentage, passed: result.passed },
    });
  }
  return ensureExamEvidence(finalAttempt);
}

async function listStudentExams(studentId) {
  const assignments = await ExamAssignment.find({ studentId })
    .populate({ path: 'examId', select: 'title description durationMinutes totalMarks passingMarks startAt endAt status' })
    .sort({ createdAt: -1 }).lean();
  const now = Date.now();
  return assignments.filter(assignment => assignment.examId).map(assignment => {
    const exam = assignment.examId;
    const category = assignment.status === 'COMPLETED' || exam.status !== 'PUBLISHED' || now >= new Date(exam.endAt).getTime()
      ? 'COMPLETED'
      : now < new Date(exam.startAt).getTime() ? 'UPCOMING' : 'ACTIVE';
    return {
      assignmentId: String(assignment._id),
      status: assignment.status,
      category,
      exam: {
        id: String(exam._id),
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        passingMarks: exam.passingMarks,
        startAt: exam.startAt,
        endAt: exam.endAt,
      },
    };
  });
}

async function finalizeAttempt(attempt, automatic) {
  const submittedAt = automatic ? attempt.expiresAt : new Date();
  const saved = await ExamAttempt.findOneAndUpdate(
    { _id: attempt._id, status: 'IN_PROGRESS' },
    { $set: { status: 'SUBMITTED', submittedAt } },
    { new: true, runValidators: true },
  );
  const finalAttempt = saved || await ExamAttempt.findById(attempt._id);
  if (finalAttempt?.status === 'SUBMITTED') {
    await ExamAssignment.updateOne({ _id: finalAttempt.assignmentId }, { $set: { status: 'COMPLETED' } });
    if (saved) {
      await writeAudit({
        actorId: finalAttempt.studentId,
        action: 'EXAM_SUBMITTED',
        entity: 'ExamAttempt',
        entityId: finalAttempt._id,
        metadata: { automatic, answeredCount: finalAttempt.answers.length },
      });
    }
    await evaluateSubmittedAttempt(finalAttempt._id);
  }
  return finalAttempt;
}

async function ownedAttempt(studentId, attemptId) {
  const attempt = await ExamAttempt.findOne({ _id: attemptId, studentId });
  if (!attempt) throw new AppError('Exam attempt not found.', 404);
  return attempt;
}

async function startAttempt(studentId, examId) {
  const assignment = await ExamAssignment.findOne({ examId, studentId });
  if (!assignment) throw new AppError('This exam is not assigned to your account.', 404);
  const existing = await ExamAttempt.findOne({ assignmentId: assignment._id, status: 'IN_PROGRESS' });
  if (existing) {
    const resumed = existing.expiresAt <= new Date() ? await finalizeAttempt(existing, true) : existing;
    const exam = await Exam.findById(examId).select('-questions.correctAnswer -questions.explanation').lean();
    return safeAttempt(resumed, exam);
  }
  if (assignment.status !== 'ASSIGNED') throw new AppError('This exam attempt has already been submitted.', 409);
  if (await ExamAttempt.exists({ studentId, status: 'IN_PROGRESS' })) {
    throw new AppError('Finish your current exam attempt before starting another.', 409);
  }
  const now = new Date();
  const exam = await Exam.findOne({ _id: examId, status: 'PUBLISHED', startAt: { $lte: now }, endAt: { $gt: now } })
    .select('title description durationMinutes totalMarks passingMarks startAt endAt questions')
    .lean();
  if (!exam) throw new AppError('This exam is not currently available.', 409);
  const expiresAt = new Date(Math.min(
    now.getTime() + exam.durationMinutes * 60 * 1000,
    new Date(exam.endAt).getTime(),
  ));
  let attempt;
  try {
    attempt = await ExamAttempt.create({
      examId: exam._id,
      assignmentId: assignment._id,
      studentId,
      questions: shuffled(exam.questions).map(question => ({
        questionId: question.questionId,
        question: question.question,
        questionType: question.questionType,
        options: question.questionType === 'MCQ' ? shuffled(question.options) : question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        topic: question.topic,
        skillId: question.skillId,
        difficulty: question.difficulty,
        marks: question.marks,
      })),
      startedAt: now,
      expiresAt,
      status: 'IN_PROGRESS',
    });
  } catch (error) {
    if (error.code === 11000) {
      const active = await ExamAttempt.findOne({ studentId, status: 'IN_PROGRESS' });
      if (active) {
        if (String(active.assignmentId) === String(assignment._id)) return safeAttempt(active, exam);
        throw new AppError('Finish your current exam attempt before starting another.', 409);
      }
    }
    throw error;
  }
  await ExamAssignment.updateOne({ _id: assignment._id, status: 'ASSIGNED' }, { $set: { status: 'IN_PROGRESS' } });
  await writeAudit({
    actorId: studentId,
    action: 'EXAM_STARTED',
    entity: 'ExamAttempt',
    entityId: attempt._id,
    metadata: { examId: String(exam._id), questionCount: attempt.questions.length, expiresAt },
  });
  return safeAttempt(attempt, exam);
}

async function getAttempt(studentId, attemptId) {
  let attempt = await ownedAttempt(studentId, attemptId);
  if (attempt.status === 'IN_PROGRESS' && attempt.expiresAt <= new Date()) {
    attempt = await finalizeAttempt(attempt, true);
  }
  if (attempt.status === 'SUBMITTED') {
    attempt = attempt.result ? await ensureExamEvidence(attempt) : await evaluateSubmittedAttempt(attempt._id);
  }
  if (!attempt) throw new AppError('Exam attempt not found.', 404);
  const exam = await Exam.findById(attempt.examId).select('-questions.correctAnswer -questions.explanation').lean();
  return safeAttempt(attempt, exam);
}

async function saveAnswer(studentId, attemptId, { questionId, answer }) {
  const attempt = await ownedAttempt(studentId, attemptId);
  if (attempt.status !== 'IN_PROGRESS') throw new AppError('This exam has already been submitted.', 409);
  if (attempt.expiresAt <= new Date()) {
    const submitted = await finalizeAttempt(attempt, true);
    const exam = await Exam.findById(submitted.examId).select('-questions.correctAnswer -questions.explanation').lean();
    return safeAttempt(submitted, exam);
  }
  const question = attempt.questions.find(item => String(item.questionId) === String(questionId));
  if (!question) throw new AppError('This question does not belong to the current exam.', 400);
  if (typeof answer !== 'string' || answer.trim().length > 1000) throw new AppError('Answer must be text up to 1000 characters.', 400);
  const normalized = answer.trim();
  if (question.questionType === 'MCQ' && normalized && !question.options.includes(normalized)) {
    throw new AppError('Choose one of the available options.', 400);
  }
  if (question.questionType === 'TRUE_FALSE' && normalized && !['true', 'false'].includes(normalized.toLowerCase())) {
    throw new AppError('Choose True or False.', 400);
  }
  if (question.questionType === 'SHORT_OBJECTIVE' && !normalized) {
    throw new AppError('Enter an answer before saving.', 400);
  }
  const current = attempt.answers.find(item => String(item.questionId) === String(questionId));
  if (current) {
    current.answer = normalized;
    current.savedAt = new Date();
  } else if (normalized) {
    attempt.answers.push({ questionId, answer: normalized, savedAt: new Date() });
  }
  await attempt.save();
  const exam = await Exam.findById(attempt.examId).select('-questions.correctAnswer -questions.explanation').lean();
  return safeAttempt(attempt, exam);
}

async function recordActivity(studentId, attemptId, type) {
  if (!['TAB_HIDDEN', 'FULLSCREEN_EXITED', 'CAMERA_DENIED', 'MICROPHONE_DENIED'].includes(type)) throw new AppError('Activity type is invalid.', 400);
  const attempt = await ownedAttempt(studentId, attemptId);
  const now = new Date();
  if (attempt.status !== 'IN_PROGRESS' || attempt.expiresAt <= now) {
    if (attempt.status === 'IN_PROGRESS') await finalizeAttempt(attempt, true);
    throw new AppError('This exam is no longer in progress.', 409);
  }
  const cutoff = new Date(now.getTime() - 10_000);
  const recorded = await ExamAttempt.findOneAndUpdate(
    {
      _id: attemptId,
      studentId,
      status: 'IN_PROGRESS',
      expiresAt: { $gt: now },
      activityEvents: { $not: { $elemMatch: { type, occurredAt: { $gte: cutoff } } } },
    },
    {
      $inc: { suspiciousActivityCount: 1 },
      $push: { activityEvents: { $each: [{ type, occurredAt: now }], $slice: -100 } },
    },
    { new: true, runValidators: true },
  );
  if (!recorded) {
    const current = await ownedAttempt(studentId, attemptId);
    if (current.status !== 'IN_PROGRESS') throw new AppError('This exam is no longer in progress.', 409);
    if (current.expiresAt <= new Date()) {
      await finalizeAttempt(current, true);
      throw new AppError('This exam is no longer in progress.', 409);
    }
    return { suspiciousActivityCount: current.suspiciousActivityCount || 0, recorded: false };
  }
  const exam = await Exam.findById(attempt.examId).select('security').lean();
  const policy = securityPolicy(exam);
  const autoSubmitted = type === 'FULLSCREEN_EXITED'
    || (policy.violationAction === 'AUTO_SUBMIT'
      && recorded.suspiciousActivityCount >= policy.maxViolations);
  if (autoSubmitted) await finalizeAttempt(recorded, true);
  await writeAudit({
    actorId: studentId,
    action: 'EXAM_ACTIVITY_RECORDED',
    entity: 'ExamAttempt',
    entityId: attemptId,
    metadata: { type, suspiciousActivityCount: recorded.suspiciousActivityCount },
  });
  return { suspiciousActivityCount: recorded.suspiciousActivityCount, recorded: true, autoSubmitted };
}

async function submitAttempt(studentId, attemptId) {
  const attempt = await ownedAttempt(studentId, attemptId);
  if (attempt.status === 'SUBMITTED') return getAttempt(studentId, attemptId);
  const automatic = attempt.expiresAt <= new Date();
  const submitted = await finalizeAttempt(attempt, automatic);
  return getAttempt(studentId, submitted._id);
}

async function expireDueAttempts() {
  const due = await ExamAttempt.find({ status: 'IN_PROGRESS', expiresAt: { $lte: new Date() } })
    .select('_id expiresAt').sort({ expiresAt: 1 }).limit(100).lean();
  for (const item of due) {
    const attempt = await ExamAttempt.findById(item._id);
    if (attempt?.status === 'IN_PROGRESS') await finalizeAttempt(attempt, true);
  }
  const pendingResults = await ExamAttempt.find({ status: 'SUBMITTED', result: { $exists: false } })
    .select('_id').sort({ submittedAt: 1 }).limit(100).lean();
  for (const item of pendingResults) await evaluateSubmittedAttempt(item._id);
  const pendingEvidence = await ExamAttempt.find({
    status: 'SUBMITTED',
    result: { $exists: true },
    evidenceSyncedAt: { $exists: false },
    $or: [
      { evidenceSyncStartedAt: { $exists: false } },
      { evidenceSyncStartedAt: { $lte: new Date(Date.now() - 30_000) } },
    ],
  }).select('_id').sort({ submittedAt: 1 }).limit(100).lean();
  for (const item of pendingEvidence) {
    const attempt = await ExamAttempt.findById(item._id);
    if (attempt?.result) await ensureExamEvidence(attempt);
  }
  return due.length;
}

async function listResults(actor, { page = 1, limit = 25 } = {}) {
  if (!actor || !['ADMIN', 'MENTOR'].includes(actor.role)) throw new AppError('You do not have permission to view exam results.', 403);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('Result page and limit are invalid.', 400);
  }
  const filter = { status: 'SUBMITTED', result: { $exists: true } };
  if (actor.role === 'MENTOR') {
    const assigned = await MentorStudent.find({ mentorId: actor._id }).select('studentId').lean();
    filter.studentId = { $in: assigned.map(item => item.studentId) };
  }
  const [attempts, total] = await Promise.all([
    ExamAttempt.find(filter).populate('studentId', 'name email').populate('examId', 'title startAt totalMarks passingMarks')
      .sort({ submittedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ExamAttempt.countDocuments(filter),
  ]);
  return {
    results: attempts.map(attempt => ({
      attemptId: String(attempt._id),
      student: attempt.studentId,
      exam: attempt.examId,
      submittedAt: attempt.submittedAt,
      result: attempt.result,
      suspiciousActivityCount: attempt.suspiciousActivityCount || 0,
      activityEvents: attempt.activityEvents || [],
      answers: attempt.questions.map(question => ({
        questionId: String(question.questionId),
        question: question.question,
        questionType: question.questionType,
        answer: attempt.answers.find(answer => String(answer.questionId) === String(question.questionId))?.answer || '',
      })),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function listStudentResults(studentId, { page = 1, limit = 25 } = {}) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('Result page and limit are invalid.', 400);
  }
  const filter = { studentId, status: 'SUBMITTED', result: { $exists: true } };
  const [attempts, total] = await Promise.all([
    ExamAttempt.find(filter).populate('examId', 'title startAt totalMarks passingMarks').sort({ submittedAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    ExamAttempt.countDocuments(filter),
  ]);
  return {
    results: attempts.map(attempt => ({
      attemptId: String(attempt._id),
      exam: attempt.examId,
      submittedAt: attempt.submittedAt,
      result: attempt.result,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

module.exports = { ensureExamEvidence, evaluateSubmittedAttempt, expireDueAttempts, getAttempt, listResults, listStudentExams, listStudentResults, recordActivity, saveAnswer, startAttempt, submitAttempt };
