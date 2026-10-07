jest.mock('../src/models/Achievement', () => ({}));
jest.mock('../src/models/AchievementSkill', () => ({
  find: jest.fn(),
}));
jest.mock('../src/models/ScoringRule', () => ({
  findOne: jest.fn(),
}));
jest.mock('../src/models/Skill', () => ({
  findOne: jest.fn(),
}));
jest.mock('../src/models/SkillScore', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
}));

const AchievementSkill = require('../src/models/AchievementSkill');
const ScoringRule = require('../src/models/ScoringRule');
const Skill = require('../src/models/Skill');
const SkillScore = require('../src/models/SkillScore');
const { calculateForUserSkill } = require('../src/services/scoringService');

const skillId = '507f1f77bcf86cd799439012';
const userId = '507f1f77bcf86cd799439011';

function mockEvidence() {
  AchievementSkill.find.mockReturnValue({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{
        relevance: 0.75,
        achievementId: {
          _id: '507f1f77bcf86cd799439013',
          title: 'Assessment',
          type: 'ASSESSMENT',
          source: 'MENTOR',
          status: 'VERIFIED',
          data: { score: 8, totalMarks: 10, difficulty: 0.8 },
          submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      }]),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Skill.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: skillId, name: 'Assessment skills' }) });
  ScoringRule.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      version: 4,
      isActive: true,
      typeWeights: { ASSESSMENT: 1 },
      reliabilityWeights: { MENTOR: 1 },
      verificationWeights: { VERIFIED: 1, PENDING: 0, REJECTED: 0 },
      difficultyFloor: 0.5,
      difficultyCeiling: 1,
      recencyHalfLifeDays: 365,
      recencyFloor: 0.25,
    }),
  });
  SkillScore.findOne.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ score: 80 }),
      }),
    }),
  });
  SkillScore.create.mockImplementation(async record => ({
    ...record,
    calculatedAt: new Date('2026-01-02T00:00:00.000Z'),
  }));
  mockEvidence();
});

describe('score calculation history', () => {
  test('persists active rule version, evidence explanation, prior score, and recalculation reason', async () => {
    const result = await calculateForUserSkill(userId, skillId, { reason: 'evidence_verified' });

    const record = SkillScore.create.mock.calls[0][0];
    expect(record).toMatchObject({
      userId,
      skillId,
      score: 80,
      previousScore: 80,
      scoreChanged: false,
      ruleVersion: 4,
      changeReason: 'evidence_verified',
      evidenceCount: 1,
    });
    expect(record.breakdown[0]).toMatchObject({
      achievementId: '507f1f77bcf86cd799439013',
      status: 'VERIFIED',
      score: 80,
      verificationWeight: 1,
      difficulty: 0.8,
      explanation: expect.stringContaining('verified'),
    });
    expect(result).toMatchObject({
      score: 80,
      previousScore: 80,
      scoreChanged: false,
      ruleVersion: 4,
      changeReason: 'evidence_verified',
    });
    expect(AchievementSkill.find).toHaveBeenCalledWith({ skillId });
  });
});
