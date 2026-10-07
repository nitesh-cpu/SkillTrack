const crypto = require('node:crypto');
const Achievement = require('../models/Achievement');
const AchievementSkill = require('../models/AchievementSkill');
const MentorStudent = require('../models/MentorStudent');
const Skill = require('../models/Skill');
const { recalculateForUser } = require('./scoringService');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

const ACHIEVEMENT_TYPES = ['CODING', 'PROJECT', 'ASSESSMENT', 'COURSE', 'INTERVIEW'];
const DATA_FIELDS = {
  CODING: ['platform', 'problemsSolved', 'contestRating', 'highestDifficulty', 'profileUrl', 'proofUrl', 'date', 'difficulty', 'score', 'submissionKind'],
  PROJECT: ['projectName', 'description', 'technologies', 'role', 'githubUrl', 'liveUrl', 'proofUrl', 'duration', 'difficulty', 'score', 'submissionKind'],
  ASSESSMENT: ['assessmentName', 'platform', 'score', 'totalMarks', 'percentile', 'certificateUrl', 'proofUrl', 'difficulty', 'submissionKind'],
  COURSE: ['courseName', 'provider', 'certificateUrl', 'proofUrl', 'completionDate', 'difficulty', 'score', 'submissionKind'],
  INTERVIEW: ['company', 'role', 'interviewType', 'result', 'feedback', 'proofUrl', 'interviewDate', 'difficulty', 'score', 'submissionKind'],
};
const SUBMISSION_KIND_TYPES = {
  'Coding Achievement': 'CODING',
  Project: 'PROJECT',
  'Course/Certification': 'COURSE',
  Competition: 'INTERVIEW',
  'Other Achievement': 'ASSESSMENT',
};

