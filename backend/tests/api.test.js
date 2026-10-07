jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../src/models/MentorStudent', () => ({
  exists: jest.fn(),
}));

jest.mock('../src/models/Achievement', () => ({
  findOne: jest.fn(),
}));

jest.mock('../src/services/authService', () => ({
  registerStudent: jest.fn(),
  login: jest.fn(),
  publicUser: jest.fn(user => ({ id: String(user._id), name: user.name, email: user.email, role: user.role })),
  createPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
}));

jest.mock('../src/services/adminService', () => ({
  getDashboard: jest.fn(),
  recalculateStudentScores: jest.fn(),
  listUsersPage: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  getUserDirectory: jest.fn(),
  assignMentor: jest.fn(),
  removeMentorAssignment: jest.fn(),
  listSkills: jest.fn(),
  addSkill: jest.fn(),
  updateSkill: jest.fn(),
  deactivateSkill: jest.fn(),
  createSkillRelationship: jest.fn(),
  deleteSkillRelationship: jest.fn(),
  getAuditLogs: jest.fn(),
  createScoringRule: jest.fn(),
  updateScoringRule: jest.fn(),
  activateScoringRule: jest.fn(),
}));

jest.mock('../src/services/mentorService', () => ({
  getMentorDashboard: jest.fn(),
  getStudents: jest.fn(),
  listMentorAchievements: jest.fn(),
  listMentorTasks: jest.fn(),
  getStudentDetail: jest.fn(),
  getReview: jest.fn(),
  getMentorTask: jest.fn(),
  assignTask: jest.fn(),
  updateMentorTask: jest.fn(),
  cancelMentorTask: jest.fn(),
  addTaskFeedback: jest.fn(),
}));

jest.mock('../src/services/achievementService', () => ({
  ACHIEVEMENT_TYPES: ['CODING', 'PROJECT', 'ASSESSMENT', 'COURSE', 'INTERVIEW'],
  submitAchievement: jest.fn(),
  listOwnedAchievements: jest.fn(),
  getOwnedAchievement: jest.fn(),
  deletePendingAchievement: jest.fn(),
  reviewAchievement: jest.fn(),
}));

jest.mock('../src/services/studentService', () => ({
  getDashboard: jest.fn(),
  getProgress: jest.fn(),
  getStudentTasks: jest.fn(),
  updateProfile: jest.fn(),
  completeTask: jest.fn(),
}));

jest.mock('../src/services/recommendationService', () => ({
  getRecommendations: jest.fn(),
}));

jest.mock('../src/services/scoringService', () => ({
  getLatestScores: jest.fn(),
  getSkillHistory: jest.fn(),
  getSkillScore: jest.fn(),
  recalculateForUser: jest.fn(),
}));

jest.mock('../src/services/skillService', () => ({
  getSkillGraph: jest.fn(),
}));

jest.mock('../src/services/questionService', () => ({
  listQuestions: jest.fn(),
  createQuestion: jest.fn(),
  updateQuestion: jest.fn(),
  approveQuestion: jest.fn(),
  archiveQuestion: jest.fn(),
}));

jest.mock('../src/services/examService', () => ({
  listExams: jest.fn(),
  createExam: jest.fn(),
  getExam: jest.fn(),
  assignExam: jest.fn(),
  archiveExam: jest.fn(),
}));

jest.mock('../src/services/examAttemptService', () => ({
  expireDueAttempts: jest.fn(),
  getAttempt: jest.fn(),
  listResults: jest.fn(),
  listStudentExams: jest.fn(),
  listStudentResults: jest.fn(),
  recordActivity: jest.fn(),
  saveAnswer: jest.fn(),
  startAttempt: jest.fn(),
  submitAttempt: jest.fn(),
}));

