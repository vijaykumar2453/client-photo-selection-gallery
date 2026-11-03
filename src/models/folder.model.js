const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true }
}, { timestamps: true });

folderSchema.index({ galleryId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Folder", folderSchema);
