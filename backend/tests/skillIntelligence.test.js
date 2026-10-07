jest.mock('../src/models/Skill', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../src/models/SkillPrerequisite', () => ({
  find: jest.fn(),
}));

jest.mock('../src/models/SkillScore', () => ({
  aggregate: jest.fn(),
}));

jest.mock('../src/models/Achievement', () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../src/models/AchievementSkill', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../src/services/scoringService', () => ({
  getActiveScoringRule: jest.fn(),
  getLatestScores: jest.fn(),
}));

const Skill = require('../src/models/Skill');
const SkillPrerequisite = require('../src/models/SkillPrerequisite');
const Achievement = require('../src/models/Achievement');
const AchievementSkill = require('../src/models/AchievementSkill');
const scoringService = require('../src/services/scoringService');
const { getSkillGraph } = require('../src/services/skillService');
const { getRecommendations } = require('../src/services/recommendationService');

const javaId = '507f1f77bcf86cd799439011';
const oopId = '507f1f77bcf86cd799439012';
const dsaId = '507f1f77bcf86cd799439013';

function graphSkills() {
  Skill.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: javaId, name: 'Java', category: 'Programming' },
          { _id: oopId, name: 'OOP', category: 'Programming' },
          { _id: dsaId, name: 'DSA', category: 'Computer Science' },
        ]),
      }),
    }),
  });
  const relationships = [
    { _id: 'edge-1', skillId: { _id: oopId, name: 'OOP' }, prerequisiteSkillId: { _id: javaId, name: 'Java' } },
    { _id: 'edge-duplicate', skillId: { _id: oopId, name: 'OOP' }, prerequisiteSkillId: { _id: javaId, name: 'Java' } },
    { _id: 'edge-2', skillId: { _id: dsaId, name: 'DSA' }, prerequisiteSkillId: { _id: oopId, name: 'OOP' } },
    { _id: 'edge-inactive', skillId: null, prerequisiteSkillId: { _id: javaId, name: 'Java' } },
  ];
  SkillPrerequisite.find.mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(relationships),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  scoringService.getActiveScoringRule.mockResolvedValue({ masteryThreshold: 60, practiceThreshold: 75 });
  Skill.countDocuments.mockResolvedValue(3);
  Achievement.countDocuments.mockImplementation(({ status }) => Promise.resolve(status === 'PENDING' ? 1 : status === 'VERIFIED' ? 2 : 0));
  Achievement.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(['achievement-1', 'achievement-2']) });
  AchievementSkill.countDocuments.mockResolvedValue(3);
});

describe('skill graph generation', () => {
  test('returns unique React Flow nodes and correctly directed prerequisite edges with score metadata', async () => {
    graphSkills();
    scoringService.getLatestScores.mockResolvedValue([
      { skillId: javaId, name: 'Java', score: 80, calculatedAt: new Date('2026-01-01'), ruleVersion: 3, changeReason: 'evidence_verified', breakdown: [] },
      { skillId: oopId, name: 'OOP', score: 35 },
      { skillId: dsaId, name: 'DSA', score: 0 },
    ]);

    const result = await getSkillGraph('student-id');

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toEqual([
      expect.objectContaining({ id: 'edge-1', source: javaId, target: oopId }),
      expect.objectContaining({ id: 'edge-2', source: oopId, target: dsaId }),
    ]);
    expect(result.skills.find(item => item.id === javaId)).toMatchObject({
      score: 80,
      status: 'MASTERED',
      prerequisites: [],
      scoreDetails: { ruleVersion: 3, changeReason: 'evidence_verified' },
    });
    expect(result.skills.find(item => item.id === dsaId).prerequisites).toEqual([
      { id: oopId, name: 'OOP', score: 35 },
    ]);
    expect(result.skills.find(item => item.id === javaId).position.x).toBeLessThan(
      result.skills.find(item => item.id === oopId).position.x,
    );
  });
});

describe('recommendation generation', () => {
  test('prioritizes unmet prerequisites and reports weak or incomplete skills with score status', async () => {
    scoringService.getLatestScores.mockResolvedValue([
      { skillId: javaId, name: 'Java', score: 20 },
      { skillId: oopId, name: 'OOP', score: 10 },
      { skillId: dsaId, name: 'DSA', score: 0 },
    ]);
    SkillPrerequisite.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { skillId: { _id: oopId, name: 'OOP' }, prerequisiteSkillId: { _id: javaId, name: 'Java' } },
        { skillId: { _id: dsaId, name: 'DSA' }, prerequisiteSkillId: { _id: oopId, name: 'OOP' } },
      ]),
    });

    const result = await getRecommendations('student-id');

    expect(result.recommendations.slice(0, 2)).toEqual([
      expect.objectContaining({ type: 'SKILL_PREREQUISITE', skillId: oopId, blockedSkillId: dsaId, score: 10 }),
      expect.objectContaining({ type: 'SKILL_PREREQUISITE', skillId: javaId, blockedSkillId: oopId, score: 20 }),
    ]);
    expect(result.recommendations.at(-1)).toMatchObject({ type: 'PENDING_REVIEW', pendingCount: 1 });
    expect(new Set(result.recommendations.filter(item => item.skillId).map(item => item.skillId)).size)
      .toBe(result.recommendations.filter(item => item.skillId).length);
    expect(result.summary).toEqual({ activeSkills: 3, verifiedAchievements: 2, skillEvidenceMappings: 3 });
  });

  test('does not recommend mastered prerequisites or skills meeting configured practice threshold', async () => {
    scoringService.getLatestScores.mockResolvedValue([
      { skillId: javaId, name: 'Java', score: 85 },
      { skillId: oopId, name: 'OOP', score: 80 },
      { skillId: dsaId, name: 'DSA', score: 75 },
    ]);
    scoringService.getActiveScoringRule.mockResolvedValue({ masteryThreshold: 60, practiceThreshold: 75 });
    SkillPrerequisite.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { skillId: { _id: oopId, name: 'OOP' }, prerequisiteSkillId: { _id: javaId, name: 'Java' } },
      ]),
    });
    Achievement.countDocuments.mockResolvedValue(0);

    const result = await getRecommendations('student-id');

    expect(result.recommendations).toEqual([]);
  });
});
