const mongoose = require("mongoose");

// The admin reference controls ownership; folderToken is the unguessable private-link key.
const gallerySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true },
  clientName: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  selectionLimit: { type: Number, default: 300, min: 1 },
  folderToken: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Gallery", gallerySchema);
