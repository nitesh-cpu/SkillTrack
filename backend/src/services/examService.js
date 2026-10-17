const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const ExamAssignment = require('../models/ExamAssignment');
const ExamAttempt = require('../models/ExamAttempt');
const MentorStudent = require('../models/MentorStudent');
const Question = require('../models/Question');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const MAX_QUESTIONS = 100;
const DEFAULT_SECURITY = {
  requireFullscreen: true,
  requireCamera: true,
  requireMicrophone: true,
  maxViolations: 1,
  violationAction: 'AUTO_SUBMIT',
};

function requireRole(actor, roles = ['ADMIN', 'MENTOR']) {
  if (!actor || !roles.includes(actor.role)) throw new AppError('You do not have permission to manage exams.', 403);
}

function normalizeCommon(input) {
  if (typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.trim().length > 150) {
    throw new AppError('Exam title must be between 2 and 150 characters.', 400);
  }
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 2000)) {
    throw new AppError('Exam description cannot exceed 2000 characters.', 400);
  }
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
    throw new AppError('Exam duration must be between 1 and 360 minutes.', 400);
  }
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (!input.startAt || !input.endAt || !Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || startAt >= endAt) {
    throw new AppError('Choose a valid exam start and end time; the end must follow the start.', 400);
  }
  if (input.difficulty && ![...DIFFICULTIES, 'MIXED'].includes(input.difficulty)) {
    throw new AppError('Choose a supported exam difficulty.', 400);
  }
  return {
    title: input.title.trim(),
    description: input.description?.trim() || '',
    durationMinutes,
    startAt,
    endAt,
    passingMarks: Number(input.passingMarks),
    security: { ...DEFAULT_SECURITY, ...(input.security || DEFAULT_SECURITY) },
  };
}

function snapshot(question) {
  return {
    questionId: question._id,
    question: question.question,
    questionType: question.questionType,
    options: question.options || [],
    correctAnswer: question.correctAnswer,
    explanation: question.explanation || '',
    topic: question.topic,
    skillId: question.skillId?._id || question.skillId,
    difficulty: question.difficulty,
    marks: question.marks,
  };
}

async function selectQuestions(input) {
  if (input.selectionMode === 'MANUAL') {
    if (!Array.isArray(input.questionIds) || input.questionIds.length < 1 || input.questionIds.length > MAX_QUESTIONS
      || input.questionIds.some(id => !mongoose.Types.ObjectId.isValid(id))
      || new Set(input.questionIds.map(String)).size !== input.questionIds.length) {
      throw new AppError(`Select between 1 and ${MAX_QUESTIONS} unique approved questions.`, 400);
    }
    const questions = await Question.find({ _id: { $in: input.questionIds }, status: 'APPROVED' }).populate('skillId', 'name').lean();
    if (questions.length !== input.questionIds.length) throw new AppError('Every selected question must be approved and available.', 400);
    const questionById = new Map(questions.map(question => [String(question._id), question]));
    return input.questionIds.map(id => questionById.get(String(id)));
  }
  if (input.selectionMode !== 'RANDOM') throw new AppError('Choose manual or random question selection.', 400);
  const criteria = input.randomCriteria;
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new AppError('Provide valid filters for random question selection.', 400);
  }
  if (!criteria || !Number.isInteger(Number(criteria.count)) || Number(criteria.count) < 1 || Number(criteria.count) > MAX_QUESTIONS) {
    throw new AppError(`Random selection must request between 1 and ${MAX_QUESTIONS} questions.`, 400);
  }
  if ((!criteria.topic || !criteria.topic.trim()) && !criteria.skillId) {
    throw new AppError('Random selection requires a topic, a skill, or both.', 400);
  }
  const filter = { status: 'APPROVED' };
  if (criteria.topic !== undefined && typeof criteria.topic !== 'string') {
    throw new AppError('Question topic filter must be text.', 400);
  }
  if (criteria.topic?.trim()) filter.topic = new RegExp(escapeRegex(criteria.topic.trim()), 'i');
  if (criteria.skillId) {
    if (!mongoose.Types.ObjectId.isValid(criteria.skillId) || !(await Skill.exists({ _id: criteria.skillId, isActive: true }))) {
      throw new AppError('Choose an active skill for random question selection.', 400);
    }
    filter.skillId = criteria.skillId;
  }
  if (criteria.difficulty) {
    if (!DIFFICULTIES.includes(criteria.difficulty)) throw new AppError('Choose a supported question difficulty.', 400);
    filter.difficulty = criteria.difficulty;
  }
  const questions = await Question.aggregate([{ $match: filter }, { $sample: { size: Number(criteria.count) } }]);
  if (questions.length !== Number(criteria.count)) {
    throw new AppError(`There are only ${questions.length} approved questions matching those filters.`, 409);
  }
  return questions;
}

