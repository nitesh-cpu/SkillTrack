const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

skillSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.Skill || mongoose.model('Skill', skillSchema);
