const mongoose = require("mongoose");

// There is one admin account; the role index enforces this even if setup commands race.
// Admin identities use normalized unique emails and hashed passwords for login.
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordResetTokenHash: { type: String },
  passwordResetExpires: { type: Date },
  role: { type: String, enum: ["admin"], default: "admin" }
}, { timestamps: true });

userSchema.index({ role: 1 }, {
  unique: true,
  partialFilterExpression: { role: "admin" }
});

module.exports = mongoose.model("User", userSchema);
