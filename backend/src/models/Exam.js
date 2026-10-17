const mongoose = require('mongoose');

const examQuestionSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  question: { type: String, required: true },
  questionType: { type: String, enum: ['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE'], required: true },
  options: { type: [String], default: [] },
  correctAnswer: { type: String, required: true },
  explanation: { type: String, default: '' },
  topic: { type: String, required: true },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
  marks: { type: Number, required: true, min: 0.25, max: 100 },
}, { _id: false });

const examSecuritySchema = new mongoose.Schema({
  requireFullscreen: { type: Boolean, default: true },
  requireCamera: { type: Boolean, default: true },
  requireMicrophone: { type: Boolean, default: true },
  maxViolations: { type: Number, min: 1, max: 10, default: 1 },
  violationAction: { type: String, enum: ['AUTO_SUBMIT', 'REVIEW'], default: 'AUTO_SUBMIT' },
}, { _id: false });

const examSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  durationMinutes: { type: Number, required: true, min: 1, max: 360 },
  totalMarks: { type: Number, required: true, min: 0.25, max: 10000 },
  passingMarks: { type: Number, required: true, min: 0, max: 10000 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD', 'MIXED'], required: true },
  status: { type: String, enum: ['PUBLISHED', 'ARCHIVED'], default: 'PUBLISHED', index: true },
  questions: { type: [examQuestionSchema], required: true, validate: value => value.length > 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  selectionMode: { type: String, enum: ['MANUAL', 'RANDOM'], required: true },
  security: { type: examSecuritySchema, default: () => ({}) },
}, { timestamps: true });

examSchema.index({ createdBy: 1, createdAt: -1 });
examSchema.index({ status: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.models.Exam || mongoose.model('Exam', examSchema);
