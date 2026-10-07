const nodemailer = require('nodemailer');

async function sendPasswordResetEmail({ email, resetUrl }, smtp) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.auth ? { auth: smtp.auth } : {}),
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.sendMail({
      from: smtp.from,
      to: email,
      subject: 'Reset your SkillTrack password',
      text: [
        'A password reset was requested for your SkillTrack account.',
        '',
        `Use this link within the next few minutes: ${resetUrl}`,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    });
  } finally {
    transport.close();
  }
}

module.exports = { sendPasswordResetEmail };
