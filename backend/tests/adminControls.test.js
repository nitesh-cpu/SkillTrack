jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../src/models/MentorStudent', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  safeMetadata: jest.requireActual('../src/middleware/auditMiddleware').safeMetadata,
  writeAudit: jest.fn(),
}));

jest.mock('../src/services/scoringService', () => ({
  recalculateForUser: jest.fn(),
}));

const User = require('../src/models/User');
const MentorStudent = require('../src/models/MentorStudent');
const { safeMetadata, writeAudit } = require('../src/middleware/auditMiddleware');
const adminService = require('../src/services/adminService');

describe('admin access safeguards', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a new student assignment is recorded once with the requested audit event', async () => {
    User.findOne.mockImplementation(({ role }) => Promise.resolve({ _id: role === 'MENTOR' ? 'mentor-id' : 'student-id', role, isActive: true }));
    MentorStudent.findOne.mockResolvedValue(null);
    const assignment = { _id: 'assignment-id', mentorId: 'mentor-id', studentId: 'student-id' };
    MentorStudent.findOneAndUpdate.mockResolvedValue(assignment);

    await expect(adminService.assignMentor({ mentorId: 'mentor-id', studentId: 'student-id' }, 'admin-id'))
      .resolves.toBe(assignment);
    expect(MentorStudent.findOneAndUpdate).toHaveBeenCalledWith(
      { studentId: 'student-id' },
      { $set: { mentorId: 'mentor-id', assignedAt: expect.any(Date) } },
      { upsert: true, new: true, runValidators: true },
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'STUDENT_ASSIGNED',
      metadata: { mentorId: 'mentor-id', studentId: 'student-id' },
    }));
  });

  test('changing mentor records the previous mentor and does not duplicate an unchanged assignment', async () => {
    User.findOne.mockImplementation(({ role }) => Promise.resolve({ _id: role === 'MENTOR' ? 'new-mentor-id' : 'student-id', role, isActive: true }));
    const existing = { _id: 'assignment-id', mentorId: 'old-mentor-id', studentId: 'student-id' };
    MentorStudent.findOne.mockResolvedValue(existing);
    const reassigned = { ...existing, mentorId: 'new-mentor-id' };
    MentorStudent.findOneAndUpdate.mockResolvedValue(reassigned);

    await expect(adminService.assignMentor({ mentorId: 'new-mentor-id', studentId: 'student-id' }, 'admin-id'))
      .resolves.toBe(reassigned);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'MENTOR_CHANGED',
      metadata: { previousMentorId: 'old-mentor-id', mentorId: 'new-mentor-id', studentId: 'student-id' },
    }));

    jest.clearAllMocks();
    User.findOne.mockImplementation(({ role }) => Promise.resolve({ _id: role === 'MENTOR' ? 'old-mentor-id' : 'student-id', role, isActive: true }));
    MentorStudent.findOne.mockResolvedValue(existing);
    await expect(adminService.assignMentor({ mentorId: 'old-mentor-id', studentId: 'student-id' }, 'admin-id'))
      .resolves.toBe(existing);
    expect(MentorStudent.findOneAndUpdate).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  test('removing an assignment emits the student-unassigned event', async () => {
    const assignment = { _id: 'assignment-id', mentorId: 'mentor-id', studentId: 'student-id' };
    MentorStudent.findOneAndDelete.mockResolvedValue(assignment);

    await expect(adminService.removeMentorAssignment('student-id', 'admin-id')).resolves.toBe(assignment);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'STUDENT_UNASSIGNED',
      metadata: { mentorId: 'mentor-id', studentId: 'student-id' },
    }));
  });

  test('an admin cannot demote or deactivate their own account', async () => {
    await expect(adminService.updateUser('admin-id', { role: 'STUDENT' }, 'admin-id'))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(adminService.updateUser('admin-id', { isActive: false }, 'admin-id'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('the last active admin cannot lose administrator access', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ role: 'ADMIN', isActive: true }) });
    User.countDocuments.mockResolvedValue(1);
    await expect(adminService.updateUser('other-admin', { isActive: false }, 'actor-id'))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('role changes revoke existing sessions and return only safe user fields', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ role: 'STUDENT', isActive: true }) });
    User.countDocuments.mockResolvedValue(1);
    const saved = {
      _id: 'user-id',
      name: 'User',
      email: 'user@example.com',
      role: 'MENTOR',
      isActive: true,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      passwordHash: 'must-not-be-returned',
      authVersion: 4,
      select: jest.fn().mockResolvedValue(null),
    };
    User.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(saved) });
    const result = await adminService.updateUser('user-id', { role: 'MENTOR' }, 'admin-id');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-id',
      { $set: { role: 'MENTOR' }, $inc: { authVersion: 1 } },
      { new: true, runValidators: true },
    );
    expect(result).toEqual({
      _id: 'user-id',
      name: 'User',
      email: 'user@example.com',
      role: 'MENTOR',
      isActive: true,
      createdAt: saved.createdAt,
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_ROLE_CHANGED',
      metadata: { isActive: true, previousRole: 'STUDENT', role: 'MENTOR' },
    }));
  });

  test('audit metadata removes sensitive keys recursively', () => {
    expect(safeMetadata({
      action: 'RESET',
      password: 'hidden',
      nested: { accessToken: 'hidden', details: 'safe' },
    })).toEqual({ action: 'RESET', nested: { details: 'safe' } });
  });

  test('creating a user with a batch persists the batch and records it in audit metadata', async () => {
    const created = {
      _id: 'new-user-id',
      name: 'Batch Student',
      email: 'student@example.com',
      role: 'STUDENT',
      batch: 'Batch 2026-A',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    User.create.mockResolvedValue(created);
    const result = await adminService.createUser({
      name: 'Batch Student',
      email: 'student@example.com',
      password: 'initial-password-123',
      role: 'STUDENT',
      batch: 'Batch 2026-A',
    }, 'admin-id');
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Batch Student',
      email: 'student@example.com',
      role: 'STUDENT',
      batch: 'Batch 2026-A',
    }));
    expect(result.batch).toBe('Batch 2026-A');
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_CREATED',
      metadata: { role: 'STUDENT', batch: 'Batch 2026-A' },
    }));
  });

  test('updating a user batch updates the field and includes batch in audit metadata', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ role: 'STUDENT', isActive: true, batch: 'Old Batch' }) });
    const saved = {
      _id: 'user-id',
      name: 'Student',
      email: 'student@example.com',
      role: 'STUDENT',
      batch: 'Batch 2026-B',
      isActive: true,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    User.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(saved) });
    const result = await adminService.updateUser('user-id', { batch: 'Batch 2026-B' }, 'admin-id');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-id',
      { $set: { batch: 'Batch 2026-B' } },
      { new: true, runValidators: true },
    );
    expect(result.batch).toBe('Batch 2026-B');
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_UPDATED',
      metadata: expect.objectContaining({ batch: 'Batch 2026-B' }),
    }));
  });
});
