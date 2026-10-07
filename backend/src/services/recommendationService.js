const Achievement = require('../models/Achievement');
const AchievementSkill = require('../models/AchievementSkill');
const Skill = require('../models/Skill');
const SkillPrerequisite = require('../models/SkillPrerequisite');
const { getActiveScoringRule, getLatestScores } = require('./scoringService');

const suggestedActions = [
  'Complete an assessment',
  'Build a small project',
  'Ask your mentor for a practice task',
];

async function getRecommendations(userId) {
  const [scores, edges, pending, rule] = await Promise.all([
    getLatestScores(userId),
    SkillPrerequisite.find({})
      .populate({ path: 'skillId', match: { isActive: true }, select: 'name' })
      .populate({ path: 'prerequisiteSkillId', match: { isActive: true }, select: 'name' })
      .lean(),
    Achievement.countDocuments({ userId, status: 'PENDING' }),
    getActiveScoringRule(),
  ]);
  const scoreBySkill = new Map(scores.map(item => [String(item.skillId), item]));
  const masteryThreshold = Number(rule?.masteryThreshold ?? 60);
  const practiceThreshold = Number(rule?.practiceThreshold ?? 75);
  const recommendations = [];
  const recommendedSkills = new Set();
  const edgeKeys = new Set();

  const prerequisites = edges
    .filter(edge => edge.skillId?._id && edge.prerequisiteSkillId?._id)
    .filter(edge => String(edge.skillId._id) !== String(edge.prerequisiteSkillId._id))
    .filter(edge => {
      const key = `${edge.prerequisiteSkillId._id}:${edge.skillId._id}`;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftScore = scoreBySkill.get(String(left.prerequisiteSkillId._id))?.score ?? 0;
      const rightScore = scoreBySkill.get(String(right.prerequisiteSkillId._id))?.score ?? 0;
      return leftScore - rightScore;
    });

  for (const edge of prerequisites) {
    const prerequisiteId = String(edge.prerequisiteSkillId._id);
    const nextSkill = scoreBySkill.get(String(edge.skillId._id));
    const prerequisite = scoreBySkill.get(prerequisiteId);
    const prerequisiteScore = prerequisite?.score ?? 0;
    if (prerequisiteScore >= masteryThreshold || (nextSkill && nextSkill.score >= practiceThreshold) || recommendedSkills.has(prerequisiteId)) {
      continue;
    }
    recommendedSkills.add(prerequisiteId);
    recommendations.push({
      type: 'SKILL_PREREQUISITE',
      skillId: prerequisiteId,
      skill: edge.prerequisiteSkillId.name,
      score: prerequisiteScore,
      status: prerequisiteScore > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      blockedSkill: edge.skillId.name,
      blockedSkillId: String(edge.skillId._id),
      message: prerequisiteScore > 0
        ? `Continue strengthening ${edge.prerequisiteSkillId.name} before moving further with ${edge.skillId.name}.`
        : `Build a foundation in ${edge.prerequisiteSkillId.name} before moving on to ${edge.skillId.name}.`,
      suggestedActions,
    });
  }

  const weakSkills = scores
    .filter(score => score.score < practiceThreshold && !recommendedSkills.has(String(score.skillId)))
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
  for (const skill of weakSkills) {
    recommendations.push({
      type: 'SKILL_PRACTICE',
      skillId: String(skill.skillId),
      skill: skill.name,
      score: skill.score,
      status: skill.score > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      message: skill.score > 0
        ? `Strengthen ${skill.name} with a focused practice activity.`
        : `Start building evidence for ${skill.name}.`,
      suggestedActions,
    });
  }

  if (pending > 0) recommendations.push({
    type: 'PENDING_REVIEW',
    message: 'Your submitted achievements are waiting for mentor feedback.',
    pendingCount: pending,
    suggestedActions: ['Review your submitted proof', 'Add a helpful description'],
  });

  const activeSkills = await Skill.countDocuments({ isActive: true });
  const verifiedCount = await Achievement.countDocuments({ userId, status: 'VERIFIED' });
  const mappedCount = await AchievementSkill.countDocuments({
    achievementId: { $in: await Achievement.find({ userId, status: 'VERIFIED' }).distinct('_id') },
  });
  return {
    recommendations,
    summary: { activeSkills, verifiedAchievements: verifiedCount, skillEvidenceMappings: mappedCount },
  };
}

module.exports = { getRecommendations };
