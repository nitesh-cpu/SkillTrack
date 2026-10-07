const Achievement = require('../models/Achievement');
const AchievementSkill = require('../models/AchievementSkill');
const ScoringRule = require('../models/ScoringRule');
const Skill = require('../models/Skill');
const SkillScore = require('../models/SkillScore');
const { AppError } = require('../utils/errors');

const DEFAULT_TYPE_WEIGHTS = Object.freeze({ PROJECT: 0.3, ASSESSMENT: 0.25, CODING: 0.2, COURSE: 0.15, INTERVIEW: 0.1 });
const DEFAULT_RELIABILITY_WEIGHTS = Object.freeze({ SELF: 0.4, MENTOR: 1, PLATFORM: 0.9 });
const DEFAULT_VERIFICATION_WEIGHTS = Object.freeze({ PENDING: 0, VERIFIED: 1, REJECTED: 0 });
const DEFAULT_RULE = Object.freeze({
  difficultyFloor: 0.5,
  difficultyCeiling: 1,
  recencyHalfLifeDays: 365,
  recencyFloor: 0.25,
});

function mapToObject(value, defaults) {
  const supplied = value instanceof Map ? Object.fromEntries(value) : (value || {});
  return { ...defaults, ...supplied };
}

function scoreFromEvidence(item) {
  const data = item.data || {};
  const rawScore = item.score ?? data.score ?? data.achievementScore;
  if (item.type === 'ASSESSMENT' && Number(data.totalMarks) > 0 && rawScore !== undefined) {
    const score = Number(rawScore);
    const totalMarks = Number(data.totalMarks);
    return Number.isFinite(score) && Number.isFinite(totalMarks) && score <= totalMarks
      ? (score / totalMarks) * 100
      : null;
  }
  if (rawScore === undefined || rawScore === null || rawScore === '') return null;
  const score = Number(rawScore);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function recencyFactor(item, rule, now) {
  const halfLife = Number(rule.recencyHalfLifeDays ?? DEFAULT_RULE.recencyHalfLifeDays);
  const floor = Number(rule.recencyFloor ?? DEFAULT_RULE.recencyFloor);
  const submittedAt = item.submittedAt ? new Date(item.submittedAt).getTime() : now;
  if (!Number.isFinite(halfLife) || halfLife <= 0 || !Number.isFinite(floor) || floor < 0 || floor > 1) return null;
  if (!Number.isFinite(submittedAt)) return null;
  const ageDays = Math.max(0, (now - submittedAt) / (24 * 60 * 60 * 1000));
  return Math.max(floor, Math.pow(0.5, ageDays / halfLife));
}

function calculateSkillScore(evidence, rule = {}, options = {}) {
  const typeWeights = mapToObject(rule.typeWeights, DEFAULT_TYPE_WEIGHTS);
  const reliabilityWeights = mapToObject(rule.reliabilityWeights, DEFAULT_RELIABILITY_WEIGHTS);
  const verificationWeights = mapToObject(rule.verificationWeights, DEFAULT_VERIFICATION_WEIGHTS);
  const difficultyFloor = Number(rule.difficultyFloor ?? DEFAULT_RULE.difficultyFloor);
  const difficultyCeiling = Number(rule.difficultyCeiling ?? DEFAULT_RULE.difficultyCeiling);
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  let weightedScore = 0;
  let totalWeight = 0;
  const contributions = [];
  const seen = new Set();

  for (const item of evidence) {
    const evidenceId = String(item.achievementId ?? item._id ?? '');
    if (evidenceId && seen.has(evidenceId)) continue;
    if (evidenceId) seen.add(evidenceId);

    const status = item.status || 'VERIFIED';
    if (status === 'REJECTED') continue;
    const typeWeight = Number(typeWeights[item.type]);
    const reliability = Number(reliabilityWeights[item.source]);
    const verificationWeight = Number(verificationWeights[status]);
    const relevance = Number(item.relevance);
    const difficulty = Number(item.difficulty ?? item.data?.difficulty ?? 0.5);
    const score = scoreFromEvidence(item);
    const recentness = recencyFactor(item, rule, now);
    if (
      ![typeWeight, reliability, verificationWeight, relevance, difficulty, difficultyFloor, difficultyCeiling, recentness, score].every(Number.isFinite)
      || typeWeight < 0 || typeWeight > 1
      || reliability < 0 || reliability > 1
      || verificationWeight < 0 || verificationWeight > 1
      || relevance < 0 || relevance > 1
      || difficulty < 0 || difficulty > 1
      || difficultyFloor < 0 || difficultyFloor > 1
      || difficultyCeiling < difficultyFloor || difficultyCeiling > 1
      || score < 0 || score > 100
    ) continue;

    const difficultyWeight = difficultyFloor + ((difficultyCeiling - difficultyFloor) * difficulty);
    const weight = typeWeight * reliability * verificationWeight * relevance * difficultyWeight * recentness;
    if (weight <= 0) continue;
    weightedScore += weight * score;
    totalWeight += weight;
    contributions.push({
      achievementId: evidenceId,
      title: item.title,
      type: item.type,
      status,
      source: item.source,
      score: Number(score.toFixed(2)),
      relevance,
      difficulty,
      difficultyWeight: Number(difficultyWeight.toFixed(4)),
      verificationWeight,
      recencyWeight: Number(recentness.toFixed(4)),
      weight,
      submittedAt: item.submittedAt || null,
    });
  }

  const score = totalWeight
    ? Math.max(0, Math.min(100, Number((weightedScore / totalWeight).toFixed(2))))
    : 0;
  const breakdown = contributions.map(item => ({
    ...item,
    contribution: Number(((item.weight * item.score) / totalWeight).toFixed(2)),
    explanation: `${item.status.toLowerCase()} ${item.type.toLowerCase()} evidence; type, source, relevance, difficulty, and recency weights applied.`,
  }));
  return { score, breakdown, evidenceCount: contributions.length };
}

async function getActiveScoringRule() {
  return ScoringRule.findOne({ isActive: true }).lean();
}

async function calculateForUserSkill(userId, skillId, options = {}) {
  const skill = await Skill.findOne({ _id: skillId, isActive: true }).select('_id name');
  if (!skill) throw new AppError('Skill not found or inactive.', 404);
  const [mappings, rule, previous] = await Promise.all([
    AchievementSkill.find({ skillId }).populate({
      path: 'achievementId',
      match: { userId, status: { $in: ['PENDING', 'VERIFIED'] } },
      select: 'title type source status data submittedAt reviewedAt',
    }).lean(),
    getActiveScoringRule(),
    SkillScore.findOne({ userId, skillId }).sort({ calculatedAt: -1 }).select('score').lean(),
  ]);
  const evidence = mappings.filter(mapping => mapping.achievementId).map(mapping => ({
    ...mapping.achievementId,
    achievementId: mapping.achievementId._id,
    relevance: mapping.relevance,
    difficulty: mapping.achievementId.data?.difficulty ?? 0.5,
  }));
  const result = calculateSkillScore(evidence, rule || {});
  const previousScore = previous?.score;
  const scoreChanged = previousScore === undefined || previousScore !== result.score;
  const record = await SkillScore.create({
    userId,
    skillId,
    score: result.score,
    breakdown: result.breakdown,
    ruleVersion: rule?.version,
    changeReason: options.reason || 'evidence_recalculated',
    previousScore,
    scoreChanged,
    evidenceCount: result.evidenceCount,
  });
  return {
    skill: { id: String(skill._id), name: skill.name },
    score: record.score,
    breakdown: record.breakdown,
    calculatedAt: record.calculatedAt,
    ruleVersion: record.ruleVersion,
    changeReason: record.changeReason,
    previousScore: record.previousScore,
    scoreChanged: record.scoreChanged,
    evidenceCount: record.evidenceCount,
  };
}

async function recalculateForUser(userId, options = {}) {
  const skills = await Skill.find({ isActive: true }).select('_id name').lean();
  const scores = [];
  for (const skill of skills) {
    scores.push(await calculateForUserSkill(userId, skill._id, options));
  }
  return scores;
}

async function getLatestScores(userId) {
  const [skills, latest, weekly] = await Promise.all([
    Skill.find({ isActive: true }).select('_id name category description').lean(),
    SkillScore.aggregate([
      { $match: { userId } },
      { $sort: { calculatedAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$skillId',
          score: { $first: '$score' },
          breakdown: { $first: '$breakdown' },
          calculatedAt: { $first: '$calculatedAt' },
          ruleVersion: { $first: '$ruleVersion' },
          changeReason: { $first: '$changeReason' },
          previousScore: { $first: '$previousScore' },
          scoreChanged: { $first: '$scoreChanged' },
          evidenceCount: { $first: '$evidenceCount' },
        },
      },
    ]),
    SkillScore.aggregate([
      { $match: { userId, calculatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $sort: { calculatedAt: 1, _id: 1 } },
      { $group: { _id: '$skillId', first: { $first: '$score' }, last: { $last: '$score' }, count: { $sum: 1 } } },
    ]),
  ]);
  const bySkill = new Map(latest.map(item => [String(item._id), item]));
  const weeklyBySkill = new Map(weekly.map(item => [String(item._id), item]));
  return skills.map(skill => {
    const score = bySkill.get(String(skill._id));
    const trend = weeklyBySkill.get(String(skill._id));
    return {
      skillId: skill._id,
      name: skill.name,
      category: skill.category,
      description: skill.description,
      score: score?.score ?? 0,
      breakdown: score?.breakdown ?? [],
      calculatedAt: score?.calculatedAt ?? null,
      ruleVersion: score?.ruleVersion ?? null,
      changeReason: score?.changeReason ?? null,
      previousScore: score?.previousScore ?? null,
      scoreChanged: score?.scoreChanged ?? false,
      evidenceCount: score?.evidenceCount ?? 0,
      weeklyGrowth: trend?.count > 1 ? Number((trend.last - trend.first).toFixed(2)) : 0,
    };
  });
}

async function getSkillHistory(userId, skillId) {
  if (!(await Skill.exists({ _id: skillId, isActive: true }))) throw new AppError('Skill not found.', 404);
  return SkillScore.find({ userId, skillId })
    .sort({ calculatedAt: 1, _id: 1 })
    .select('score breakdown calculatedAt ruleVersion changeReason previousScore scoreChanged evidenceCount')
    .lean();
}

async function getSkillScore(userId, skillId) {
  const score = await SkillScore.findOne({ userId, skillId })
    .sort({ calculatedAt: -1, _id: -1 })
    .populate('skillId', 'name category')
    .lean();
  if (!score) {
    if (!(await Skill.exists({ _id: skillId, isActive: true }))) throw new AppError('Skill not found.', 404);
    return {
      skill: await Skill.findById(skillId).select('name category').lean(),
      score: 0,
      breakdown: [],
      calculatedAt: null,
      ruleVersion: null,
      changeReason: null,
      previousScore: null,
      scoreChanged: false,
      evidenceCount: 0,
    };
  }
  return {
    skill: score.skillId,
    score: score.score,
    breakdown: score.breakdown,
    calculatedAt: score.calculatedAt,
    ruleVersion: score.ruleVersion ?? null,
    changeReason: score.changeReason ?? null,
    previousScore: score.previousScore ?? null,
    scoreChanged: score.scoreChanged ?? false,
    evidenceCount: score.evidenceCount ?? score.breakdown?.length ?? 0,
  };
}

module.exports = {
  DEFAULT_RELIABILITY_WEIGHTS,
  DEFAULT_TYPE_WEIGHTS,
  DEFAULT_VERIFICATION_WEIGHTS,
  calculateForUserSkill,
  calculateSkillScore,
  getActiveScoringRule,
  getLatestScores,
  getSkillHistory,
  getSkillScore,
  recalculateForUser,
};
