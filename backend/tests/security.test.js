jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const { authenticate } = require('../src/middleware/authMiddleware');
const { createRateLimiter } = require('../src/middleware/rateLimiter');

const config = {
  jwtSecret: 'test-secret-which-is-at-least-32-characters-long',
  jwtIssuer: 'skilltrack-api',
  jwtAudience: 'skilltrack-client',
};

function tokenFor(overrides = {}) {
  const claims = {
    userId: '507f1f77bcf86cd799439011',
    role: 'STUDENT',
    authVersion: 0,
    ...overrides,
  };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    subject: claims.userId,
    expiresIn: '1h',
  });
}

function runAuthentication(token) {
  const req = {
    get: header => header.toLowerCase() === 'authorization' ? (token ? `Bearer ${token}` : '') : undefined,
    app: { locals: { config } },
  };
  const next = jest.fn();
  authenticate(req, {}, next);
  return new Promise(resolve => setImmediate(() => resolve({ req, next })));
}

function activeUser(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    name: 'Student',
    email: 'student@example.com',
    role: 'STUDENT',
    isActive: true,
    authVersion: 0,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('authentication security boundaries', () => {
  test('rejects a token whose role differs from the current database role', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(activeUser({ role: 'MENTOR' })) });

    const result = await runAuthentication(tokenFor());

    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(result.next.mock.calls[0][0].message).toContain('permissions changed');
  });

  test('rejects a token after the account auth version changes', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(activeUser({ authVersion: 1 })) });

    const result = await runAuthentication(tokenFor());

    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(result.next.mock.calls[0][0].message).toContain('permissions changed');
  });

  test('rejects inactive accounts even when the token is valid', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(activeUser({ isActive: false })) });

    const result = await runAuthentication(tokenFor());

    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(result.next.mock.calls[0][0].message).toContain('account is unavailable');
  });

  test('rejects malformed authentication headers', async () => {
    const result = await runAuthentication('not-a-jwt');

    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ name: 'JsonWebTokenError' }));
    expect(User.findById).not.toHaveBeenCalled();
  });
});

describe('rate-limit security boundary', () => {
  test('returns 429 and Retry-After after the request budget is exhausted', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const req = { ip: '203.0.113.10' };
    const res = { set: jest.fn() };
    const next = jest.fn();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls[2][0]).toEqual(expect.objectContaining({ statusCode: 429 }));
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});