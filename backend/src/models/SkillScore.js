const mongoose = require('mongoose');

const skillScoreSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true, index: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  breakdown: { type: [mongoose.Schema.Types.Mixed], default: [] },
  ruleVersion: { type: Number, min: 1 },
  changeReason: { type: String, required: true, trim: true, maxlength: 100 },
  previousScore: { type: Number, min: 0, max: 100 },
  scoreChanged: { type: Boolean, required: true, default: true },
  evidenceCount: { type: Number, min: 0, default: 0 },
  calculatedAt: { type: Date, default: Date.now },
}, { timestamps: false });

skillScoreSchema.index({ userId: 1, skillId: 1, calculatedAt: -1 });

module.exports = mongoose.models.SkillScore || mongoose.model('SkillScore', skillScoreSchema);
