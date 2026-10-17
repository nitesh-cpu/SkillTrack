const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { getConfig } = require('./config/env');
const { connectDatabase } = require('./config/db');
const User = require('./models/User');
const Skill = require('./models/Skill');
const ScoringRule = require('./models/ScoringRule');
const MentorStudent = require('./models/MentorStudent');

const saltRounds = 12;
const starterSkills = [
  ['Java', 'Programming Languages'],
  ['DSA', 'Computer Science'],
  ['SQL', 'Databases'],
  ['Web Development', 'Software Engineering'],
  ['System Design', 'Software Architecture'],
];

async function seed() {
  const config = getConfig();
  if (config.nodeEnv === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Production seeding is disabled. Set ALLOW_PRODUCTION_SEED=true only for an intentional production bootstrap.');
  }
  await connectDatabase(config.mongoUri);
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 12 characters.');
  const passwordHash = await bcrypt.hash(password, saltRounds);
  let admin = await User.findOne({ email: email.toLowerCase() });
  if (!admin) {
    admin = await User.create({ name: 'SkillTrack Admin', email, passwordHash, role: 'ADMIN' });
  } else {
    admin.passwordHash = passwordHash;
    admin.role = 'ADMIN';
    admin.isActive = true;
    await admin.save();
  }

  for (const [name, category] of starterSkills) {
    await Skill.updateOne({ name }, { $setOnInsert: { name, category, description: `${name} learning and evidence tracking.` } }, { upsert: true });
  }
  const activeRule = await ScoringRule.findOne({ isActive: true });
  if (!activeRule) {
    const latest = await ScoringRule.findOne({}).sort({ version: -1 }).select('version');
    await ScoringRule.create({ version: (latest?.version || 0) + 1, isActive: true, createdBy: admin._id });
  }

  if (process.env.NODE_ENV !== 'production' && process.env.DEV_DEMO_ACCOUNTS === 'true') {
    const demo = [
      { name: 'Rahul Sharma', email: 'rahul@skilltrack.io', role: 'MENTOR' },
      { name: 'Nitesh Kumar', email: 'nitesh@skilltrack.io', role: 'STUDENT' },
      { name: 'Aman Sharma', email: 'aman@skilltrack.io', role: 'STUDENT' },
    ];
    const demoPassword = process.env.DEV_DEMO_PASSWORD;
    if (!demoPassword || demoPassword.length < 12) throw new Error('DEV_DEMO_PASSWORD must be set to at least 12 characters when demo accounts are enabled.');
    const passwordHash = await bcrypt.hash(demoPassword, saltRounds);
    const inserted = new Map();
    for (const account of demo) {
      let user = await User.findOne({ email: account.email });
      if (!user) user = await User.create({ ...account, passwordHash });
      inserted.set(account.email, user);
    }
    const mentor = inserted.get('rahul@skilltrack.io');
    for (const emailAddress of ['nitesh@skilltrack.io', 'aman@skilltrack.io']) {
      await MentorStudent.updateOne({ studentId: inserted.get(emailAddress)._id }, { $setOnInsert: { mentorId: mentor._id } }, { upsert: true });
    }
    console.info('Development demo accounts were ensured.');
  }

  console.info('SkillTrack seed complete.');
}

seed().catch(error => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'seed_failed',
    name: error.name || 'Error',
    code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined,
  }));
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
