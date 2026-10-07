const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1500, default: '' },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  deadline: { type: Date },
  status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
  feedbackHistory: [{
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    feedback: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

taskSchema.index({ studentId: 1, status: 1 });
taskSchema.index({ studentId: 1, createdAt: -1 });
taskSchema.index({ mentorId: 1, createdAt: -1 });
taskSchema.index({ mentorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);
