const mongoose = require('mongoose');

const examAssignmentSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'], default: 'ASSIGNED', index: true },
}, { timestamps: true });

examAssignmentSchema.index({ examId: 1, studentId: 1 }, { unique: true });
examAssignmentSchema.index({ studentId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.ExamAssignment || mongoose.model('ExamAssignment', examAssignmentSchema);