jest.mock('../src/services/learningService', () => ({
  addModule: jest.fn(),
  assignCourse: jest.fn(),
  createCourse: jest.fn(),
  listCourses: jest.fn(),
  saveStudentProgress: jest.fn(),
  studentLesson: jest.fn(),
  updateCourse: jest.fn(),
  updateLesson: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../src/models/User');
const MentorStudent = require('../src/models/MentorStudent');
const Achievement = require('../src/models/Achievement');
const authService = require('../src/services/authService');
const adminService = require('../src/services/adminService');
const mentorService = require('../src/services/mentorService');
const { createApp } = require('../src/app');
const { AppError } = require('../src/utils/errors');

const config = { jwtSecret: 'test-secret-which-is-at-least-32-characters-long', jwtExpiresIn: '1h', jwtIssuer: 'skilltrack-api', jwtAudience: 'skilltrack-client', clientOrigin: 'http://localhost:5173', nodeEnv: 'test', passwordResetExpiresMinutes: 30 };
const actors = {
  student: { _id: '507f1f77bcf86cd799439011', name: 'Student', email: 'student@example.com', role: 'STUDENT', isActive: true, authVersion: 0 },
  mentor: { _id: '507f1f77bcf86cd799439012', name: 'Mentor', email: 'mentor@example.com', role: 'MENTOR', isActive: true, authVersion: 0 },
  admin: { _id: '507f1f77bcf86cd799439013', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true, authVersion: 0 },
};

function tokenFor(actor) {
  return jwt.sign(
    { userId: actor._id, role: actor.role, authVersion: actor.authVersion },
    config.jwtSecret,
    { issuer: config.jwtIssuer, audience: config.jwtAudience, subject: actor._id },
  );
}

function authenticateAs(actor) {
  User.findById.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(actor) }));
}

const app = createApp(config);

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(actors.student) }));
});

