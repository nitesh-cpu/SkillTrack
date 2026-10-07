const { getConfig } = require('./config/env');
const { connectDatabase } = require('./config/db');
const { createApp } = require('./app');

async function startServer() {
  const config = getConfig();
  await connectDatabase(config.mongoUri);
  const app = createApp(config);
  const server = app.listen(config.port, () => console.info(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port: config.port,
  })));
  const { expireDueAttempts } = require('./services/examAttemptService');
  const expireAttempts = () => expireDueAttempts().catch(error => console.error(JSON.stringify({
    level: 'error',
    event: 'exam_attempt_expiration_failed',
    name: error.name || 'Error',
    code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined,
  })));
  void expireAttempts();
  const expirationTimer = setInterval(expireAttempts, 15_000);
  expirationTimer.unref();
  const shutdown = async () => {
    clearInterval(expirationTimer);
    server.close(async () => {
      const mongoose = require('mongoose');
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'server_start_failed',
      name: error.name || 'Error',
      code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined,
    }));
    process.exit(1);
  });
}

module.exports = { startServer };