async function createExam(actor, input) {
  requireRole(actor);
  if (input.selectionMode === 'MANUAL' && input.randomCriteria !== undefined) {
    throw new AppError('Random selection filters cannot be used with manual selection.', 400);
  }
  if (input.selectionMode === 'RANDOM' && input.questionIds !== undefined) {
    throw new AppError('Manual question IDs cannot be used with random selection.', 400);
  }
  const common = normalizeCommon(input);
  const questions = (await selectQuestions(input)).map(snapshot);
  const totalMarks = Number(questions.reduce((sum, question) => sum + question.marks, 0).toFixed(2));
  if (!Number.isFinite(common.passingMarks) || common.passingMarks < 0 || common.passingMarks > totalMarks) {
    throw new AppError(`Passing marks must be between 0 and ${totalMarks}.`, 400);
  }
  const difficulties = new Set(questions.map(question => question.difficulty));
  const examDifficulty = difficulties.size === 1 ? questions[0].difficulty : 'MIXED';
  if (input.difficulty && input.difficulty !== examDifficulty) {
    throw new AppError('Exam difficulty is determined by its selected questions.', 400);
  }
  const exam = await Exam.create({
    ...common,
    totalMarks,
    difficulty: examDifficulty,
    status: 'PUBLISHED',
    questions,
    createdBy: actor._id,
    selectionMode: input.selectionMode,
  });
  await writeAudit({
    actorId: actor._id,
    action: 'EXAM_CREATED',
    entity: 'Exam',
    entityId: exam._id,
    metadata: { questionCount: questions.length, totalMarks, selectionMode: exam.selectionMode },
  });
  return exam;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listExams(actor, { page = 1, limit = 25, search, status } = {}) {
  requireRole(actor);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('Exam page and limit are invalid.', 400);
  }
  const filter = actor.role === 'ADMIN' ? {} : { createdBy: actor._id };
  if (status) {
    if (!['PUBLISHED', 'ARCHIVED'].includes(status)) throw new AppError('Exam status filter is invalid.', 400);
    filter.status = status;
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: expression }, { description: expression }];
  }
  const [exams, total] = await Promise.all([
    Exam.find(filter).populate('createdBy', 'name').sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Exam.countDocuments(filter),
  ]);
  const examIds = exams.map(exam => exam._id);
  const assignments = examIds.length
    ? await ExamAssignment.find({ examId: { $in: examIds } }).select('examId studentId').populate('studentId', 'name email').lean()
    : [];
  const assignedByExam = new Map();
  for (const assignment of assignments) {
    const key = String(assignment.examId);
    if (!assignedByExam.has(key)) assignedByExam.set(key, []);
    assignedByExam.get(key).push(assignment.studentId);
  }
  return {
    exams: exams.map(exam => ({
      ...exam,
      assignedStudents: assignedByExam.get(String(exam._id)) || [],
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function getExam(actor, examId) {
  requireRole(actor);
  const filter = actor.role === 'ADMIN' ? { _id: examId } : { _id: examId, createdBy: actor._id };
  const exam = await Exam.findOne(filter).populate('createdBy', 'name').lean();
  if (!exam) throw new AppError('Exam not found in this workspace.', 404);
  const assignments = await ExamAssignment.find({ examId }).populate('studentId', 'name email').lean();
  return { ...exam, assignedStudents: assignments.map(item => item.studentId) };
}

async function assignExam(actor, examId, studentIds) {
  requireRole(actor);
  if (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > 500
    || studentIds.some(id => !mongoose.Types.ObjectId.isValid(id))
    || new Set(studentIds.map(String)).size !== studentIds.length) {
    throw new AppError('Select between 1 and 500 unique students.', 400);
  }
  const examFilter = actor.role === 'ADMIN' ? { _id: examId, status: 'PUBLISHED' } : { _id: examId, createdBy: actor._id, status: 'PUBLISHED' };
  const exam = await Exam.findOne(examFilter).select('_id');
  if (!exam) throw new AppError('Published exam not found in this workspace.', 404);
  const activeStudents = await User.countDocuments({ _id: { $in: studentIds }, role: 'STUDENT', isActive: true });
  if (activeStudents !== studentIds.length) throw new AppError('One or more selected students are unavailable.', 400);
  if (actor.role === 'MENTOR') {
    const assignedStudents = await MentorStudent.distinct('studentId', {
      mentorId: actor._id,
      studentId: { $in: studentIds },
    });
    if (assignedStudents.length !== studentIds.length) throw new AppError('You can only assign exams to your assigned students.', 403);
  }
  const result = await ExamAssignment.bulkWrite(studentIds.map(studentId => ({
    updateOne: {
      filter: { examId, studentId },
      update: { $setOnInsert: { examId, studentId, assignedBy: actor._id, status: 'ASSIGNED' } },
      upsert: true,
    },
  })), { ordered: true });
  const assignments = await ExamAssignment.find({ examId, studentId: { $in: studentIds } })
    .populate('studentId', 'name email').lean();
  if (result.upsertedCount > 0) {
    await writeAudit({
      actorId: actor._id,
      action: 'EXAM_ASSIGNED',
      entity: 'Exam',
      entityId: examId,
      metadata: { studentCount: result.upsertedCount },
    });
  }
  return { assignments, newlyAssigned: result.upsertedCount };
}

async function archiveExam(actor, examId) {
  requireRole(actor);
  const filter = actor.role === 'ADMIN' ? { _id: examId, status: 'PUBLISHED' } : { _id: examId, createdBy: actor._id, status: 'PUBLISHED' };
  const exam = await Exam.findOneAndUpdate(filter, { $set: { status: 'ARCHIVED' } }, { new: true, runValidators: true });
  if (!exam) throw new AppError('Published exam not found in this workspace.', 404);
  await writeAudit({ actorId: actor._id, action: 'EXAM_ARCHIVED', entity: 'Exam', entityId: exam._id });
  return exam;
}

async function revokeExamAssignment(actor, examId, studentId) {
  requireRole(actor);
  const examFilter = actor.role === 'ADMIN' ? { _id: examId } : { _id: examId, createdBy: actor._id };
  const exam = await Exam.findOne(examFilter).select('_id');
  if (!exam) throw new AppError('Exam not found in this workspace.', 404);
  const assignment = await ExamAssignment.findOneAndUpdate(
    { examId, studentId, status: 'ASSIGNED' },
    { $set: { status: 'REVOKED' } },
    { new: true },
  );
  if (!assignment) throw new AppError('Only an assigned exam can be revoked.', 409);
  await writeAudit({ actorId: actor._id, action: 'EXAM_ASSIGNMENT_REVOKED', entity: 'ExamAssignment', entityId: assignment._id, metadata: { examId, studentId } });
  return assignment;
}

async function deleteExam(actor, examId) {
  if (!actor || actor.role !== 'ADMIN') throw new AppError('Only administrators can delete exams.', 403);
  const exam = await Exam.findById(examId).select('_id title');
  if (!exam) throw new AppError('Exam not found.', 404);
  if (await ExamAttempt.exists({ examId })) throw new AppError('An exam with attempts cannot be deleted. Archive it instead.', 409);
  await ExamAssignment.deleteMany({ examId });
  await Exam.deleteOne({ _id: examId });
  await writeAudit({ actorId: actor._id, action: 'EXAM_DELETED', entity: 'Exam', entityId: examId, metadata: { title: exam.title } });
  return { id: String(examId) };
}

module.exports = { archiveExam, assignExam, createExam, deleteExam, getExam, listExams, revokeExamAssignment };
