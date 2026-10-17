const bcrypt = require('bcrypt');
const Achievement = require('../models/Achievement');
const AuditLog = require('../models/AuditLog');
const MentorStudent = require('../models/MentorStudent');
const ScoringRule = require('../models/ScoringRule');
const Skill = require('../models/Skill');
const SkillPrerequisite = require('../models/SkillPrerequisite');
const SkillScore = require('../models/SkillScore');
const Task = require('../models/Task');
const User = require('../models/User');
const { recalculateForUser } = require('./scoringService');
const { safeMetadata, writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

const SALT_ROUNDS = 12;

async function getDashboard() {
  const [totalUsers, activeUsers, students, mentors, skills, pendingReviews, recentActivity, activeRule] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'STUDENT' }),
    User.countDocuments({ role: 'MENTOR' }),
    Skill.countDocuments({ isActive: true }),
    Achievement.countDocuments({ status: 'PENDING' }),
    AuditLog.find({}).populate('actorId', 'name email').sort({ createdAt: -1 }).limit(10).lean(),
    ScoringRule.findOne({ isActive: true }).select('version updatedAt').lean(),
  ]);
  return {
    stats: { users: totalUsers, activeUsers, students, mentors, skills, pendingReviews },
    recentActivity: recentActivity.map(item => ({ ...item, metadata: safeMetadata(item.metadata) })),
    audit: recentActivity.map(item => ({ ...item, metadata: safeMetadata(item.metadata) })),
    activeRule: activeRule ? `v${activeRule.version}` : null,
  };
}

async function listUsersPage({ page = 1, limit = 25, search, role, isActive } = {}) {
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: expression }, { email: expression }, { batch: expression }];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email role isActive batch createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicUser(user) {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    ...(user.batch !== undefined ? { batch: user.batch } : {}),
    createdAt: user.createdAt,
    ...(user.updatedAt ? { updatedAt: user.updatedAt } : {}),
  };
}

async function createUser(input, actorId) {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  let user;
  try {
    user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      batch: typeof input.batch === 'string' ? input.batch.trim() : '',
      isActive: true,
    });
  } catch (error) {
    if (error.code === 11000) throw new AppError('A user with this email already exists.', 409);
    throw error;
  }
  await writeAudit({ actorId, action: 'USER_CREATED', entity: 'User', entityId: user._id, metadata: { role: user.role, batch: user.batch } });
  return publicUser(user);
}

async function updateUser(userId, input, actorId) {
  const currentUserId = String(userId);
  const isSelf = currentUserId === String(actorId);
  if (isSelf && ((input.role !== undefined && input.role !== 'ADMIN') || input.isActive === false)) {
    throw new AppError('You cannot remove your own administrator access.', 403);
  }
  const current = await User.findById(userId).select('role isActive batch');
  if (!current) throw new AppError('User not found.', 404);
  const isLosingActiveAdmin = current.role === 'ADMIN'
    && current.isActive
    && (input.isActive === false || (input.role !== undefined && input.role !== 'ADMIN'));
  if (isLosingActiveAdmin && await User.countDocuments({ role: 'ADMIN', isActive: true }) <= 1) {
    throw new AppError('The last active administrator cannot be deactivated or reassigned.', 409);
  }
  const update = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.email !== undefined) update.email = input.email;
  if (input.isActive !== undefined) update.isActive = input.isActive;
  if (input.role !== undefined) update.role = input.role;
  if (input.batch !== undefined) update.batch = typeof input.batch === 'string' ? input.batch.trim() : '';
  const updateOperation = { $set: update };
  const accessChanged = (input.isActive !== undefined && input.isActive !== current.isActive)
    || (input.role !== undefined && input.role !== current.role);
  if (accessChanged) updateOperation.$inc = { authVersion: 1 };
  let user;
  try {
    user = await User.findByIdAndUpdate(userId, updateOperation, { new: true, runValidators: true }).select('name email role isActive batch createdAt updatedAt');
  } catch (error) {
    if (error.code === 11000) throw new AppError('A user with this email already exists.', 409);
    throw error;
  }
  if (!user) throw new AppError('User not found.', 404);
  await writeAudit({
    actorId,
    action: input.role !== undefined && input.role !== current.role ? 'USER_ROLE_CHANGED' : user.isActive ? 'USER_UPDATED' : 'USER_DEACTIVATED',
    entity: 'User',
    entityId: user._id,
    metadata: { isActive: user.isActive, previousRole: current.role, role: user.role, ...(user.batch !== undefined ? { batch: user.batch } : {}) },
  });
  return publicUser(user);
}

async function assignMentor({ mentorId, studentId }, actorId) {
  const [mentor, student] = await Promise.all([
    User.findOne({ _id: mentorId, role: 'MENTOR', isActive: true }),
    User.findOne({ _id: studentId, role: 'STUDENT', isActive: true }),
  ]);
  if (!mentor || !student) throw new AppError('An active mentor and student are required.', 400);
  const currentAssignment = await MentorStudent.findOne({ studentId });
  if (currentAssignment && String(currentAssignment.mentorId) === String(mentorId)) return currentAssignment;
  const assignment = await MentorStudent.findOneAndUpdate({ studentId }, { $set: { mentorId, assignedAt: new Date() } }, { upsert: true, new: true, runValidators: true });
  await writeAudit({
    actorId,
    action: currentAssignment ? 'MENTOR_CHANGED' : 'STUDENT_ASSIGNED',
    entity: 'MentorStudent',
    entityId: assignment._id,
    metadata: {
      ...(currentAssignment ? { previousMentorId: currentAssignment.mentorId } : {}),
      mentorId,
      studentId,
    },
  });
  return assignment;
}

