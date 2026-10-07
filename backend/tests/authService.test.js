jest.mock('../src/models/User', () => ({
  exists: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../src/models/PasswordResetToken', () => ({
  create: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/middleware/auditMiddleware', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/passwordResetMailer', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const PasswordResetToken = require('../src/models/PasswordResetToken');
const { sendPasswordResetEmail } = require('../src/services/passwordResetMailer');
const authService = require('../src/services/authService');
const { getConfig } = require('../src/config/env');

const config = {
  jwtSecret: 'test-secret-which-is-at-least-32-characters-long',
  jwtExpiresIn: '1h',
  jwtIssuer: 'skilltrack-api',
  jwtAudience: 'skilltrack-client',
  passwordResetExpiresMinutes: 30,
  passwordResetUrl: 'http://localhost:5173/reset-password',
  smtp: { host: 'smtp.example.test', port: 587, secure: false, from: 'SkillTrack <no-reply@example.test>' },
};

beforeEach(() => {
  jest.clearAllMocks();
  sendPasswordResetEmail.mockResolvedValue(undefined);
});

describe('authentication service', () => {
  test('registration hashes passwords and returns the existing public auth contract', async () => {
    User.exists.mockResolvedValue(null);
    User.create.mockImplementation(async input => ({
      ...input,
      _id: '507f1f77bcf86cd799439011',
      isActive: true,
      authVersion: 0,
    }));

    const result = await authService.registerStudent({
      name: 'New Student',
      email: 'student@example.com',
      password: 'strong-password',
    }, config);

    expect(result.user).toEqual({
      id: '507f1f77bcf86cd799439011',
      name: 'New Student',
      email: 'student@example.com',
      role: 'STUDENT',
      isActive: true,
    });
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');
    const stored = User.create.mock.calls[0][0];
    expect(stored).not.toHaveProperty('password');
    expect(await bcrypt.compare('strong-password', stored.passwordHash)).toBe(true);

    const claims = jwt.verify(result.token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
    expect(claims).toMatchObject({
      userId: '507f1f77bcf86cd799439011',
      sub: '507f1f77bcf86cd799439011',
      role: 'STUDENT',
      authVersion: 0,
    });
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  test('password recovery sends a single-use token without returning or storing it in plain text', async () => {
    const user = { _id: '507f1f77bcf86cd799439011', email: 'student@example.com' };
    User.findOne.mockResolvedValue(user);
    PasswordResetToken.create.mockResolvedValue({ _id: 'reset-record' });

    const result = await authService.createPasswordReset({ email: user.email }, config);
    const email = sendPasswordResetEmail.mock.calls[0][0];
    const rawToken = new URL(email.resetUrl).searchParams.get('token');
    const stored = PasswordResetToken.create.mock.calls[0][0];

    expect(result).toEqual({
      message: 'If an active account exists, password recovery instructions will be sent.',
    });
    expect(rawToken).toMatch(/^[a-f\d]{64}$/);
    expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(email.email).toBe(user.email);
  });

  test('email delivery failures do not reveal whether an account exists', async () => {
    const user = { _id: '507f1f77bcf86cd799439011', email: 'student@example.com' };
    User.findOne.mockResolvedValue(user);
    PasswordResetToken.create.mockResolvedValue({ _id: 'reset-record' });
    sendPasswordResetEmail.mockRejectedValue(new Error('SMTP credentials must not be logged'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = await authService.createPasswordReset({ email: user.email }, config);
      expect(result).toEqual({
        message: 'If an active account exists, password recovery instructions will be sent.',
      });
      expect(PasswordResetToken.deleteOne).toHaveBeenCalledWith({ _id: 'reset-record' });
      expect(errorSpy).toHaveBeenCalledWith('Password reset email delivery failed.', { name: 'Error' });
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('SMTP credentials');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('reset atomically consumes the token, hashes the password, and revokes prior JWTs', async () => {
    const rawToken = 'a'.repeat(64);
    const user = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Student',
      email: 'student@example.com',
      role: 'STUDENT',
      isActive: true,
      authVersion: 3,
      save: jest.fn().mockResolvedValue(undefined),
    };
    PasswordResetToken.findOneAndUpdate.mockResolvedValue({
      _id: 'reset-record',
      userId: user._id,
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const result = await authService.resetPassword({ token: rawToken, password: 'new-strong-password' });
    const [filter, update, options] = PasswordResetToken.findOneAndUpdate.mock.calls[0];

    expect(filter.tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    expect(filter.usedAt).toBeNull();
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
    expect(update.$set.usedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ new: true });
    expect(user.authVersion).toBe(4);
    expect(await bcrypt.compare('new-strong-password', user.passwordHash)).toBe(true);
    expect(result).not.toHaveProperty('passwordHash');

    const token = authService.signToken(user, config);
    const claims = jwt.verify(token, config.jwtSecret);
    expect(claims.authVersion).toBe(4);
  });
});

describe('security configuration', () => {
  const baseEnvironment = {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/skilltrack-test',
    JWT_SECRET: 'test-secret-which-is-at-least-32-characters-long',
    NODE_ENV: 'test',
  };

  test('rejects an empty or excessive JWT lifetime', () => {
    expect(() => getConfig({ ...baseEnvironment, JWT_EXPIRES_IN: '0s' })).toThrow('JWT_EXPIRES_IN');
    expect(() => getConfig({ ...baseEnvironment, JWT_EXPIRES_IN: '31d' })).toThrow('JWT_EXPIRES_IN');
  });

  test('rejects invalid listener ports', () => {
    expect(() => getConfig({ ...baseEnvironment, PORT: '0' })).toThrow('PORT');
    expect(() => getConfig({ ...baseEnvironment, PORT: '65536' })).toThrow('PORT');
    expect(() => getConfig({ ...baseEnvironment, PORT: 'not-a-port' })).toThrow('PORT');
    expect(getConfig({ ...baseEnvironment, PORT: '8080' }).port).toBe(8080);
  });

  test('requires SMTP reset delivery configuration in production', () => {
    expect(() => getConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://skilltrack.example',
    })).toThrow('SMTP_HOST');
  });
});
