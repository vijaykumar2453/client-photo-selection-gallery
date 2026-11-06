const mongoose = require("mongoose");

// Store Cloudinary references rather than image bytes; folderId may be null for unassigned photos.
const photoSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
  fileName: { type: String, required: true },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String },
  cloudinaryPublicId: { type: String, required: true, unique: true },
  uploadKey: { type: String, unique: true, sparse: true, select: false }
}, { timestamps: true });

photoSchema.index({ galleryId: 1, _id: 1 });
photoSchema.index({ galleryId: 1, folderId: 1, _id: 1 });
photoSchema.set("toJSON", {
  transform: (document, value) => {
    delete value.uploadKey;
    return value;
  }
});

module.exports = mongoose.model("Photo", photoSchema);
