const mongoose = require("mongoose");

// A client account belongs to one gallery; only the password hash is stored.
const clientAccessSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("ClientAccess", clientAccessSchema);
