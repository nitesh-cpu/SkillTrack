const Achievement = require('../models/Achievement');
const MentorStudent = require('../models/MentorStudent');
const Skill = require('../models/Skill');
const SkillScore = require('../models/SkillScore');
const Task = require('../models/Task');
const User = require('../models/User');
const AchievementSkill = require('../models/AchievementSkill');
const SkillPrerequisite = require('../models/SkillPrerequisite');
const { getActiveScoringRule } = require('./scoringService');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');

async function assignedStudentIds(mentorId) {
  const assignments = await MentorStudent.find({ mentorId }).select('studentId').lean();
  return assignments.map(item => item.studentId);
}

async function getStudents(mentorId, { page, limit = 25, search } = {}) {
  const studentIds = await assignedStudentIds(mentorId);
  const filter = { _id: { $in: studentIds }, role: 'STUDENT' };
  if (search) {
    const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: expression }, { email: expression }, { batch: expression }];
  }
  const total = page !== undefined ? await User.countDocuments(filter) : undefined;
  let studentsQuery = User.find(filter).select('name email batch createdAt isActive').sort({ name: 1 });
  if (page !== undefined) studentsQuery = studentsQuery.skip((page - 1) * limit).limit(limit);
  const students = await studentsQuery.lean();
  const visibleStudentIds = students.map(student => student._id);
  const latestScores = await SkillScore.aggregate([
    { $match: { userId: { $in: visibleStudentIds } } },
    { $sort: { calculatedAt: -1, _id: -1 } },
    { $group: { _id: { userId: '$userId', skillId: '$skillId' }, score: { $first: '$score' } } },
    { $group: { _id: '$_id.userId', average: { $avg: '$score' }, trackedSkills: { $sum: 1 } } },
  ]);
  const progressByStudent = new Map(latestScores.map(item => [String(item._id), {
    progress: Math.round(item.average),
    trackedSkills: item.trackedSkills,
  }]));
  const listedStudents = students.map(student => ({
    ...student,
    batch: student.batch || '',
    progress: progressByStudent.get(String(student._id))?.progress ?? null,
    trackedSkills: progressByStudent.get(String(student._id))?.trackedSkills ?? 0,
  }));
  return {
    students: listedStudents,
    ...(total !== undefined ? { pagination: { page, limit, total, pages: Math.ceil(total / limit) } } : {}),
  };
}

async function getMentorDashboard(mentorId) {
  const studentIds = await assignedStudentIds(mentorId);
  const [studentResult, pending, history, tasks] = await Promise.all([
    getStudents(mentorId),
    Achievement.find({ userId: { $in: studentIds }, status: 'PENDING' }).populate('userId', 'name email').sort({ submittedAt: 1 }).lean(),
    Achievement.find({ userId: { $in: studentIds }, status: { $in: ['VERIFIED', 'REJECTED'] } }).populate('userId', 'name email').populate('reviewedBy', 'name').sort({ reviewedAt: -1 }).limit(20).lean(),
    Task.find({ mentorId, studentId: { $in: studentIds } }).populate('studentId', 'name email').populate('skillId', 'name').sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const students = studentResult.students;
  return { stats: { students: students.length, pendingReviews: pending.length, reviewed: history.length, openTasks: tasks.filter(item => item.status === 'PENDING').length }, students, pending, history, tasks };
}

async function listMentorAchievements(mentorId, { statuses, page, limit = 25, search } = {}) {
  const studentIds = await assignedStudentIds(mentorId);
  const filter = { userId: { $in: studentIds }, status: Array.isArray(statuses) ? { $in: statuses } : statuses };
  if (search) {
    const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: expression }, { description: expression }];
  }
  let resultQuery = Achievement.find(filter)
    .populate('userId', 'name email')
    .populate('reviewedBy', 'name')
    .sort(statuses.includes('PENDING') ? { submittedAt: 1 } : { reviewedAt: -1 });
  let pagination;
  if (page !== undefined) {
    const total = await Achievement.countDocuments(filter);
    resultQuery = resultQuery.skip((page - 1) * limit).limit(limit);
    pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  }
  return { achievements: await resultQuery.lean(), ...(pagination ? { pagination } : {}) };
}

async function listMentorTasks(mentorId, { page, limit = 25, search, status } = {}) {
  const filter = { mentorId, studentId: { $in: await assignedStudentIds(mentorId) } };
  if (status) filter.status = status;
  if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  let taskQuery = Task.find(filter).populate('studentId', 'name email').populate('skillId', 'name').sort({ createdAt: -1 });
  let pagination;
  if (page !== undefined) {
    const total = await Task.countDocuments(filter);
    taskQuery = taskQuery.skip((page - 1) * limit).limit(limit);
    pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  }
  return { tasks: await taskQuery.lean(), ...(pagination ? { pagination } : {}) };
}

