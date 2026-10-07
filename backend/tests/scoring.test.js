const { calculateSkillScore } = require('../src/services/scoringService');

describe('verified achievement skill scoring', () => {
  test('applies type, difficulty, reliability and skill relevance weights', () => {
    const result = calculateSkillScore([
      { achievementId: 'project-1', type: 'PROJECT', source: 'MENTOR', difficulty: 1, relevance: 0.8, score: 80, title: 'Project' },
      { achievementId: 'coding-1', type: 'CODING', source: 'SELF', difficulty: 0.5, relevance: 1, score: 60, title: 'Coding' },
    ]);
    expect(result.score).toBe(76);
    expect(result.breakdown.map(item => item.contribution)).toEqual([64, 12]);
  });

  test('rejected achievements do not contribute and scores remain between zero and one hundred', () => {
    const result = calculateSkillScore([
      { achievementId: 'approved', type: 'ASSESSMENT', source: 'MENTOR', difficulty: 1, relevance: 1, score: 100, status: 'VERIFIED' },
      { achievementId: 'rejected', type: 'PROJECT', source: 'MENTOR', difficulty: 1, relevance: 1, score: 0, status: 'REJECTED' },
      { achievementId: 'pending', type: 'COURSE', source: 'SELF', difficulty: 1, relevance: 1, score: 0, status: 'PENDING' },
    ]);
    expect(result.score).toBe(100);
    expect(result.breakdown).toHaveLength(1);
    expect(calculateSkillScore([])).toEqual({ score: 0, breakdown: [], evidenceCount: 0 });
  });

  test('invalid relevance/difficulty/score evidence is excluded', () => {
    const result = calculateSkillScore([{ type: 'PROJECT', source: 'MENTOR', difficulty: 1.5, relevance: 1.5, score: 150 }]);
    expect(result).toEqual({ score: 0, breakdown: [], evidenceCount: 0 });
  });

  test('pending evidence impact is controlled by verification weights', () => {
    const result = calculateSkillScore([
      { achievementId: 'verified', type: 'PROJECT', source: 'MENTOR', status: 'VERIFIED', difficulty: 1, relevance: 1, score: 0 },
      { achievementId: 'pending', type: 'PROJECT', source: 'SELF', status: 'PENDING', difficulty: 1, relevance: 1, score: 100 },
    ], {
      typeWeights: { PROJECT: 1 },
      reliabilityWeights: { MENTOR: 1, SELF: 1 },
      verificationWeights: { VERIFIED: 1, PENDING: 0.25, REJECTED: 0 },
      difficultyFloor: 1,
      difficultyCeiling: 1,
      recencyFloor: 1,
    });

    expect(result.score).toBe(20);
    expect(result.breakdown.map(item => item.verificationWeight)).toEqual([1, 0.25]);
  });

  test('recent evidence is weighted more strongly than older evidence', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const result = calculateSkillScore([
      { achievementId: 'recent', type: 'PROJECT', source: 'MENTOR', status: 'VERIFIED', difficulty: 1, relevance: 1, score: 100, submittedAt: now },
      { achievementId: 'old', type: 'PROJECT', source: 'MENTOR', status: 'VERIFIED', difficulty: 1, relevance: 1, score: 0, submittedAt: new Date('2024-12-31T00:00:00.000Z') },
    ], {
      typeWeights: { PROJECT: 1 },
      reliabilityWeights: { MENTOR: 1 },
      verificationWeights: { VERIFIED: 1 },
      difficultyFloor: 1,
      difficultyCeiling: 1,
      recencyHalfLifeDays: 365,
      recencyFloor: 0,
    }, { now });

    expect(result.score).toBeGreaterThan(66);
    expect(result.score).toBeLessThan(67);
    expect(result.breakdown[0].recencyWeight).toBe(1);
    expect(result.breakdown[1].recencyWeight).toBeLessThan(0.5);
  });

  test('duplicate evidence identifiers contribute only once', () => {
    const result = calculateSkillScore([
      { achievementId: 'same-evidence', type: 'PROJECT', source: 'MENTOR', difficulty: 1, relevance: 1, score: 80 },
      { achievementId: 'same-evidence', type: 'PROJECT', source: 'MENTOR', difficulty: 1, relevance: 1, score: 20 },
    ]);

    expect(result.score).toBe(80);
    expect(result.breakdown).toHaveLength(1);
    expect(result.evidenceCount).toBe(1);
  });

  test('evidence without a measurable result is not assigned an invented score', () => {
    expect(calculateSkillScore([
      { achievementId: 'unscored', type: 'PROJECT', source: 'MENTOR', difficulty: 1, relevance: 1 },
    ])).toMatchObject({ score: 0, breakdown: [], evidenceCount: 0 });
  });

  test('verified exam evidence is normalized and scored through the existing assessment rules', () => {
    const result = calculateSkillScore([{
      achievementId: 'exam-attempt-skill-evidence',
      type: 'ASSESSMENT',
      source: 'PLATFORM',
      status: 'VERIFIED',
      relevance: 1,
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      data: {
        sourceType: 'EXAM',
        assessmentId: 'exam-id',
        score: 17,
        totalMarks: 20,
        difficulty: 0.5,
        topic: 'HTTP',
      },
    }], { recencyFloor: 1 }, { now: new Date('2026-01-01T00:00:00.000Z') });

    expect(result.score).toBe(85);
    expect(result.evidenceCount).toBe(1);
    expect(result.breakdown[0]).toMatchObject({
      type: 'ASSESSMENT',
      source: 'PLATFORM',
      status: 'VERIFIED',
      score: 85,
      difficulty: 0.5,
    });
  });
});
