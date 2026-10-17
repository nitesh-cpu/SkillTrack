const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET;
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().includes('replace-with')) {
    throw new Error('JWT_SECRET must be a configured secret of at least 32 characters.');
  }

  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const jwtExpiresIn = env.JWT_EXPIRES_IN || '1d';
  const jwtLifetime = /^(\d+)([smhd])$/.exec(jwtExpiresIn);
  const jwtLifetimeSeconds = jwtLifetime
    ? Number(jwtLifetime[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 })[jwtLifetime[2]]
    : 0;
  if (!jwtLifetimeSeconds || jwtLifetimeSeconds > 30 * 24 * 60 * 60) {
    throw new Error('JWT_EXPIRES_IN must be a positive duration such as 15m, 1h, or 1d.');
  }

  const passwordResetExpiresMinutes = Number(env.PASSWORD_RESET_EXPIRES_MINUTES || 30);
  if (!Number.isInteger(passwordResetExpiresMinutes) || passwordResetExpiresMinutes < 5 || passwordResetExpiresMinutes > 60) {
    throw new Error('PASSWORD_RESET_EXPIRES_MINUTES must be an integer between 5 and 60.');
  }

  const smtpHost = env.SMTP_HOST?.trim();
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtpFrom = env.SMTP_FROM?.trim();
  const smtpUser = env.SMTP_USER?.trim();
  const smtpPassword = env.SMTP_PASSWORD;
  const smtpSecure = env.SMTP_SECURE || 'false';
  const smtpConfigured = Boolean(smtpHost || smtpFrom || smtpUser || smtpPassword);
  if (smtpConfigured && (!smtpHost || !smtpFrom || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new Error('SMTP_HOST, SMTP_FROM, and a valid SMTP_PORT are required to enable password reset email.');
  }
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must both be configured when SMTP authentication is used.');
  }
  if (!['true', 'false'].includes(smtpSecure)) {
    throw new Error('SMTP_SECURE must be either true or false.');
  }

  const clientOrigin = (env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  if (!clientOrigin.length) throw new Error('CLIENT_ORIGIN must include at least one allowed origin.');
  if ((env.NODE_ENV || 'development') === 'production' && clientOrigin.some(origin => !origin.startsWith('https://'))) {
    throw new Error('CLIENT_ORIGIN must use HTTPS in production.');
  }
  const passwordResetUrl = env.PASSWORD_RESET_URL || `${clientOrigin[0]}/reset-password`;
  let resetUrl;
  try {
    resetUrl = new URL(passwordResetUrl);
  } catch {
    throw new Error('PASSWORD_RESET_URL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(resetUrl.protocol) || !clientOrigin.includes(resetUrl.origin)) {
    throw new Error('PASSWORD_RESET_URL must use an allowed CLIENT_ORIGIN.');
  }
  if ((env.NODE_ENV || 'development') === 'production' && resetUrl.protocol !== 'https:') {
    throw new Error('PASSWORD_RESET_URL must use HTTPS in production.');
  }


  return {
    port,
    mongoUri: env.MONGODB_URI,
    jwtSecret,
    jwtExpiresIn,
    jwtIssuer: 'skilltrack-api',
    jwtAudience: 'skilltrack-client',
    clientOrigin,
    passwordResetExpiresMinutes,
    passwordResetUrl,
    smtp: smtpConfigured ? {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure === 'true',
      from: smtpFrom,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
    } : null,
    nodeEnv: env.NODE_ENV || 'development',
  };
}

module.exports = { getConfig };
