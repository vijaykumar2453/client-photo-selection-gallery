const mongoose = require("mongoose");

const photoSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
  fileName: { type: String, required: true },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String },
  cloudinaryPublicId: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model("Photo", photoSchema);
