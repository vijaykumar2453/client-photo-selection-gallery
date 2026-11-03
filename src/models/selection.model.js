const mongoose = require("mongoose");

const selectionSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  clientAccessId: { type: mongoose.Schema.Types.ObjectId, ref: "ClientAccess", required: true, index: true },
  selectedPhotoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Photo" }],
  status: { type: String, enum: ["pending", "submitted"], default: "pending" },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

selectionSchema.index({ galleryId: 1, clientAccessId: 1 }, { unique: true });

module.exports = mongoose.model("Selection", selectionSchema);
