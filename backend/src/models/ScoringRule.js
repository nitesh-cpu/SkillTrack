const mongoose = require('mongoose');

const scoringRuleSchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true },
  typeWeights: {
    type: Map,
    of: Number,
    default: { PROJECT: 0.3, ASSESSMENT: 0.25, CODING: 0.2, COURSE: 0.15, INTERVIEW: 0.1 },
  },
  reliabilityWeights: {
    type: Map,
    of: Number,
    default: { SELF: 0.4, MENTOR: 1, PLATFORM: 0.9 },
  },
  verificationWeights: {
    type: Map,
    of: Number,
    default: { PENDING: 0, VERIFIED: 1, REJECTED: 0 },
  },
  difficultyFloor: { type: Number, min: 0, max: 1, default: 0.5 },
  difficultyCeiling: { type: Number, min: 0, max: 1, default: 1 },
  recencyHalfLifeDays: { type: Number, min: 1, max: 3650, default: 365 },
  recencyFloor: { type: Number, min: 0, max: 1, default: 0.25 },
  masteryThreshold: { type: Number, min: 0, max: 100, default: 60 },
  practiceThreshold: { type: Number, min: 0, max: 100, default: 75 },
  isActive: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.models.ScoringRule || mongoose.model('ScoringRule', scoringRuleSchema);
