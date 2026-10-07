const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  watchedSeconds: { type: Number, min: 0, required: true, default: 0 },
  lastPosition: { type: Number, min: 0, required: true, default: 0 },
  completed: { type: Boolean, default: false },
}, { timestamps: true });

videoProgressSchema.index({ studentId: 1, lessonId: 1 }, { unique: true });

module.exports = mongoose.models.VideoProgress || mongoose.model('VideoProgress', videoProgressSchema);
