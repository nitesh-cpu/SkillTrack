const Skill = require('../models/Skill');
const SkillPrerequisite = require('../models/SkillPrerequisite');
const { assertNoCycle } = require('../utils/graph');
const { AppError } = require('../utils/errors');
const { writeAudit } = require('../middleware/auditMiddleware');
const { getActiveScoringRule, getLatestScores } = require('./scoringService');

async function listActiveSkills() {
  return Skill.find({ isActive: true }).sort({ name: 1 }).lean();
}

async function getActiveSkill(skillId) {
  const skill = await Skill.findOne({ _id: skillId, isActive: true }).lean();
  if (!skill) throw new AppError('Skill not found.', 404);
  const prerequisites = await SkillPrerequisite.find({ skillId: skill._id })
    .populate('prerequisiteSkillId', 'name category')
    .lean();
  return { skill, prerequisites };
}

async function createRelationship({ skillId, prerequisiteSkillId, actorId }) {
  if (
    !(await Skill.exists({ _id: skillId, isActive: true }))
    || !(await Skill.exists({ _id: prerequisiteSkillId, isActive: true }))
  ) {
    throw new AppError('Both skills must exist and be active.', 404);
  }
  const edges = await SkillPrerequisite.find({}).select('skillId prerequisiteSkillId').lean();
  assertNoCycle(edges, skillId, prerequisiteSkillId);
  try {
    const relationship = await SkillPrerequisite.create({ skillId, prerequisiteSkillId });
    await writeAudit({ actorId, action: 'SKILL_RELATIONSHIP_CREATED', entity: 'SkillPrerequisite', entityId: relationship._id });
    return relationship;
  } catch (error) {
    if (error.code === 11000) throw new AppError('This prerequisite already exists.', 409);
    throw error;
  }
}

async function getSkillGraph(userId) {
  const [skills, storedRelationships, scores, rule] = await Promise.all([
    Skill.find({ isActive: true }).select('name description category').sort({ name: 1 }).lean(),
    SkillPrerequisite.find({})
      .populate({ path: 'skillId', match: { isActive: true }, select: 'name category' })
      .populate({ path: 'prerequisiteSkillId', match: { isActive: true }, select: 'name category' })
      .lean(),
    userId ? getLatestScores(userId) : Promise.resolve([]),
    getActiveScoringRule(),
  ]);
  const skillById = new Map(skills.map(skill => [String(skill._id), skill]));
  const scoreBySkill = new Map(scores.map(item => [String(item.skillId), item]));
  const relationshipKeys = new Set();
  const relationships = storedRelationships
    .filter(item => item.skillId?._id && item.prerequisiteSkillId?._id)
    .filter(item => {
      const skillId = String(item.skillId._id);
      const prerequisiteId = String(item.prerequisiteSkillId._id);
      if (!skillById.has(skillId) || !skillById.has(prerequisiteId) || skillId === prerequisiteId) return false;
      const key = `${prerequisiteId}:${skillId}`;
      if (relationshipKeys.has(key)) return false;
      relationshipKeys.add(key);
      return true;
    })
    .map(item => ({
      ...item,
      id: String(item._id),
      skillId: { ...item.skillId, _id: String(item.skillId._id) },
      prerequisiteSkillId: { ...item.prerequisiteSkillId, _id: String(item.prerequisiteSkillId._id) },
    }));

  const prerequisitesBySkill = new Map(skills.map(skill => [String(skill._id), []]));
  const inDegree = new Map(skills.map(skill => [String(skill._id), 0]));
  const outgoing = new Map(skills.map(skill => [String(skill._id), []]));
  for (const relationship of relationships) {
    const skillId = String(relationship.skillId._id);
    const prerequisiteId = String(relationship.prerequisiteSkillId._id);
    prerequisitesBySkill.get(skillId).push({
      id: prerequisiteId,
      name: relationship.prerequisiteSkillId.name,
      score: scoreBySkill.get(prerequisiteId)?.score ?? null,
    });
    inDegree.set(skillId, inDegree.get(skillId) + 1);
    outgoing.get(prerequisiteId).push(skillId);
  }

  const levels = new Map(skills.map(skill => [String(skill._id), 0]));
  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([skillId]) => skillId)
    .sort((left, right) => skillById.get(left).name.localeCompare(skillById.get(right).name));
  const visited = new Set();
  while (queue.length) {
    queue.sort((left, right) => skillById.get(left).name.localeCompare(skillById.get(right).name));
    const prerequisiteId = queue.shift();
    visited.add(prerequisiteId);
    for (const skillId of outgoing.get(prerequisiteId)) {
      levels.set(skillId, Math.max(levels.get(skillId), levels.get(prerequisiteId) + 1));
      inDegree.set(skillId, inDegree.get(skillId) - 1);
      if (inDegree.get(skillId) === 0) queue.push(skillId);
    }
  }
  // Keep legacy cyclic data renderable without letting it block the rest of the graph.
  for (const skillId of levels.keys()) if (!visited.has(skillId)) levels.set(skillId, 0);

  const rowsByLevel = new Map();
  const masteryThreshold = Number(rule?.masteryThreshold ?? 60);
  const graphSkills = skills.map(skill => {
    const id = String(skill._id);
    const current = scoreBySkill.get(id);
    const score = current?.score ?? (userId ? 0 : null);
    const status = score === null ? 'UNASSESSED' : score >= masteryThreshold ? 'MASTERED' : score > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
    const prerequisites = prerequisitesBySkill.get(id).sort((left, right) => left.name.localeCompare(right.name));
    const level = levels.get(id);
    const row = rowsByLevel.get(level) || 0;
    rowsByLevel.set(level, row + 1);
    return {
      ...skill,
      id,
      score,
      status,
      prerequisites,
      scoreDetails: current ? {
        calculatedAt: current.calculatedAt,
        ruleVersion: current.ruleVersion,
        changeReason: current.changeReason,
        breakdown: current.breakdown,
      } : null,
      position: { x: level * 260, y: row * 110 },
      data: {
        label: skill.name,
        skillId: id,
        category: skill.category,
        score,
        status,
        prerequisites,
      },
    };
  });

  const edges = relationships.map(relationship => ({
    id: String(relationship._id),
    source: String(relationship.prerequisiteSkillId._id),
    target: String(relationship.skillId._id),
    type: 'smoothstep',
    label: 'Prerequisite',
    data: { relationshipId: String(relationship._id) },
  }));

  return { skills: graphSkills, relationships, nodes: graphSkills, edges };
}

async function addSkillPrerequisite({ skillId, prerequisiteSkillId, actorId }) {
  const existing = await SkillPrerequisite.exists({ skillId, prerequisiteSkillId });
  if (existing) throw new AppError('This prerequisite already exists.', 409);
  return createRelationship({ skillId, prerequisiteSkillId, actorId });
}

module.exports = {
  addSkillPrerequisite,
  createRelationship,
  getActiveSkill,
  getSkillGraph,
  listActiveSkills,
};
