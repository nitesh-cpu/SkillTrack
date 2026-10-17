const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  authVersion: { type: Number, default: 0, select: false },
  role: { type: String, enum: ['STUDENT', 'MENTOR', 'ADMIN'], default: 'STUDENT', required: true },
  batch: { type: String, trim: true, default: '', maxlength: 100 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1, createdAt: -1 });

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.set('toJSON', {
  transform(document, result) {
    delete result.passwordHash;
    delete result.authVersion;
    delete result.__v;
    return result;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
