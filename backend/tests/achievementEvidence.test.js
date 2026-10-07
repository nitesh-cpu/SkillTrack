jest.mock('../src/models/Achievement', () => ({
  exists: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/models/AchievementSkill', () => ({
  insertMany: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../src/models/MentorStudent', () => ({
  findOne: jest.fn(),
  exists: jest.fn(),
}));

jest.mock('../src/models/Skill', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../src/services/scoringService', () => ({
  recalculateForUser: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));

const Achievement = require('../src/models/Achievement');
const AchievementSkill = require('../src/models/AchievementSkill');
const MentorStudent = require('../src/models/MentorStudent');
const Skill = require('../src/models/Skill');
const { recalculateForUser } = require('../src/services/scoringService');
const { submitAchievement, reviewAchievement, validateAchievementData } = require('../src/services/achievementService');

const student = { _id: '507f1f77bcf86cd799439011', role: 'STUDENT' };
const evidence = {
  type: 'PROJECT',
  title: 'Portfolio project',
  description: 'A completed project with evidence.',
  data: { proofUrl: 'https://example.test/projects/1', score: 80 },
  skillMappings: [{ skillId: '507f1f77bcf86cd799439012', relevance: 0.8 }],
};

beforeEach(() => jest.clearAllMocks());

function mockPendingAchievement(userId) {
  Achievement.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ userId }),
    }),
  });
}

describe('evidence integrity and verification', () => {
  test.each([
    ['CODING', 'Coding Achievement'],
    ['PROJECT', 'Project'],
    ['COURSE', 'Course/Certification'],
    ['INTERVIEW', 'Competition'],
    ['ASSESSMENT', 'Other Achievement'],
  ])('accepts the %s submission label without changing the stored type', (type, submissionKind) => {
    expect(() => validateAchievementData(type, { submissionKind })).not.toThrow();
  });

  test('rejects a submission label that conflicts with its existing scoring type', () => {
    expect(() => validateAchievementData('PROJECT', { submissionKind: 'Competition' }))
      .toThrow('Submission category does not match its submission type.');
  });

  test('duplicate proof submissions are rejected before evidence is created', async () => {
    Achievement.exists.mockResolvedValue({ _id: 'existing' });
    Skill.countDocuments.mockResolvedValue(1);

    await expect(submitAchievement(student, evidence)).rejects.toMatchObject({
      statusCode: 409,
      message: 'This submission has already been sent.',
    });
    expect(Achievement.create).not.toHaveBeenCalled();
  });

  test('proof fingerprint normalization preserves case-sensitive URL paths', async () => {
    Skill.countDocuments.mockResolvedValue(1);
    Achievement.exists.mockResolvedValue(null);
    Achievement.create.mockResolvedValue({ _id: 'new-evidence', ...evidence });
    AchievementSkill.insertMany.mockResolvedValue([]);
    MentorStudent.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await submitAchievement(student, evidence);
    await submitAchievement(student, {
      ...evidence,
      data: { ...evidence.data, proofUrl: 'https://EXAMPLE.test/Projects/1' },
    });

    const firstFingerprint = Achievement.create.mock.calls[0][0].evidenceFingerprint;
    const secondFingerprint = Achievement.create.mock.calls[1][0].evidenceFingerprint;
    expect(firstFingerprint).not.toBe(secondFingerprint);
  });

  test('unverified evidence is recalculated with the pending status and does not leak the digest', async () => {
    Achievement.exists.mockResolvedValue(null);
    Achievement.create.mockResolvedValue({ _id: 'new-evidence', ...evidence, status: 'PENDING', source: 'SELF' });
    AchievementSkill.insertMany.mockResolvedValue([]);
    MentorStudent.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Skill.countDocuments.mockResolvedValue(1);

    await submitAchievement(student, evidence);

    expect(Achievement.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING',
      source: 'SELF',
      evidenceFingerprint: expect.stringMatching(/^[a-f\d]{64}$/),
    }));
    expect(recalculateForUser).toHaveBeenCalledWith(student._id, { reason: 'evidence_submitted' });
  });

  test('administrator verification marks platform provenance and recalculates evidence', async () => {
    const achievement = {
      _id: 'evidence-id',
      userId: student._id,
      status: 'PENDING',
    };
    mockPendingAchievement(student._id);
    Achievement.findOneAndUpdate.mockResolvedValue(achievement);
    AchievementSkill.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ skillId: 'skill-id' }]),
      }),
    });
    const admin = { _id: 'admin-id', role: 'ADMIN' };

    await reviewAchievement({
      achievementId: achievement._id,
      reviewer: admin,
      status: 'VERIFIED',
      feedback: 'Verified.',
    });

    expect(Achievement.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: achievement._id, userId: student._id, status: 'PENDING' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'VERIFIED', source: 'PLATFORM', reviewedBy: admin._id }),
        $unset: { rejectionReason: 1 },
      }),
      { new: true, runValidators: true },
    );
    expect(recalculateForUser).toHaveBeenCalledWith(student._id, { reason: 'evidence_verified' });
    expect(MentorStudent.exists).not.toHaveBeenCalled();
  });

  test('mentor verification remains limited to assigned students', async () => {
    mockPendingAchievement(student._id);
    MentorStudent.exists.mockResolvedValue(null);
    const mentor = { _id: 'mentor-id', role: 'MENTOR' };

    await expect(reviewAchievement({
      achievementId: 'evidence-id',
      reviewer: mentor,
      status: 'VERIFIED',
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(Achievement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a concurrent second evidence review cannot overwrite the first decision', async () => {
    const admin = { _id: 'admin-id', role: 'ADMIN' };
    mockPendingAchievement(student._id);
    Achievement.findOneAndUpdate.mockResolvedValue(null);

    await expect(reviewAchievement({
      achievementId: 'evidence-id',
      reviewer: admin,
      status: 'VERIFIED',
    })).rejects.toMatchObject({ statusCode: 409, message: 'Pending achievement not found or already reviewed.' });
  });
});
