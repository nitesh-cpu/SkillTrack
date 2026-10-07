const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('node:crypto');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const mentorRoutes = require('./routes/mentorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const skillRoutes = require('./routes/skillRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const questionRoutes = require('./routes/questionRoutes');
const examRoutes = require('./routes/examRoutes');
const learningRoutes = require('./routes/learningRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

function createApp(config) {
  const app = express();
  app.locals.config = config;
  app.disable('x-powered-by');
  const allowedOrigins = Array.isArray(config.clientOrigin)
    ? config.clientOrigin
    : config.clientOrigin.split(',').map(origin => origin.trim());
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      if (config.nodeEnv === 'test') return;
      console.info(JSON.stringify({
        level: 'info',
        event: 'http_request',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      }));
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      const { AppError } = require('./utils/errors');
      return callback(new AppError('Origin is not allowed.', 403));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/api/v1/health', (req, res) => res.status(200).json({
    success: true,
    message: 'SkillTrack API is ready.',
    data: { service: 'skilltrack-api', status: 'ok', version: 'v1' },
  }));
  app.get('/api/health', (req, res) => res.status(200).json({ success: true, message: 'SkillTrack API is ready.' }));
  const versionedRoutes = [
    ['/questions', questionRoutes],
    ['/exams', examRoutes],
    ['/learning', learningRoutes],
    ['/auth', authRoutes],
    ['/student', studentRoutes],
    ['/mentor', mentorRoutes],
    ['/admin', adminRoutes],
    ['/achievements', achievementRoutes],
    ['/skills', skillRoutes],
    ['/scores', scoreRoutes],
  ];
  for (const [prefix, router] of versionedRoutes) {
    app.use(`/api/v1${prefix}`, router);
    app.use(`/api${prefix}`, router);
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
