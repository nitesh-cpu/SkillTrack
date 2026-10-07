const Achievement = require('../models/Achievement');
const MentorStudent = require('../models/MentorStudent');
const Skill = require('../models/Skill');
const Task = require('../models/Task');
const User = require('../models/User');
const { getLatestScores } = require('./scoringService');
const { getRecommendations } = require('./recommendationService');
const { AppError } = require('../utils/errors');

async function getDashboard(user) {
  const [achievements, scores, tasks, recommendations, recentActivity, mentorAssignment] = await Promise.all([
    Achievement.find({ userId: user._id }).sort({ submittedAt: -1 }).limit(8).populate('reviewedBy', 'name').lean(),
    getLatestScores(user._id),
    Task.find({ studentId: user._id }).sort({ createdAt: -1 }).limit(10).populate('skillId', 'name').lean(),
    getRecommendations(user._id),
    Achievement.find({ userId: user._id, status: { $in: ['VERIFIED', 'REJECTED'] } }).sort({ reviewedAt: -1 }).limit(5).select('title type status reviewedAt').lean(),
    MentorStudent.findOne({ studentId: user._id }).populate('mentorId', 'name email').lean(),
  ]);
  const stats = {
    achievements: achievements.length,
    verified: achievements.filter(item => item.status === 'VERIFIED').length,
    pending: achievements.filter(item => item.status === 'PENDING').length,
    rejected: achievements.filter(item => item.status === 'REJECTED').length,
    tasks: tasks.filter(item => item.status === 'PENDING').length,
  };
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    stats,
    achievements,
    skills: scores,
    tasks,
    mentor: mentorAssignment?.mentorId || null,
    recentActivity,
    recommendations: recommendations.recommendations,
  };
}

async function getProgress(userId) {
  const [achievements, skills, tasks] = await Promise.all([
    Achievement.find({ userId, status: 'VERIFIED' }).sort({ reviewedAt: 1 }).select('type title reviewedAt').lean(),
    getLatestScores(userId),
    Task.find({ studentId: userId }).sort({ createdAt: 1 }).select('title status createdAt updatedAt').lean(),
  ]);
  return { achievements, skills, tasks };
}

async function updateProfile(user, input) {
  const updated = await User.findByIdAndUpdate(user._id, { $set: input }, { new: true, runValidators: true }).select('_id name email role isActive createdAt updatedAt');
  if (!updated) throw new AppError('User not found.', 404);
  return updated;
}

async function getStudentTasks(userId, { page, limit = 25, search, status } = {}) {
  const filter = { studentId: userId };
  if (status) filter.status = status;
  if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  let taskQuery = Task.find(filter).populate('skillId', 'name').sort({ createdAt: -1 });
  let pagination;
  if (page !== undefined) {
    const total = await Task.countDocuments(filter);
    taskQuery = taskQuery.skip((page - 1) * limit).limit(limit);
    pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  }
  const tasks = await taskQuery.lean();
  return { tasks, ...(pagination ? { pagination } : {}) };
}

async function completeTask(userId, taskId) {
  const task = await Task.findOneAndUpdate({ _id: taskId, studentId: userId, status: 'PENDING' }, { $set: { status: 'COMPLETED' } }, { new: true }).populate('skillId', 'name');
  if (!task) throw new AppError('Pending task not found.', 404);
  return task;
}

module.exports = { completeTask, getDashboard, getProgress, getStudentTasks, updateProfile };