async function getStudentDetail(mentorId, studentId) {
  const assignment = await MentorStudent.exists({ mentorId, studentId });
  if (!assignment) throw new AppError('Student is not assigned to this mentor.', 403);
  const student = await User.findOne({ _id: studentId, role: 'STUDENT' }).select('name email batch isActive createdAt').lean();
  if (!student) throw new AppError('Student not found.', 404);
  const [achievements, tasks, latestScores, scoreHistory, prerequisites, rule] = await Promise.all([
    Achievement.find({ userId: studentId }).sort({ submittedAt: -1 }).limit(20).populate('reviewedBy', 'name').lean(),
    Task.find({ studentId, mentorId }).populate('skillId', 'name').sort({ createdAt: -1 }).lean(),
    SkillScore.aggregate([
      { $match: { userId: student._id } },
      { $sort: { calculatedAt: -1, _id: -1 } },
      { $group: { _id: '$skillId', score: { $first: '$score' }, breakdown: { $first: '$breakdown' }, calculatedAt: { $first: '$calculatedAt' } } },
      { $lookup: { from: 'skills', localField: '_id', foreignField: '_id', as: 'skill' } },
      { $unwind: '$skill' },
      { $project: { skillId: '$_id', name: '$skill.name', category: '$skill.category', score: 1, breakdown: 1, calculatedAt: 1 } },
    ]),
    SkillScore.aggregate([
      { $match: { userId: student._id } },
      { $sort: { calculatedAt: 1, _id: 1 } },
      { $lookup: { from: 'skills', localField: 'skillId', foreignField: '_id', as: 'skill' } },
      { $unwind: '$skill' },
      { $project: { skillId: 1, skillName: '$skill.name', score: 1, calculatedAt: 1 } },
    ]),
    SkillPrerequisite.find({}).populate('prerequisiteSkillId', 'name').populate('skillId', 'name').lean(),
    getActiveScoringRule(),
  ]);
  const achievementIds = achievements.map(item => item._id);
  const mappings = await AchievementSkill.find({ achievementId: { $in: achievementIds } })
    .populate('skillId', 'name')
    .lean();
  const mappingsByAchievement = new Map();
  const scoreBySkill = new Map(latestScores.map(skill => [String(skill.skillId), skill]));
  const prerequisitesBySkill = new Map();
  const masteryThreshold = Number(rule?.masteryThreshold ?? 60);
  for (const relationship of prerequisites) {
    if (!relationship.skillId?._id || !relationship.prerequisiteSkillId?._id) continue;
    const targetId = String(relationship.skillId._id);
    const prerequisiteId = String(relationship.prerequisiteSkillId._id);
    const prerequisiteScore = scoreBySkill.get(prerequisiteId)?.score ?? null;
    if (!prerequisitesBySkill.has(targetId)) prerequisitesBySkill.set(targetId, []);
    prerequisitesBySkill.get(targetId).push({
      id: prerequisiteId,
      name: relationship.prerequisiteSkillId.name,
      score: prerequisiteScore,
      mastered: prerequisiteScore !== null && prerequisiteScore >= masteryThreshold,
    });
  }
  for (const mapping of mappings) {
    const key = String(mapping.achievementId);
    if (!mappingsByAchievement.has(key)) mappingsByAchievement.set(key, []);
    mappingsByAchievement.get(key).push({ skill: mapping.skillId, relevance: mapping.relevance });
  }
  for (const skill of latestScores) {
    skill.prerequisites = prerequisitesBySkill.get(String(skill.skillId)) || [];
    skill.pendingPrerequisites = skill.prerequisites.filter(item => !item.mastered);
    const current = scoreHistory.filter(item => String(item.skillId) === String(skill.skillId));
    const previousScore = current.length > 1 ? current[current.length - 2].score : null;
    skill.weeklyGrowth = current.length > 1 ? Number((skill.score - previousScore).toFixed(2)) : 0;
    skill.previousScore = previousScore;
    skill.history = current;
  }
  return {
    student,
    achievements: achievements.map(item => ({
      ...item,
      skillMappings: mappingsByAchievement.get(String(item._id)) || [],
      scoreImpact: latestScores.flatMap(skill => skill.breakdown
        .filter(entry => String(entry.achievementId) === String(item._id))
        .map(entry => ({ skillId: String(skill.skillId), skill: skill.name, contribution: entry.contribution }))),
      reviewActivity: item.reviewedAt ? {
        reviewedAt: item.reviewedAt,
        reviewer: item.reviewedBy?.name || null,
      } : null,
    })),
    tasks,
    skills: latestScores,
    scoreHistory,
  };
}

async function getReview(mentorId, achievementId, status) {
  const ids = await assignedStudentIds(mentorId);
  const achievement = await Achievement.findOne({ _id: achievementId, userId: { $in: ids }, ...(status ? { status } : {}) }).populate('userId', 'name email').populate('reviewedBy', 'name').lean();
  if (!achievement) throw new AppError('Achievement not found in this mentor workspace.', 404);
  const skillMappings = await AchievementSkill.find({ achievementId: achievement._id })
    .populate('skillId', 'name category')
    .lean();
  const skillIds = skillMappings.map(mapping => mapping.skillId?._id).filter(Boolean);
  const latestScores = skillIds.length ? await SkillScore.aggregate([
    { $match: { userId: achievement.userId._id, skillId: { $in: skillIds } } },
    { $sort: { calculatedAt: -1, _id: -1 } },
    { $group: { _id: '$skillId', score: { $first: '$score' }, breakdown: { $first: '$breakdown' } } },
  ]) : [];
  const scoreBySkill = new Map(latestScores.map(score => [String(score._id), score]));
  return {
    ...achievement,
    skillImpacts: skillMappings.filter(mapping => mapping.skillId).map(mapping => {
      const skillId = String(mapping.skillId._id);
      const current = scoreBySkill.get(skillId);
      const contribution = current?.breakdown?.find(entry => String(entry.achievementId) === String(achievement._id));
      return {
        skillId,
        skill: mapping.skillId.name,
        relevance: mapping.relevance,
        currentScore: current?.score ?? null,
        contribution: contribution?.contribution ?? null,
      };
    }),
  };
}

