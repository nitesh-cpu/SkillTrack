const mongoose = require('mongoose');

const achievementSkillSchema = new mongoose.Schema({
  achievementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement', required: true },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  relevance: { type: Number, required: true, min: 0, max: 1 },
}, { timestamps: true });

achievementSkillSchema.index({ achievementId: 1, skillId: 1 }, { unique: true });
achievementSkillSchema.index({ skillId: 1 });

module.exports = mongoose.models.AchievementSkill || mongoose.model('AchievementSkill', achievementSkillSchema);