describe('API envelope and access control', () => {
  test('health endpoint is available without a database session', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'SkillTrack API is ready.' });
  });

  test('versioned API health and routes respond while legacy paths remain available', async () => {
    const versionedHealth = await request(app).get('/api/v1/health');
    expect(versionedHealth.status).toBe(200);
    expect(versionedHealth.body.data).toEqual({ service: 'skilltrack-api', status: 'ok', version: 'v1' });
    expect(versionedHealth.headers['x-request-id']).toBeTruthy();

    authenticateAs(actors.admin);
    adminService.getDashboard.mockResolvedValue({ stats: { users: 1 } });
    const response = await request(app).get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor(actors.admin)}`);
    expect(response.status).toBe(200);
    expect(response.body.data.stats.users).toBe(1);
  });

  test('protected endpoints reject a missing bearer token', async () => {
    const response = await request(app).get('/api/admin/dashboard');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, message: 'Authentication is required.' });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  test('student cannot access admin or mentor APIs', async () => {
    authenticateAs(actors.student);
    const token = tokenFor(actors.student);
    expect((await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get('/api/mentor/dashboard').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  test('versioned admin API keeps backend role enforcement', async () => {
    authenticateAs(actors.student);
    const response = await request(app).get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor(actors.student)}`);
    expect(response.status).toBe(403);
    expect(adminService.getDashboard).not.toHaveBeenCalled();
  });

  test('mentor cannot access admin APIs', async () => {
    authenticateAs(actors.mentor);
    const response = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${tokenFor(actors.mentor)}`);
    expect(response.status).toBe(403);
  });

  test('question bank access is restricted to admins and mentors', async () => {
    const questionService = require('../src/services/questionService');
    authenticateAs(actors.student);
    const studentResponse = await request(app).get('/api/v1/questions')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(studentResponse.status).toBe(403);
    expect(questionService.listQuestions).not.toHaveBeenCalled();

    authenticateAs(actors.mentor);
    questionService.listQuestions.mockResolvedValue({ questions: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
    const mentorResponse = await request(app).get('/api/v1/questions?status=DRAFT&limit=25')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '));
    expect(mentorResponse.status).toBe(200);
    expect(questionService.listQuestions).toHaveBeenCalledWith(actors.mentor, {
      status: 'DRAFT', limit: 25, page: 1,
    });
  });

  test('only admins can approve questions and question inputs are validated', async () => {
    const questionService = require('../src/services/questionService');
    const questionId = '507f1f77bcf86cd799439099';
    authenticateAs(actors.mentor);
    const forbidden = await request(app).patch(`/api/v1/questions/${questionId}/approve`)
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '));
    expect(forbidden.status).toBe(403);
    expect(questionService.approveQuestion).not.toHaveBeenCalled();

    authenticateAs(actors.admin);
    questionService.approveQuestion.mockResolvedValue({ _id: questionId, status: 'APPROVED' });
    const approved = await request(app).patch(`/api/v1/questions/${questionId}/approve`)
      .set('Authorization', ['Bearer', tokenFor(actors.admin)].join(' '));
    expect(approved.status).toBe(200);
    expect(questionService.approveQuestion).toHaveBeenCalledWith(actors.admin, questionId);

    const invalid = await request(app).post('/api/v1/questions')
      .set('Authorization', ['Bearer', tokenFor(actors.admin)].join(' '))
      .send({ question: 'too short', unsupported: true });
    expect(invalid.status).toBe(400);
    expect(questionService.createQuestion).not.toHaveBeenCalled();
  });

  test('exam authoring and assignment routes reject students and use authenticated actors', async () => {
    const examService = require('../src/services/examService');
    const examId = '507f1f77bcf86cd799439099';
    authenticateAs(actors.student);
    const denied = await request(app).get('/api/v1/exams')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(denied.status).toBe(403);
    expect(examService.listExams).not.toHaveBeenCalled();

    authenticateAs(actors.admin);
    examService.createExam.mockResolvedValue({ _id: examId, title: 'HTTP basics', status: 'PUBLISHED' });
    const created = await request(app).post('/api/v1/exams')
      .set('Authorization', ['Bearer', tokenFor(actors.admin)].join(' '))
      .send({
        title: 'HTTP basics',
        durationMinutes: 30,
        passingMarks: 1,
        startAt: '2030-01-01T10:00:00.000Z',
        endAt: '2030-01-01T11:00:00.000Z',
        selectionMode: 'MANUAL',
        questionIds: ['507f1f77bcf86cd799439098'],
      });
    expect(created.status).toBe(201);
    expect(examService.createExam).toHaveBeenCalledWith(actors.admin, expect.objectContaining({
      title: 'HTTP basics',
      durationMinutes: 30,
      selectionMode: 'MANUAL',
    }));

    authenticateAs(actors.mentor);
    examService.assignExam.mockResolvedValue({ assignments: [], newlyAssigned: 1 });
    const assigned = await request(app).post(`/api/v1/exams/${examId}/assignments`)
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({ studentIds: ['507f1f77bcf86cd799439098'] });
    expect(assigned.status).toBe(200);
    expect(examService.assignExam).toHaveBeenCalledWith(actors.mentor, examId, ['507f1f77bcf86cd799439098']);
  });

  test('student exam routes use the authenticated student identity and reject mentors', async () => {
    const attemptService = require('../src/services/examAttemptService');
    authenticateAs(actors.mentor);
    const forbidden = await request(app).get('/api/v1/student/exams')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '));
    expect(forbidden.status).toBe(403);
    expect(attemptService.listStudentExams).not.toHaveBeenCalled();

    authenticateAs(actors.student);
    attemptService.listStudentExams.mockResolvedValue([]);
    const response = await request(app).get('/api/v1/student/exams')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(response.status).toBe(200);
    expect(attemptService.listStudentExams).toHaveBeenCalledWith(actors.student._id);
  });

  test('exam result routes enforce roles and derive student identity from authentication', async () => {
    const attemptService = require('../src/services/examAttemptService');
    authenticateAs(actors.mentor);
    const studentDenied = await request(app).get('/api/v1/student/results')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '));
    expect(studentDenied.status).toBe(403);
    expect(attemptService.listStudentResults).not.toHaveBeenCalled();

    authenticateAs(actors.student);
    attemptService.listStudentResults.mockResolvedValue({ results: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
    const ownResults = await request(app).get('/api/v1/student/results')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(ownResults.status).toBe(200);
    expect(attemptService.listStudentResults).toHaveBeenCalledWith(actors.student._id, { page: 1, limit: 25 });

    authenticateAs(actors.student);
    const adminMentorDenied = await request(app).get('/api/v1/exams/results')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(adminMentorDenied.status).toBe(403);
    expect(attemptService.listResults).not.toHaveBeenCalled();

    authenticateAs(actors.mentor);
    attemptService.listResults.mockResolvedValue({ results: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
    const mentorResults = await request(app).get('/api/v1/exams/results?page=2&limit=10')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '));
    expect(mentorResults.status).toBe(200);
    expect(attemptService.listResults).toHaveBeenCalledWith(actors.mentor, { page: 2, limit: 10 });
  });

  test('video learning APIs restrict course authoring and use the authenticated student for progress', async () => {
    const learningService = require('../src/services/learningService');
    authenticateAs(actors.student);
    const denied = await request(app).get('/api/v1/learning/courses')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(denied.status).toBe(403);
    expect(learningService.listCourses).not.toHaveBeenCalled();

    learningService.listCourses.mockResolvedValue([]);
    const studentCourses = await request(app).get('/api/v1/learning/student/courses')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '));
    expect(studentCourses.status).toBe(200);
    expect(learningService.listCourses).toHaveBeenCalledWith(actors.student);

    authenticateAs(actors.mentor);
    learningService.createCourse.mockResolvedValue({ title: 'HTTP foundations' });
    const created = await request(app).post('/api/v1/learning/courses')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({
        title: 'HTTP foundations',
        skillId: '507f1f77bcf86cd799439098',
        status: 'PUBLISHED',
        modules: [{
          title: 'Requests',
          lessons: [{
            title: 'Request basics',
            videoUrl: 'https://media.example.com/request-basics.mp4',
            durationSeconds: 600,
            topic: 'HTTP',
            skillId: '507f1f77bcf86cd799439098',
          }],
        }],
      });
    expect(created.status).toBe(201);
    expect(learningService.createCourse).toHaveBeenCalledWith(actors.mentor, expect.objectContaining({
      title: 'HTTP foundations',
    }));

    const courseId = '507f1f77bcf86cd799439098';
    const lessonId = '507f1f77bcf86cd799439097';
    learningService.updateLesson.mockResolvedValue({ title: 'Updated HTTP foundations' });
    const updated = await request(app).patch(`/api/v1/learning/courses/${courseId}/lessons/${lessonId}`)
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({ title: 'Updated HTTP foundations' });
    expect(updated.status).toBe(200);
    expect(learningService.updateLesson).toHaveBeenCalledWith(
      actors.mentor,
      courseId,
      lessonId,
      { title: 'Updated HTTP foundations' },
    );
  });

  test('exam activity route authenticates students, validates event types, and records for the current attempt', async () => {
    const attemptService = require('../src/services/examAttemptService');
    const attemptId = '507f1f77bcf86cd799439099';
    authenticateAs(actors.mentor);
    const denied = await request(app).post(`/api/v1/student/exam-attempts/${attemptId}/activity`)
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({ type: 'TAB_HIDDEN' });
    expect(denied.status).toBe(403);
    expect(attemptService.recordActivity).not.toHaveBeenCalled();

    authenticateAs(actors.student);
    const invalid = await request(app).post(`/api/v1/student/exam-attempts/${attemptId}/activity`)
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '))
      .send({ type: 'ANSWER_KEY_REQUESTED' });
    expect(invalid.status).toBe(400);

    attemptService.recordActivity.mockResolvedValue({ suspiciousActivityCount: 1, recorded: true });
    const response = await request(app).post(`/api/v1/student/exam-attempts/${attemptId}/activity`)
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '))
      .send({ type: 'TAB_HIDDEN' });
    expect(response.status).toBe(200);
    expect(attemptService.recordActivity).toHaveBeenCalledWith(actors.student._id, attemptId, 'TAB_HIDDEN');
  });

  test('admin can access admin dashboard', async () => {
    authenticateAs(actors.admin);
    adminService.getDashboard.mockResolvedValue({ stats: { users: 1 } });
    const response = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${tokenFor(actors.admin)}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Admin dashboard loaded.', data: { stats: { users: 1 } } });
  });

  test('admin user directory validates and applies server-side pagination and filters', async () => {
    authenticateAs(actors.admin);
    const token = tokenFor(actors.admin);
    adminService.listUsersPage.mockResolvedValue({
      users: [{ _id: '507f1f77bcf86cd799439099', name: 'Mentor', role: 'MENTOR', isActive: true }],
      pagination: { page: 2, limit: 10, total: 11, pages: 2 },
    });
    const response = await request(app).get('/api/admin/users?page=2&limit=10&search=mentor&role=MENTOR&isActive=true')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(adminService.listUsersPage).toHaveBeenCalledWith({
      page: 2, limit: 10, search: 'mentor', role: 'MENTOR', isActive: true,
    });
    expect(response.body.data.pagination.total).toBe(11);

    const invalid = await request(app).get('/api/admin/users?page=0&limit=1000')
      .set('Authorization', `Bearer ${token}`);
    expect(invalid.status).toBe(400);
    expect(adminService.listUsersPage).toHaveBeenCalledTimes(1);
  });

  test('admins can request role changes while backend keeps authorization and input validation', async () => {
    authenticateAs(actors.admin);
    const token = tokenFor(actors.admin);
    adminService.updateUser.mockResolvedValue({ id: '507f1f77bcf86cd799439099', role: 'ADMIN' });
    const response = await request(app).patch('/api/admin/users/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(adminService.updateUser).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439099', { role: 'ADMIN' }, actors.admin._id,
    );

    const invalid = await request(app).patch('/api/admin/users/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ passwordHash: 'not-allowed' });
    expect(invalid.status).toBe(400);
  });

  test('non-admins cannot remove mentor assignments or inspect audit logs', async () => {
    authenticateAs(actors.mentor);
    const token = tokenFor(actors.mentor);
    expect((await request(app).delete('/api/admin/mentor-students/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect(adminService.removeMentorAssignment).not.toHaveBeenCalled();
  });

  test('only admins can create mentor assignments through the protected API', async () => {
    authenticateAs(actors.admin);
    const mentorId = '507f1f77bcf86cd799439099';
    const studentId = '507f1f77bcf86cd799439098';
    adminService.assignMentor.mockResolvedValue({ mentorId, studentId });
    const response = await request(app).post('/api/v1/admin/mentor-students')
      .set('Authorization', ['Bearer', tokenFor(actors.admin)].join(' '))
      .send({ mentorId, studentId });

    expect(response.status).toBe(201);
    expect(adminService.assignMentor).toHaveBeenCalledWith({ mentorId, studentId }, actors.admin._id);

    authenticateAs(actors.mentor);
    const forbidden = await request(app).post('/api/v1/admin/mentor-students')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({ mentorId, studentId });
    expect(forbidden.status).toBe(403);
  });

  test('student task listing validates query filters and paginates within the authenticated account', async () => {
    authenticateAs(actors.student);
    const token = tokenFor(actors.student);
    const studentService = require('../src/services/studentService');
    studentService.getStudentTasks.mockResolvedValue({ tasks: [], pagination: { page: 2, limit: 10, total: 12, pages: 2 } });
    const response = await request(app).get('/api/v1/student/tasks?page=2&limit=10&status=PENDING')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(studentService.getStudentTasks).toHaveBeenCalledWith(actors.student._id, {
      page: 2, limit: 10, status: 'PENDING',
    });
    expect(response.body.data.pagination.total).toBe(12);

    const invalid = await request(app).get('/api/v1/student/tasks?status=ALL')
      .set('Authorization', `Bearer ${token}`);
    expect(invalid.status).toBe(400);
    expect(studentService.getStudentTasks).toHaveBeenCalledTimes(1);
  });

  test('mentor listing endpoints apply validated pagination using the authenticated mentor identity', async () => {
    authenticateAs(actors.mentor);
    const token = tokenFor(actors.mentor);
    mentorService.getStudents.mockResolvedValue({ students: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
    const response = await request(app).get('/api/v1/mentor/students?search=student&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(mentorService.getStudents).toHaveBeenCalledWith(actors.mentor._id, {
      search: 'student', limit: 10, page: 1,
    });
    expect(response.body.data.pagination.limit).toBe(10);

    const invalid = await request(app).get('/api/v1/mentor/students?unknown=value')
      .set('Authorization', `Bearer ${token}`);
    expect(invalid.status).toBe(400);
  });

  test('student evidence listing supports validated pagination and filters', async () => {
    authenticateAs(actors.student);
    const token = tokenFor(actors.student);
    const evidenceService = require('../src/services/achievementService');
    evidenceService.listOwnedAchievements.mockResolvedValue({ achievements: [], pagination: { page: 1, limit: 5, total: 0, pages: 0 } });
    const response = await request(app).get('/api/v1/achievements/my?type=PROJECT&limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(evidenceService.listOwnedAchievements).toHaveBeenCalledWith(actors.student._id, {
      type: 'PROJECT', limit: 5, page: 1,
    });

    const invalid = await request(app).get('/api/v1/achievements/my?type=UNKNOWN')
      .set('Authorization', `Bearer ${token}`);
    expect(invalid.status).toBe(400);
  });

  test('scoring rule updates validate factor keys and accept valid draft weights', async () => {
    authenticateAs(actors.admin);
    const token = tokenFor(actors.admin);
    const invalid = await request(app).patch('/api/admin/scoring-rules/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ typeWeights: { UNKNOWN: 1 } });
    expect(invalid.status).toBe(400);
    expect(adminService.updateScoringRule).not.toHaveBeenCalled();

    adminService.updateScoringRule.mockResolvedValue({ version: 2, isActive: false });
    const valid = await request(app).patch('/api/admin/scoring-rules/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ typeWeights: { PROJECT: 0.4 }, reliabilityWeights: { MENTOR: 1 } });
    expect(valid.status).toBe(200);
    expect(adminService.updateScoringRule).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439099',
      { typeWeights: { PROJECT: 0.4 }, reliabilityWeights: { MENTOR: 1 } },
      actors.admin._id,
    );
  });

  test('scoring rule updates validate verification and recency factors', async () => {
    authenticateAs(actors.admin);
    const token = tokenFor(actors.admin);
    const invalid = await request(app).patch('/api/admin/scoring-rules/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ verificationWeights: { UNKNOWN: 1 } });
    expect(invalid.status).toBe(400);

    adminService.updateScoringRule.mockResolvedValue({ version: 2, isActive: false });
    const valid = await request(app).patch('/api/admin/scoring-rules/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${token}`)
      .send({ verificationWeights: { PENDING: 0.1 }, recencyHalfLifeDays: 180, recencyFloor: 0.2 });
    expect(valid.status).toBe(200);
    expect(adminService.updateScoringRule).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439099',
      { verificationWeights: { PENDING: 0.1 }, recencyHalfLifeDays: 180, recencyFloor: 0.2 },
      actors.admin._id,
    );
  });

  test('JWT role changes cannot preserve stale authorization', async () => {
    authenticateAs(actors.student);
    const staleToken = jwt.sign(
      { userId: actors.student._id, role: 'ADMIN', authVersion: 0 },
      config.jwtSecret,
      { issuer: config.jwtIssuer, audience: config.jwtAudience, subject: actors.student._id },
    );
    const response = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${staleToken}`);
    expect(response.status).toBe(401);
  });

  test('expired tokens are rejected with a safe authentication error', async () => {
    const expiredToken = jwt.sign(
      { userId: actors.student._id, role: 'STUDENT', authVersion: 0 },
      config.jwtSecret,
      {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        subject: actors.student._id,
        expiresIn: -1,
      },
    );
    const response = await request(app).get('/api/student/dashboard').set('Authorization', ['Bearer', expiredToken].join(' '));
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, message: 'Your session has expired. Please sign in again.' });
  });

  test('tokens from another issuer or audience are rejected', async () => {
    const invalidToken = jwt.sign(
      { userId: actors.student._id, role: 'STUDENT', authVersion: 0 },
      config.jwtSecret,
      { issuer: 'other-api', audience: config.jwtAudience, subject: actors.student._id },
    );
    const response = await request(app).get('/api/student/dashboard').set('Authorization', ['Bearer', invalidToken].join(' '));
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Your session is invalid. Please sign in again.');
  });

  test('tokens from a previous account auth version are rejected', async () => {
    authenticateAs({ ...actors.student, authVersion: 1 });
    const staleToken = tokenFor(actors.student);
    const response = await request(app).get('/api/student/dashboard').set('Authorization', ['Bearer', staleToken].join(' '));
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Your account permissions changed. Please sign in again.');
  });

  test('only student-role users can access the personalized skill graph route', async () => {
    authenticateAs(actors.mentor);
    const response = await request(app)
      .get('/api/student/skill-graph')
      .set('Authorization', `Bearer ${tokenFor(actors.mentor)}`);
    expect(response.status).toBe(403);
  });

  test('students cannot use the mentor evidence-verification API', async () => {
    authenticateAs(actors.student);
    const response = await request(app)
      .patch('/api/achievements/507f1f77bcf86cd799439099/verify')
      .set('Authorization', `Bearer ${tokenFor(actors.student)}`)
      .send({});
    expect(response.status).toBe(403);
  });

  test('administrators can verify evidence using the protected review endpoint', async () => {
    authenticateAs(actors.admin);
    const response = await request(app)
      .patch('/api/achievements/507f1f77bcf86cd799439099/verify')
      .set('Authorization', `Bearer ${tokenFor(actors.admin)}`)
      .send({ feedback: 'Reviewed.' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(require('../src/services/achievementService').reviewAchievement)
      .toHaveBeenCalledWith(expect.objectContaining({
        achievementId: '507f1f77bcf86cd799439099',
        status: 'VERIFIED',
      }));
  });

  test('unknown endpoints return the standard 404 envelope', async () => {
    const response = await request(app).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('not found');
  });

  test('unknown request fields are rejected without echoing field contents', async () => {
    const secretValue = 'do-not-echo-this-secret';
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'student@example.com',
      password: 'long-password',
      [secretValue]: 'value',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Request contains unsupported fields.');
    expect(JSON.stringify(response.body)).not.toContain(secretValue);
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('production errors return a safe message and a correlatable request ID', async () => {
    authenticateAs(actors.admin);
    adminService.getDashboard.mockRejectedValue(new Error('Mongo URI contains sensitive credentials'));
    const originalEnvironment = app.locals.config.nodeEnv;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    app.locals.config.nodeEnv = 'production';
    try {
      const response = await request(app).get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${tokenFor(actors.admin)}`);
      expect(response.status).toBe(500);
      expect(response.body.message).toBe('An unexpected server error occurred.');
      expect(JSON.stringify(response.body)).not.toContain('sensitive credentials');
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"api_error"'));
      expect(consoleSpy.mock.calls[0][0]).not.toContain('sensitive credentials');
    } finally {
      app.locals.config.nodeEnv = originalEnvironment;
      consoleSpy.mockRestore();
    }
  });

  test('structured request logs include correlation metadata and omit query secrets', async () => {
    const originalEnvironment = app.locals.config.nodeEnv;
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    app.locals.config.nodeEnv = 'production';
    const secret = 'private-query-value';
    try {
      const response = await request(app).get(`/api/v1/health?access_token=${secret}`);
      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalled();
      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log).toMatchObject({
        level: 'info',
        event: 'http_request',
        requestId: response.headers['x-request-id'],
        method: 'GET',
        path: '/api/v1/health',
        statusCode: 200,
      });
      expect(consoleSpy.mock.calls[0][0]).not.toContain(secret);
    } finally {
      app.locals.config.nodeEnv = originalEnvironment;
      consoleSpy.mockRestore();
    }
  });
});

