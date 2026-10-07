const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
  questionType: { type: String, enum: ['MCQ', 'TRUE_FALSE', 'SHORT_OBJECTIVE'], required: true },
  options: { type: [String], default: [] },
  correctAnswer: { type: String, required: true, trim: true, maxlength: 1000 },
  explanation: { type: String, trim: true, maxlength: 2000, default: '' },
  topic: { type: String, required: true, trim: true, maxlength: 120 },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true, index: true },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
  marks: { type: Number, required: true, min: 0.25, max: 100 },
  status: { type: String, enum: ['DRAFT', 'APPROVED', 'ARCHIVED'], default: 'DRAFT', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, { timestamps: true });

questionSchema.index({ status: 1, topic: 1, difficulty: 1, questionType: 1 });
questionSchema.index({ createdBy: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Question || mongoose.model('Question', questionSchema);
