const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  videoUrl: { type: String, required: true, maxlength: 2048 },
  durationSeconds: { type: Number, required: true, min: 1, max: 86400 },
  thumbnailUrl: { type: String, maxlength: 2048, default: '' },
  topic: { type: String, required: true, trim: true, maxlength: 120 },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
}, { timestamps: true });

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  lessons: { type: [lessonSchema], required: true, validate: value => value.length > 0 },
}, { timestamps: true });

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true, index: true },
  modules: { type: [moduleSchema], required: true, validate: value => value.length > 0 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

courseSchema.index({ status: 1, updatedAt: -1 });
courseSchema.index({ createdBy: 1, updatedAt: -1 });

module.exports = mongoose.models.LearningCourse || mongoose.model('LearningCourse', courseSchema);
