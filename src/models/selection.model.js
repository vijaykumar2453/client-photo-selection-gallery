const mongoose = require("mongoose");

// A draft can be edited; a submitted selection is treated as final by the API.
// Keep one selection per client per gallery and record when a submitted choice becomes locked.
const selectionSchema = new mongoose.Schema({
  galleryId: { type: mongoose.Schema.Types.ObjectId, ref: "Gallery", required: true, index: true },
  clientAccessId: { type: mongoose.Schema.Types.ObjectId, ref: "ClientAccess", required: true, index: true },
  selectedPhotoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Photo" }],
  status: { type: String, enum: ["pending", "submitted"], default: "pending" },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

selectionSchema.index({ galleryId: 1, clientAccessId: 1 }, { unique: true });

module.exports = mongoose.model("Selection", selectionSchema);
