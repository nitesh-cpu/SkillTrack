const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { writeAudit } = require('../middleware/auditMiddleware');
const { AppError } = require('../utils/errors');
const { sendPasswordResetEmail } = require('./passwordResetMailer');

const SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('skilltrack-invalid-login-password', SALT_ROUNDS);

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

function signToken(user, config) {
  const authVersion = Number(user.authVersion || 0);
  return jwt.sign(
    { userId: String(user._id), role: user.role, authVersion },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      audience: config.jwtAudience || 'skilltrack-client',
      expiresIn: config.jwtExpiresIn,
      issuer: config.jwtIssuer || 'skilltrack-api',
      subject: String(user._id),
    },
  );
}

async function registerStudent({ name, email, password }, config) {
  const existing = await User.exists({ email: email.toLowerCase() });
  if (existing) throw new AppError('An account with this email already exists.', 409);
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, SALT_ROUNDS), role: 'STUDENT' });
  await writeAudit({ actorId: user._id, action: 'USER_CREATED', entity: 'User', entityId: user._id, metadata: { role: 'STUDENT' } });
  return { user: publicUser(user), token: signToken(user, config) };
}

async function login({ email, password }, config) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +authVersion');
  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !passwordMatches) throw new AppError('Email or password is incorrect.', 401);
  await writeAudit({ actorId: user._id, action: 'USER_LOGIN', entity: 'User', entityId: user._id });
  return { user: publicUser(user), token: signToken(user, config) };
}

async function createPasswordReset({ email }, config) {
  if (!config.smtp) {
    throw new AppError('Password recovery is temporarily unavailable. Please try again later.', 503);
  }
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
  if (!user) return { message: 'If an active account exists, password recovery instructions will be sent.' };
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + config.passwordResetExpiresMinutes * 60 * 1000);
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  const record = await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });
  const resetUrl = new URL(config.passwordResetUrl);
  resetUrl.searchParams.set('token', rawToken);
  try {
    await sendPasswordResetEmail({ email: user.email, resetUrl: resetUrl.toString() }, config.smtp);
  } catch (error) {
    await PasswordResetToken.deleteOne({ _id: record._id });
    console.error('Password reset email delivery failed.', { name: error.name || 'Error' });
  }
  return { message: 'If an active account exists, password recovery instructions will be sent.' };
}

async function resetPassword({ token, password }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const record = await PasswordResetToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!record) throw new AppError('This password reset link is invalid or expired.', 400);
  const user = await User.findById(record.userId).select('+passwordHash +authVersion');
  if (!user || !user.isActive) throw new AppError('This password reset link is invalid or expired.', 400);
  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await PasswordResetToken.deleteMany({ userId: user._id, _id: { $ne: record._id } });
  await writeAudit({ actorId: user._id, action: 'PASSWORD_RESET', entity: 'User', entityId: user._id });
  return publicUser(user);
}

module.exports = { createPasswordReset, login, publicUser, registerStudent, resetPassword, signToken };
