const mongoose = require('mongoose');

const attemptQuestionSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  question: { type: String, required: true },
  questionType: { type: String, enum: ['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE'], required: true },
  options: { type: [String], default: [] },
  correctAnswer: { type: String, required: true, select: false },
  explanation: { type: String, default: '', select: false },
  topic: { type: String, required: true },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
  marks: { type: Number, required: true },
}, { _id: false });

const attemptAnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  answer: { type: String, maxlength: 1000 },
  savedAt: { type: Date, default: Date.now },
}, { _id: false });

const performanceSchema = new mongoose.Schema({
  label: { type: String, required: true },
  skillId: { type: mongoose.Schema.Types.ObjectId },
  score: { type: Number, required: true },
  maxScore: { type: Number, required: true },
  correctCount: { type: Number, required: true },
  incorrectCount: { type: Number, required: true },
  unansweredCount: { type: Number, required: true },
}, { _id: false });

const resultSchema = new mongoose.Schema({
  score: { type: Number, required: true },
  percentage: { type: Number, required: true },
  passed: { type: Boolean, required: true },
  correctCount: { type: Number, required: true },
  incorrectCount: { type: Number, required: true },
  unansweredCount: { type: Number, required: true },
  evaluatedAt: { type: Date, required: true },
  topicWise: { type: [performanceSchema], default: [] },
  skillWise: { type: [performanceSchema], default: [] },
  difficultyWise: { type: [performanceSchema], default: [] },
}, { _id: false });

const activityEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['TAB_HIDDEN', 'FULLSCREEN_EXITED'], required: true },
  occurredAt: { type: Date, required: true },
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamAssignment', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questions: { type: [attemptQuestionSchema], required: true },
  answers: { type: [attemptAnswerSchema], default: [] },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: true },
  submittedAt: { type: Date },
  status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED'], default: 'IN_PROGRESS', index: true },
  result: { type: resultSchema },
  evidenceSyncedAt: { type: Date },
  evidenceSyncStartedAt: { type: Date },
  suspiciousActivityCount: { type: Number, min: 0, default: 0 },
  activityEvents: { type: [activityEventSchema], default: [] },
}, { timestamps: true });

attemptSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { status: 'IN_PROGRESS' } },
);
attemptSchema.index({ assignmentId: 1, createdAt: -1 });

module.exports = mongoose.models.ExamAttempt || mongoose.model('ExamAttempt', attemptSchema);
