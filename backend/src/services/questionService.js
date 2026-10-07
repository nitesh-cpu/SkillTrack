const mongoose = require('mongoose');
const Question = require('../models/Question');
const Skill = require('../models/Skill');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE'];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['DRAFT', 'APPROVED', 'ARCHIVED'];

function normalizeQuestion(input) {
  const questionType = input.questionType;
  if (!QUESTION_TYPES.includes(questionType)) throw new AppError('Choose a supported question type.', 400);
  if (typeof input.question !== 'string' || input.question.trim().length < 5 || input.question.trim().length > 2000) {
    throw new AppError('Question text must be between 5 and 2000 characters.', 400);
  }
  if (typeof input.topic !== 'string' || !input.topic.trim() || input.topic.trim().length > 120) {
    throw new AppError('Topic is required and must be no longer than 120 characters.', 400);
  }
  const marks = Number(input.marks);
  if (!Number.isFinite(marks) || marks < 0.25 || marks > 100) {
    throw new AppError('Marks must be between 0.25 and 100.', 400);
  }
  if (!DIFFICULTIES.includes(input.difficulty)) throw new AppError('Choose a supported difficulty.', 400);
  if (typeof input.correctAnswer !== 'string' || !input.correctAnswer.trim() || input.correctAnswer.trim().length > 1000) {
    throw new AppError('A correct answer of up to 1000 characters is required.', 400);
  }
  if (input.explanation !== undefined && (typeof input.explanation !== 'string' || input.explanation.length > 2000)) {
    throw new AppError('Explanation cannot exceed 2000 characters.', 400);
  }

  let options = [];
  if (questionType === 'MCQ') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 8) {
      throw new AppError('Multiple-choice questions must have between 2 and 8 options.', 400);
    }
    options = input.options.map(option => typeof option === 'string' ? option.trim() : '');
    if (options.some(option => !option || option.length > 500)
      || new Set(options.map(option => option.toLowerCase())).size !== options.length) {
      throw new AppError('Each multiple-choice option must be unique and no longer than 500 characters.', 400);
    }
    if (!options.includes(input.correctAnswer.trim())) {
      throw new AppError('The correct answer must match one of the options.', 400);
    }
  } else if (questionType === 'TRUE_FALSE') {
    if (!['true', 'false'].includes(input.correctAnswer.trim().toLowerCase())) {
      throw new AppError('A true/false answer must be True or False.', 400);
    }
  } else if (Array.isArray(input.options) && input.options.length) {
    throw new AppError('Short objective questions do not use answer options.', 400);
  }

  return {
    question: input.question.trim(),
    questionType,
    options,
    correctAnswer: input.correctAnswer.trim(),
    explanation: input.explanation?.trim() || '',
    topic: input.topic.trim(),
    skillId: input.skillId,
    difficulty: input.difficulty,
    marks,
  };
}

function questionFilterFor(actor, filters) {
  const filter = {};
  if (actor.role === 'MENTOR') {
    filter.$or = [{ createdBy: actor._id }, { status: 'APPROVED' }];
  }
  if (filters.status) {
    if (!STATUSES.includes(filters.status)) throw new AppError('Question status filter is invalid.', 400);
    if (actor.role === 'MENTOR' && filters.status !== 'APPROVED') {
      filter.$and = [{ $or: filter.$or }, { status: filters.status, createdBy: actor._id }];
      delete filter.$or;
    } else {
      filter.status = filters.status;
    }
  }
  if (filters.questionType) {
    if (!QUESTION_TYPES.includes(filters.questionType)) throw new AppError('Question type filter is invalid.', 400);
    filter.questionType = filters.questionType;
  }
  if (filters.difficulty) {
    if (!DIFFICULTIES.includes(filters.difficulty)) throw new AppError('Difficulty filter is invalid.', 400);
    filter.difficulty = filters.difficulty;
  }
  if (filters.skillId) filter.skillId = filters.skillId;
  if (filters.topic) filter.topic = new RegExp(escapeRegex(filters.topic), 'i');
  if (filters.search) {
    const expression = new RegExp(escapeRegex(filters.search), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ question: expression }, { topic: expression }] }];
  }
  return filter;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureQuestionBankRole(actor, allowedRoles = ['ADMIN', 'MENTOR']) {
  if (!actor || !allowedRoles.includes(actor.role)) {
    throw new AppError('You do not have permission to access the question bank.', 403);
  }
}