describe('authentication contract', () => {
  test('public registration rejects caller-supplied role fields', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'New Student', email: 'new@example.com', password: 'long-password', role: 'ADMIN',
    });
    expect(response.status).toBe(400);
    expect(authService.registerStudent).not.toHaveBeenCalled();
  });

  test('registration rejects invalid email and weak password', async () => {
    const response = await request(app).post('/api/auth/register').send({ name: 'X', email: 'bad', password: 'weak' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false });
    expect(authService.registerStudent).not.toHaveBeenCalled();
  });

  test('auth responses are non-cacheable and invalid reset tokens are not echoed', async () => {
    const secret = 'invalid-reset-token-value';
    const response = await request(app).post('/api/auth/reset-password').send({
      token: secret,
      password: 'valid-password-123',
    });
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.message).not.toContain(secret);
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });
});

describe('mentor ownership boundaries', () => {
  test('mentor cannot view a student outside their assignment', async () => {
    authenticateAs(actors.mentor);
    mentorService.getStudentDetail.mockRejectedValue(new AppError('Student is not assigned to this mentor.', 403));
    const response = await request(app).get('/api/mentor/students/507f1f77bcf86cd799439099').set('Authorization', `Bearer ${tokenFor(actors.mentor)}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Student is not assigned to this mentor.');
  });

  test('review service refuses an achievement belonging to an unassigned student', async () => {
    const actualService = jest.requireActual('../src/services/achievementService');
    const pending = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ userId: '507f1f77bcf86cd799439011' }),
    };
    Achievement.findOne.mockReturnValue(pending);
    Achievement.findOneAndUpdate = jest.fn();
    MentorStudent.exists.mockResolvedValue(null);
    await expect(actualService.reviewAchievement({
      achievementId: '507f1f77bcf86cd799439099',
      mentor: actors.mentor,
      status: 'VERIFIED',
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(Achievement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('non-mentors cannot add feedback to mentor tasks', async () => {
    authenticateAs(actors.student);
    const response = await request(app)
      .post('/api/mentor/tasks/507f1f77bcf86cd799439099/feedback')
      .set('Authorization', ['Bearer', tokenFor(actors.student)].join(' '))
      .send({ feedback: 'Nice progress.' });
    expect(response.status).toBe(403);
    expect(mentorService.addTaskFeedback).not.toHaveBeenCalled();
  });

  test('mentor task feedback endpoint delegates to mentor-owned task service', async () => {
    authenticateAs(actors.mentor);
    mentorService.addTaskFeedback.mockResolvedValue({ _id: 'task-id' });
    const response = await request(app)
      .post('/api/mentor/tasks/507f1f77bcf86cd799439099/feedback')
      .set('Authorization', ['Bearer', tokenFor(actors.mentor)].join(' '))
      .send({ feedback: 'Nice progress.' });
    expect(response.status).toBe(201);
    expect(mentorService.addTaskFeedback).toHaveBeenCalledWith(
      actors.mentor._id,
      '507f1f77bcf86cd799439099',
      'Nice progress.',
    );
  });

  test('mentor task details, edits, and cancellation use mentor-protected endpoints', async () => {
    authenticateAs(actors.mentor);
    const taskId = '507f1f77bcf86cd799439099';
    mentorService.getMentorTask.mockResolvedValue({ _id: taskId });
    mentorService.updateMentorTask.mockResolvedValue({ _id: taskId });
    mentorService.cancelMentorTask.mockResolvedValue({ _id: taskId });
    mentorService.assignTask.mockResolvedValue({ _id: taskId });
    const authorization = ['Bearer', tokenFor(actors.mentor)].join(' ');

    const assigned = await request(app).post('/api/v1/mentor/tasks')
      .set('Authorization', authorization)
      .send({
        studentId: '507f1f77bcf86cd799439098',
        title: 'Practice algorithms',
        description: 'Solve two array problems.',
        skillId: '507f1f77bcf86cd799439097',
        priority: 'MEDIUM',
      });
    expect(assigned.status).toBe(201);
    expect(mentorService.assignTask).toHaveBeenCalledWith(actors.mentor._id, {
      studentId: '507f1f77bcf86cd799439098',
      title: 'Practice algorithms',
      description: 'Solve two array problems.',
      skillId: '507f1f77bcf86cd799439097',
      priority: 'MEDIUM',
    });

    const details = await request(app).get(`/api/v1/mentor/tasks/${taskId}`).set('Authorization', authorization);
    expect(details.status).toBe(200);
    expect(mentorService.getMentorTask).toHaveBeenCalledWith(actors.mentor._id, taskId);

    const updated = await request(app).patch(`/api/v1/mentor/tasks/${taskId}`)
      .set('Authorization', authorization)
      .send({ title: 'Updated task', deadline: null });
    expect(updated.status).toBe(200);
    expect(mentorService.updateMentorTask).toHaveBeenCalledWith(actors.mentor._id, taskId, { title: 'Updated task', deadline: null });

    const cancelled = await request(app).delete(`/api/v1/mentor/tasks/${taskId}`)
      .set('Authorization', authorization);
    expect(cancelled.status).toBe(200);
    expect(mentorService.cancelMentorTask).toHaveBeenCalledWith(actors.mentor._id, taskId);
  });
});
