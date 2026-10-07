const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['CODING', 'PROJECT', 'ASSESSMENT', 'COURSE', 'INTERVIEW'], required: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  description: { type: String, required: true, trim: true, minlength: 5, maxlength: 3000 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  evidenceFingerprint: { type: String, select: false },
  status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING', index: true },
  source: { type: String, enum: ['SELF', 'MENTOR', 'PLATFORM'], default: 'SELF' },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mentorFeedback: { type: String, trim: true, maxlength: 1000 },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  sourceExamAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamAttempt', index: true },
}, { timestamps: true });

achievementSchema.index({ userId: 1, submittedAt: -1 });
achievementSchema.index({ status: 1, submittedAt: -1 });
achievementSchema.index({ userId: 1, status: 1, submittedAt: -1 });
achievementSchema.index(
  { userId: 1, evidenceFingerprint: 1 },
  { unique: true, partialFilterExpression: { evidenceFingerprint: { $type: 'string' } } },
);

module.exports = mongoose.models.Achievement || mongoose.model('Achievement', achievementSchema);
