const mongoose = require('mongoose');

const courseAssignmentSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningCourse', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

courseAssignmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true });
courseAssignmentSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.models.CourseAssignment || mongoose.model('CourseAssignment', courseAssignmentSchema);