function validateAchievementData(type, data = {}) {
  if (!ACHIEVEMENT_TYPES.includes(type)) throw new AppError('Achievement type is invalid.', 400);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('Achievement data must be an object.', 400);
  const allowed = new Set(DATA_FIELDS[type]);
  for (const key of Object.keys(data)) if (!allowed.has(key)) throw new AppError(`"${key}" is not valid data for a ${type.toLowerCase()} achievement.`, 400);
  if (data.submissionKind !== undefined && SUBMISSION_KIND_TYPES[data.submissionKind] !== type) {
    throw new AppError('Submission category does not match its submission type.', 400);
  }
  if (data.difficulty !== undefined && (!Number.isFinite(Number(data.difficulty)) || Number(data.difficulty) < 0 || Number(data.difficulty) > 1)) {
    throw new AppError('Difficulty must be between 0 and 1.', 400);
  }
  for (const field of ['score', 'totalMarks', 'contestRating', 'problemsSolved', 'percentile']) {
    if (data[field] !== undefined && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0 || (field === 'score' && Number(data[field]) > 100))) {
      throw new AppError(`${field} must be a valid non-negative number${field === 'score' ? ' no greater than 100' : ''}.`, 400);
    }
  }
  if (data.problemsSolved !== undefined && !Number.isInteger(Number(data.problemsSolved))) {
    throw new AppError('problemsSolved must be a whole number.', 400);
  }
  if (data.score !== undefined && data.totalMarks !== undefined && Number(data.score) > Number(data.totalMarks)) {
    throw new AppError('Submission score cannot exceed total marks.', 400);
  }
  if (data.totalMarks !== undefined && data.score !== undefined && Number(data.score) > Number(data.totalMarks)) {
    throw new AppError('Assessment score cannot exceed total marks.', 400);
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function evidenceFingerprint(input) {
  const data = input.data || {};
  const proofUrl = ['proofUrl', 'githubUrl', 'liveUrl', 'certificateUrl', 'profileUrl']
    .map(key => data[key])
    .find(value => typeof value === 'string' && value.trim());
  let normalizedProofUrl;
  if (proofUrl) {
    normalizedProofUrl = proofUrl.trim().replace(/#.*$/, '');
    try {
      const parsedUrl = new URL(normalizedProofUrl);
      parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
      normalizedProofUrl = parsedUrl.toString();
    } catch {
      // Preserve malformed legacy URLs verbatim rather than conflating distinct paths.
    }
  }
  const identity = proofUrl
    ? { type: input.type, proofUrl: normalizedProofUrl }
    : {
      type: input.type,
      title: input.title.trim().toLowerCase(),
      description: input.description.trim().toLowerCase(),
      data: stableValue(data),
    };
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

async function submitAchievement(user, input) {
  validateAchievementData(input.type, input.data);
  const mappings = input.skillMappings || [];
  if (!Array.isArray(mappings)) throw new AppError('Skill mappings must be an array.', 400);
  const seenSkills = new Set();
  for (const mapping of mappings) {
    if (!mapping.skillId || !Number.isFinite(Number(mapping.relevance)) || mapping.relevance < 0 || mapping.relevance > 1) {
      throw new AppError('Each skill mapping needs a skill ID and relevance between 0 and 1.', 400);
    }
    if (seenSkills.has(String(mapping.skillId))) throw new AppError('A skill can only be mapped once per achievement.', 400);
    seenSkills.add(String(mapping.skillId));
  }
  if (mappings.length) {
    const count = await Skill.countDocuments({ _id: { $in: mappings.map(item => item.skillId) }, isActive: true });
    if (count !== mappings.length) throw new AppError('One or more mapped skills do not exist or are inactive.', 400);
  }
  const fingerprint = evidenceFingerprint(input);
  if (await Achievement.exists({ userId: user._id, evidenceFingerprint: fingerprint })) {
    throw new AppError('This submission has already been sent.', 409);
  }
  let achievement;
  try {
    achievement = await Achievement.create({
      userId: user._id,
      type: input.type,
      title: input.title,
      description: input.description,
      data: input.data || {},
      status: 'PENDING',
      source: 'SELF',
      evidenceFingerprint: fingerprint,
    });
  } catch (error) {
    if (error.code === 11000) throw new AppError('This submission has already been sent.', 409);
    throw error;
  }
  if (mappings.length) await AchievementSkill.insertMany(mappings.map(mapping => ({ achievementId: achievement._id, skillId: mapping.skillId, relevance: mapping.relevance })));
  if (mappings.length) await recalculateForUser(user._id, { reason: 'evidence_submitted' });
  const assignment = await MentorStudent.findOne({ studentId: user._id }).lean();
  await writeAudit({ actorId: user._id, action: 'ACHIEVEMENT_SUBMITTED', entity: 'Achievement', entityId: achievement._id, metadata: { type: achievement.type, mentorAssigned: Boolean(assignment) } });
  return achievement;
}

async function getOwnedAchievement(userId, achievementId) {
  const achievement = await Achievement.findOne({ _id: achievementId, userId });
  if (!achievement) throw new AppError('Achievement not found.', 404);
  return achievement;
}

async function deletePendingAchievement(userId, achievementId) {
  const achievement = await Achievement.findOneAndDelete({ _id: achievementId, userId, status: 'PENDING' });
  if (!achievement) throw new AppError('Pending achievement not found.', 404);
  await AchievementSkill.deleteMany({ achievementId });
  await writeAudit({ actorId: userId, action: 'ACHIEVEMENT_DELETED', entity: 'Achievement', entityId: achievementId });
  return achievement;
}

async function listOwnedAchievements(userId, { page, limit = 25, search, type, status } = {}) {
  const filter = { userId };
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  let achievementsQuery = Achievement.find(filter).sort({ submittedAt: -1 }).populate('reviewedBy', 'name');
  let pagination;
  if (page !== undefined) {
    const total = await Achievement.countDocuments(filter);
    achievementsQuery = achievementsQuery.skip((page - 1) * limit).limit(limit);
    pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  }
  const achievements = await achievementsQuery.lean();
  const achievementIds = achievements.map(item => item._id);
  const mappings = achievementIds.length
    ? await AchievementSkill.find({ achievementId: { $in: achievementIds } }).populate('skillId', 'name').lean()
    : [];
  const mappedByAchievement = new Map();
  for (const mapping of mappings) {
    const key = String(mapping.achievementId);
    if (!mappedByAchievement.has(key)) mappedByAchievement.set(key, []);
    mappedByAchievement.get(key).push({ skill: mapping.skillId, relevance: mapping.relevance });
  }
  return {
    achievements: achievements.map(achievement => ({
      ...achievement,
      skillMappings: mappedByAchievement.get(String(achievement._id)) || [],
    })),
    ...(pagination ? { pagination } : {}),
  };
}

async function reviewAchievement({ achievementId, mentor, reviewer = mentor, status, rejectionReason, feedback }) {
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw new AppError('Review status is invalid.', 400);
  const pendingAchievement = await Achievement.findOne({ _id: achievementId, status: 'PENDING' }).select('userId').lean();
  if (!pendingAchievement) throw new AppError('Pending achievement not found or already reviewed.', 409);
  if (reviewer.role === 'MENTOR') {
    const assignment = await MentorStudent.exists({ mentorId: reviewer._id, studentId: pendingAchievement.userId });
    if (!assignment) throw new AppError('Student is not assigned to this mentor.', 403);
  } else if (reviewer.role !== 'ADMIN') {
    throw new AppError('Only an assigned mentor or an administrator can review submissions.', 403);
  }
  const update = {
    $set: {
      status,
      reviewedBy: reviewer._id,
      reviewedAt: new Date(),
      source: reviewer.role === 'ADMIN' ? 'PLATFORM' : 'MENTOR',
      mentorFeedback: feedback || rejectionReason,
    },
  };
  if (status === 'REJECTED') update.$set.rejectionReason = rejectionReason;
  else update.$unset = { rejectionReason: 1 };
  const achievement = await Achievement.findOneAndUpdate({
    _id: achievementId,
    userId: pendingAchievement.userId,
    status: 'PENDING',
  }, update, { new: true, runValidators: true });
  if (!achievement) throw new AppError('Pending achievement not found or already reviewed.', 409);
  const mappings = await AchievementSkill.find({ achievementId }).select('skillId').lean();
  if (mappings.length) await recalculateForUser(achievement.userId, { reason: status === 'VERIFIED' ? 'evidence_verified' : 'evidence_rejected' });
  await writeAudit({ actorId: reviewer._id, action: status === 'VERIFIED' ? 'ACHIEVEMENT_VERIFIED' : 'ACHIEVEMENT_REJECTED', entity: 'Achievement', entityId: achievement._id, metadata: { studentId: achievement.userId, type: achievement.type } });
  return achievement;
}

module.exports = {
  ACHIEVEMENT_TYPES,
  deletePendingAchievement,
  getOwnedAchievement,
  listOwnedAchievements,
  reviewAchievement,
  submitAchievement,
  validateAchievementData,
};