async function listQuestions(actor, filters = {}) {
  ensureQuestionBankRole(actor);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('Question page and limit are invalid.', 400);
  }
  const filter = questionFilterFor(actor, filters);
  const [questions, total] = await Promise.all([
    Question.find(filter).populate('skillId', 'name category').populate('createdBy', 'name').populate('approvedBy', 'name')
      .sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Question.countDocuments(filter),
  ]);
  return { questions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function ensureActiveSkill(skillId) {
  if (!mongoose.Types.ObjectId.isValid(skillId) || !(await Skill.exists({ _id: skillId, isActive: true }))) {
    throw new AppError('Choose an active skill for this question.', 400);
  }
}

async function createQuestion(actor, input) {
  ensureQuestionBankRole(actor);
  const normalized = normalizeQuestion(input);
  await ensureActiveSkill(normalized.skillId);
  const question = await Question.create({ ...normalized, createdBy: actor._id, updatedBy: actor._id, status: 'DRAFT' });
  await writeAudit({
    actorId: actor._id,
    action: 'QUESTION_CREATED',
    entity: 'Question',
    entityId: question._id,
    metadata: { questionType: question.questionType, topic: question.topic, status: question.status },
  });
  return question;
}

async function updateQuestion(actor, questionId, input) {
  if (Object.keys(input).length === 0) throw new AppError('Provide at least one question field to update.', 400);
  ensureQuestionBankRole(actor);
  const question = await Question.findById(questionId);
  if (!question) throw new AppError('Question not found.', 404);
  if (actor.role === 'MENTOR' && (String(question.createdBy) !== String(actor._id) || question.status !== 'DRAFT')) {
    throw new AppError('You can only edit your own draft questions.', 403);
  }
  const normalized = normalizeQuestion({
    ...question.toObject(),
    ...input,
    skillId: input.skillId || String(question.skillId),
  });
  await ensureActiveSkill(normalized.skillId);
  Object.assign(question, normalized, { updatedBy: actor._id });
  await question.save();
  await writeAudit({
    actorId: actor._id,
    action: 'QUESTION_UPDATED',
    entity: 'Question',
    entityId: question._id,
    metadata: { questionType: question.questionType, topic: question.topic, status: question.status },
  });
  return question;
}

async function approveQuestion(actor, questionId) {
  ensureQuestionBankRole(actor, ['ADMIN']);
  const question = await Question.findOneAndUpdate(
    { _id: questionId, status: 'DRAFT' },
    { $set: { status: 'APPROVED', approvedBy: actor._id, approvedAt: new Date(), updatedBy: actor._id } },
    { new: true, runValidators: true },
  );
  if (!question) {
    const existing = await Question.exists({ _id: questionId });
    if (!existing) throw new AppError('Question not found.', 404);
    throw new AppError('Only draft questions can be approved.', 409);
  }
  await writeAudit({
    actorId: actor._id,
    action: 'QUESTION_APPROVED',
    entity: 'Question',
    entityId: question._id,
    metadata: { questionType: question.questionType, topic: question.topic },
  });
  return question;
}

async function archiveQuestion(actor, questionId) {
  ensureQuestionBankRole(actor);
  const filter = { _id: questionId, status: { $in: ['DRAFT', 'APPROVED'] } };
  if (actor.role === 'MENTOR') Object.assign(filter, { createdBy: actor._id, status: 'DRAFT' });
  const question = await Question.findOneAndUpdate(
    filter,
    { $set: { status: 'ARCHIVED', updatedBy: actor._id } },
    { new: true, runValidators: true },
  );
  if (!question) throw new AppError('Question not found or you do not have permission to archive it.', 404);
  await writeAudit({
    actorId: actor._id,
    action: 'QUESTION_ARCHIVED',
    entity: 'Question',
    entityId: question._id,
    metadata: { questionType: question.questionType, topic: question.topic },
  });
  return question;
}

module.exports = {
  archiveQuestion,
  approveQuestion,
  createQuestion,
  listQuestions,
  updateQuestion,
};
