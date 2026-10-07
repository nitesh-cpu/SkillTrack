const mongoose = require('mongoose');

const skillPrerequisiteSchema = new mongoose.Schema({
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  prerequisiteSkillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
}, { timestamps: true });

skillPrerequisiteSchema.index({ skillId: 1, prerequisiteSkillId: 1 }, { unique: true });
skillPrerequisiteSchema.index({ prerequisiteSkillId: 1 });

module.exports = mongoose.models.SkillPrerequisite || mongoose.model('SkillPrerequisite', skillPrerequisiteSchema);