async function removeMentorAssignment(studentId, actorId) {
  const assignment = await MentorStudent.findOneAndDelete({ studentId });
  if (!assignment) throw new AppError('Mentor assignment not found.', 404);
  await writeAudit({
    actorId,
    action: 'STUDENT_UNASSIGNED',
    entity: 'MentorStudent',
    entityId: assignment._id,
    metadata: { mentorId: assignment.mentorId, studentId },
  });
  return assignment;
}

async function addSkill(input, actorId) {
  let skill;
  try {
    skill = await Skill.create(input);
  } catch (error) {
    if (error.code === 11000) throw new AppError('A skill with this name already exists.', 409);
    throw error;
  }
  await writeAudit({ actorId, action: 'SKILL_CREATED', entity: 'Skill', entityId: skill._id, metadata: { name: skill.name } });
  return skill;
}

async function updateSkill(skillId, input, actorId) {
  let skill;
  try {
    skill = await Skill.findByIdAndUpdate(skillId, { $set: input }, { new: true, runValidators: true });
  } catch (error) {
    if (error.code === 11000) throw new AppError('A skill with this name already exists.', 409);
    throw error;
  }
  if (!skill) throw new AppError('Skill not found.', 404);
  await writeAudit({ actorId, action: 'SKILL_UPDATED', entity: 'Skill', entityId: skill._id, metadata: { fields: Object.keys(input) } });
  return skill;
}

async function deactivateSkill(skillId, actorId) {
  const skill = await Skill.findByIdAndUpdate(skillId, { $set: { isActive: false } }, { new: true });
  if (!skill) throw new AppError('Skill not found.', 404);
  await SkillPrerequisite.deleteMany({ $or: [{ skillId }, { prerequisiteSkillId: skillId }] });
  await writeAudit({ actorId, action: 'SKILL_DEACTIVATED', entity: 'Skill', entityId: skill._id });
  return skill;
}

async function createScoringRule(input, actorId) {
  if (input.difficultyFloor !== undefined && input.difficultyFloor > (input.difficultyCeiling ?? 1)) {
    throw new AppError('Difficulty floor cannot exceed the difficulty ceiling.', 400);
  }
  if (input.masteryThreshold !== undefined && input.masteryThreshold > (input.practiceThreshold ?? 75)) {
    throw new AppError('Mastery threshold cannot exceed the practice threshold.', 400);
  }
  const latest = await ScoringRule.findOne({}).sort({ version: -1 }).select('version').lean();
  const rule = await ScoringRule.create({ version: (latest?.version ?? 0) + 1, ...input, isActive: false, createdBy: actorId });
  await writeAudit({ actorId, action: 'RULE_CREATED', entity: 'ScoringRule', entityId: rule._id, metadata: { version: rule.version } });
  return rule;
}

async function updateScoringRule(ruleId, input, actorId) {
  const rule = await ScoringRule.findById(ruleId);
  if (!rule) throw new AppError('Scoring rule not found.', 404);
  if (rule.isActive) throw new AppError('The active scoring rule cannot be edited. Create a draft version first.', 409);
  if (input.typeWeights) rule.typeWeights = { ...Object.fromEntries(rule.typeWeights), ...input.typeWeights };
  if (input.reliabilityWeights) rule.reliabilityWeights = { ...Object.fromEntries(rule.reliabilityWeights), ...input.reliabilityWeights };
  if (input.verificationWeights) rule.verificationWeights = { ...Object.fromEntries(rule.verificationWeights), ...input.verificationWeights };
  for (const key of ['difficultyFloor', 'difficultyCeiling', 'recencyHalfLifeDays', 'recencyFloor', 'masteryThreshold', 'practiceThreshold']) {
    if (input[key] !== undefined) rule[key] = input[key];
  }
  const difficultyFloor = Number(rule.difficultyFloor);
  const difficultyCeiling = Number(rule.difficultyCeiling);
  if (difficultyFloor > difficultyCeiling) throw new AppError('Difficulty floor cannot exceed the difficulty ceiling.', 400);
  if (Number(rule.masteryThreshold) > Number(rule.practiceThreshold)) {
    throw new AppError('Mastery threshold cannot exceed the practice threshold.', 400);
  }
  await rule.save();
  await writeAudit({ actorId, action: 'RULE_UPDATED', entity: 'ScoringRule', entityId: rule._id, metadata: { version: rule.version, isActive: false } });
  return rule;
}

