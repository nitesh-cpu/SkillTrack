const mongoose = require('mongoose');

const mentorStudentSchema = new mongoose.Schema({
  mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
}, { timestamps: false });

mentorStudentSchema.index({ studentId: 1 }, { unique: true });
mentorStudentSchema.index({ mentorId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.models.MentorStudent || mongoose.model('MentorStudent', mentorStudentSchema);