async function assignTask(mentorId, input) {
  const assigned = await MentorStudent.exists({ mentorId, studentId: input.studentId });
  if (!assigned) throw new AppError('Student is not assigned to this mentor.', 403);
  if (!(await Skill.exists({ _id: input.skillId, isActive: true }))) {
    throw new AppError('Skill not found or inactive.', 404);
  }
  return Task.create({ ...input, mentorId });
}

async function getMentorTask(mentorId, taskId) {
  const studentIds = await assignedStudentIds(mentorId);
  const task = await Task.findOne({
    _id: taskId,
    mentorId,
    studentId: { $in: studentIds },
  }).populate('studentId', 'name email').populate('skillId', 'name').lean();
  if (!task) throw new AppError('Task not found in this mentor workspace.', 404);
  return task;
}

async function updateMentorTask(mentorId, taskId, input) {
  const studentIds = await assignedStudentIds(mentorId);
  const filter = { _id: taskId, mentorId, studentId: { $in: studentIds }, status: 'PENDING' };
  if (input.skillId && !(await Skill.exists({ _id: input.skillId, isActive: true }))) {
    throw new AppError('Skill not found or inactive.', 404);
  }
  const update = { $set: {}, $unset: {} };
  for (const field of ['title', 'description', 'skillId', 'priority']) {
    if (input[field] !== undefined) update.$set[field] = input[field];
  }
  if (input.deadline === null || input.deadline === '') update.$unset.deadline = 1;
  else if (input.deadline !== undefined) update.$set.deadline = input.deadline;
  if (!Object.keys(update.$set).length) delete update.$set;
  if (!Object.keys(update.$unset).length) delete update.$unset;
  if (!update.$set && !update.$unset) throw new AppError('Provide at least one task field to update.', 400);

  const task = await Task.findOneAndUpdate(filter, update, { new: true, runValidators: true })
    .populate('studentId', 'name email').populate('skillId', 'name');
  if (!task) {
    const existing = await Task.exists({ _id: taskId, mentorId, studentId: { $in: studentIds } });
    if (!existing) throw new AppError('Task not found in this mentor workspace.', 404);
    throw new AppError('Only pending tasks can be edited.', 409);
  }
  await writeAudit({
    actorId: mentorId,
    action: 'TASK_UPDATED',
    entity: 'Task',
    entityId: task._id,
    metadata: { studentId: task.studentId?._id || task.studentId },
  });
  return task;
}

async function cancelMentorTask(mentorId, taskId) {
  const studentIds = await assignedStudentIds(mentorId);
  const filter = { _id: taskId, mentorId, studentId: { $in: studentIds } };
  const task = await Task.findOne(filter).select('status studentId');
  if (!task) throw new AppError('Task not found in this mentor workspace.', 404);
  if (task.status !== 'PENDING') throw new AppError('Only pending tasks can be cancelled.', 409);
  const deleted = await Task.findOneAndDelete({ ...filter, status: 'PENDING' });
  if (!deleted) throw new AppError('Task could not be cancelled. Please refresh and try again.', 409);
  await writeAudit({
    actorId: mentorId,
    action: 'TASK_CANCELLED',
    entity: 'Task',
    entityId: deleted._id,
    metadata: { studentId: deleted.studentId },
  });
  return deleted;
}

async function addTaskFeedback(mentorId, taskId, feedback) {
  const studentIds = await assignedStudentIds(mentorId);
  const task = await Task.findOneAndUpdate(
    { _id: taskId, mentorId, studentId: { $in: studentIds } },
    { $push: { feedbackHistory: { mentorId, feedback, createdAt: new Date() } } },
    { new: true, runValidators: true },
  ).populate('studentId', 'name email').populate('skillId', 'name');
  if (!task) throw new AppError('Task not found in this mentor workspace.', 404);
  await writeAudit({
    actorId: mentorId,
    action: 'TASK_FEEDBACK_ADDED',
    entity: 'Task',
    entityId: task._id,
    metadata: { studentId: task.studentId?._id || task.studentId },
  });
  return task;
}

module.exports = {
  addTaskFeedback,
  assignTask,
  cancelMentorTask,
  getMentorDashboard,
  getReview,
  getStudentDetail,
  getStudents,
  getMentorTask,
  listMentorAchievements,
  listMentorTasks,
  updateMentorTask,
};