async function activateScoringRule(ruleId, actorId) {
  const rule = await ScoringRule.findById(ruleId);
  if (!rule) throw new AppError('Scoring rule not found.', 404);
  await ScoringRule.updateMany({ isActive: true }, { $set: { isActive: false } });
  rule.isActive = true;
  await rule.save();
  await writeAudit({ actorId, action: 'RULE_UPDATED', entity: 'ScoringRule', entityId: rule._id, metadata: { version: rule.version, isActive: true } });
  const studentIds = await User.find({ role: 'STUDENT', isActive: true }).distinct('_id');
  for (const studentId of studentIds) {
    await recalculateForUser(studentId, { reason: 'scoring_rule_activated' });
  }
  return rule;
}

async function getAuditLogs({ page = 1, limit = 25, action, search } = {}) {
  const filter = {};
  if (action) filter.action = action;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$and = [
      ...(action ? [{ action }] : []),
      { $or: [{ action: expression }, { entity: expression }] },
    ];
    delete filter.action;
  }
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).populate('actorId', 'name email role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { logs: logs.map(item => ({ ...item, metadata: safeMetadata(item.metadata) })), page, limit, total };
}

async function listSkills() {
  const [skills, latestScores] = await Promise.all([
    Skill.find({}).sort({ name: 1 }).lean(),
    SkillScore.aggregate([
      { $sort: { calculatedAt: -1 } },
      { $group: { _id: { userId: '$userId', skillId: '$skillId' }, score: { $first: '$score' } } },
      { $group: { _id: '$_id.skillId', activeStudents: { $sum: 1 }, averageScore: { $avg: '$score' } } },
    ]),
  ]);
  const stats = new Map(latestScores.map(item => [String(item._id), item]));
  return skills.map(skill => {
    const score = stats.get(String(skill._id));
    return { ...skill, activeStudents: score?.activeStudents || 0, score: Math.round(score?.averageScore || 0) };
  });
}

async function createSkillRelationship(input, actorId) {
  const { addSkillPrerequisite } = require('./skillService');
  return addSkillPrerequisite({ ...input, actorId });
}

async function deleteSkillRelationship(relationshipId, actorId) {
  const relationship = await SkillPrerequisite.findByIdAndDelete(relationshipId);
  if (!relationship) throw new AppError('Skill relationship not found.', 404);
  await writeAudit({ actorId, action: 'SKILL_RELATIONSHIP_DELETED', entity: 'SkillPrerequisite', entityId: relationshipId });
  return relationship;
}

async function getUserDirectory() {
  const [users, assignments, latestScores] = await Promise.all([
    User.find({ role: { $in: ['STUDENT', 'MENTOR'] } }).select('name email role isActive batch createdAt').sort({ name: 1 }).lean(),
    MentorStudent.find({}).populate('mentorId', 'name email').populate('studentId', 'name email').lean(),
    SkillScore.aggregate([
      { $sort: { calculatedAt: -1 } },
      { $group: { _id: { userId: '$userId', skillId: '$skillId' }, score: { $first: '$score' } } },
      { $group: { _id: '$_id.userId', average: { $avg: '$score' } } },
    ]),
  ]);
  const mentorByStudent = new Map(assignments.map(item => [String(item.studentId?._id), item.mentorId]));
  const progressByStudent = new Map(latestScores.map(item => [String(item._id), Math.round(item.average)]));
  const studentCountByMentor = new Map();
  for (const assignment of assignments) {
    const mentorId = String(assignment.mentorId?._id);
    studentCountByMentor.set(mentorId, (studentCountByMentor.get(mentorId) || 0) + 1);
  }
  return {
    students: users.filter(item => item.role === 'STUDENT').map(student => ({ ...student, batch: student.batch || '', mentor: mentorByStudent.get(String(student._id)) || null, progress: progressByStudent.get(String(student._id)) || 0 })),
    mentors: users.filter(item => item.role === 'MENTOR').map(mentor => ({ ...mentor, batch: mentor.batch || '', studentCount: studentCountByMentor.get(String(mentor._id)) || 0 })),
  };
}

async function getAdminActivity() {
  const [users, achievements, skills, tasks] = await Promise.all([
    User.countDocuments(),
    Achievement.countDocuments(),
    Skill.countDocuments({ isActive: true }),
    Task.countDocuments({ status: 'PENDING' }),
  ]);
  return { users, achievements, activeSkills: skills, pendingTasks: tasks };
}

async function recalculateStudentScores(userId) {
  const studentIds = userId
    ? await User.find({ _id: userId, role: 'STUDENT' }).distinct('_id')
    : await User.find({ role: 'STUDENT', isActive: true }).distinct('_id');
  if (userId && !studentIds.length) throw new AppError('Student not found.', 404);
  for (const id of studentIds) await recalculateForUser(id);
  return studentIds.length;
}

module.exports = {
  activateScoringRule,
  addSkill,
  assignMentor,
  createScoringRule,
  createSkillRelationship,
  createUser,
  deactivateSkill,
  deleteSkillRelationship,
  getAdminActivity,
  getAuditLogs,
  getDashboard,
  getUserDirectory,
  listSkills,
  listUsersPage,
  removeMentorAssignment,
  recalculateStudentScores,
  updateSkill,
  updateScoringRule,
  updateUser,
};
