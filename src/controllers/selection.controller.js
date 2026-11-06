// Save client favourites, submit selections, and prepare downloads.

const mongoose = require("mongoose");
const archiver = require("archiver");
const axios = require("axios");
const Gallery = require("../models/gallery.model");
const ClientAccess = require("../models/clientAccess.model");
const Photo = require("../models/photo.model");
const Folder = require("../models/folder.model");
const Selection = require("../models/selection.model");

// Save the signed-in client selected photo IDs.
async function saveSelection(req, res) {
  const { photoIds } = req.body;
  // Require an array, deduplicate it, then reject malformed IDs before database lookup.
  if (!Array.isArray(photoIds)) {
    return res.status(400).json({ message: "photoIds must be an array" });
  }

  const existingSelection = await Selection.findOne({
    galleryId: req.clientAccess.galleryId,
    clientAccessId: req.clientAccess._id
  });
  if (existingSelection?.status === "submitted") {
    return res.status(409).json({ message: "Submitted selections cannot be changed" });
  }

  const uniqueIds = [...new Set(photoIds.map(String))];
  if (uniqueIds.some(id => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "One or more photo IDs are invalid" });
  }

  const gallery = await Gallery.findOne({ _id: req.clientAccess.galleryId, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });
  if (uniqueIds.length > (gallery.selectionLimit || 300)) {
    return res.status(400).json({ message: `You can select a maximum of ${gallery.selectionLimit || 300} photos` });
  }

  // Verify every chosen photo belongs to the authenticated client's gallery.
  const photos = await Photo.find({
    _id: { $in: uniqueIds },
    galleryId: req.clientAccess.galleryId
  }).select("_id");

  if (photos.length !== uniqueIds.length) {
    return res.status(400).json({ message: "One or more photos do not belong to your gallery" });
  }

  // Upsert creates the client's first draft; the unique gallery/client index prevents duplicates.
  const selection = await Selection.findOneAndUpdate(
    { galleryId: req.clientAccess.galleryId, clientAccessId: req.clientAccess._id },
    { selectedPhotoIds: photos.map(photo => photo._id), status: "pending", submittedAt: null },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.json({ message: "Selections saved", count: selection.selectedPhotoIds.length, status: selection.status });
}

// Lock the client selections after final submission.
async function submitSelection(req, res) {
  const selection = await Selection.findOne({
    galleryId: req.clientAccess.galleryId,
    clientAccessId: req.clientAccess._id
  });
  if (!selection || selection.selectedPhotoIds.length === 0) {
    return res.status(400).json({ message: "Select and save at least one photo before submitting" });
  }
  if (selection.status === "submitted") {
    return res.status(409).json({ message: "Selections have already been submitted" });
  }

  // Submission is a one-way lock; the save endpoint rejects later edits.
  selection.status = "submitted";
  selection.submittedAt = new Date();
  await selection.save();

  res.json({
    message: "Selections submitted successfully",
    count: selection.selectedPhotoIds.length,
    submittedAt: selection.submittedAt
  });
}

// Retrieve the current client selection status.
async function getMySelection(req, res) {
  const selection = await Selection.findOne({
    galleryId: req.clientAccess.galleryId,
    clientAccessId: req.clientAccess._id
  }).populate({
    path: "selectedPhotoIds",
    populate: { path: "folderId", select: "name" }
  });

  res.json(selection || { selectedPhotoIds: [], status: "pending" });
}

// Retrieve one client selections for administrator review.
async function getGallerySelection(req, res) {
  const { galleryId, clientAccessId } = req.params;
  if (!mongoose.isValidObjectId(galleryId) || !mongoose.isValidObjectId(clientAccessId)) {
    return res.status(400).json({ message: "Invalid gallery or client ID" });
  }

  // Check gallery ownership and client membership together before exposing selection data.
  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const client = await ClientAccess.findOne({ _id: clientAccessId, galleryId: gallery._id });
  if (!client) return res.status(404).json({ message: "Client does not belong to this gallery" });

  const selection = await Selection.findOne({
    galleryId: gallery._id,
    clientAccessId: client._id
  }).populate({
    path: "selectedPhotoIds",
    populate: { path: "folderId", select: "name" }
  });

  const selectedPhotos = selection ? selection.selectedPhotoIds : [];
  const groupedPhotos = {};

  for (const photo of selectedPhotos) {
    const folderName = photo.folderId?.name || "Unsorted";
    if (!groupedPhotos[folderName]) groupedPhotos[folderName] = [];
    groupedPhotos[folderName].push(photo);
  }

  res.json({
    client: { id: client._id, username: client.username },
    selection: selection || { selectedPhotoIds: [], status: "pending" },
    groupedPhotos
  });
}

function safeZipPart(value) {
  // Remove path separators and reserved filename characters before using values in ZIP entries.
  const safePart = String(value || "Photos")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, "_");
  return safePart === "." || !safePart ? "Photos" : safePart;
}

function safeZipPath(value) {
  const parts = String(value || "Photos")
    .split(/[\\/]+/)
    .filter(Boolean);
  return (parts.length ? parts : ["Photos"]).map(safeZipPart).join("/");
}

// Stream the selected original photos as a ZIP archive.
async function downloadSelectionZip(req, res) {
  const { galleryId, clientAccessId } = req.params;
  const { folderId } = req.query;

  if (!mongoose.isValidObjectId(galleryId) || !mongoose.isValidObjectId(clientAccessId)) {
    return res.status(400).json({ message: "Invalid gallery or client ID" });
  }
  if (folderId && !mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }

  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const client = await ClientAccess.findOne({ _id: clientAccessId, galleryId: gallery._id });
  if (!client) return res.status(404).json({ message: "Client does not belong to this gallery" });

  let folder = null;
  if (folderId) {
    folder = await Folder.findOne({ _id: folderId, galleryId: gallery._id });
    if (!folder) return res.status(404).json({ message: "Folder not found in this gallery" });
  }

  // Only submitted selections are available for administrator download.
  const selection = await Selection.findOne({
    galleryId: gallery._id,
    clientAccessId: client._id,
    status: "submitted"
  }).populate({
    path: "selectedPhotoIds",
    populate: { path: "folderId", select: "name" }
  });

  if (!selection || selection.selectedPhotoIds.length === 0) {
    return res.status(404).json({ message: "This client has no submitted photos" });
  }

  let photos = selection.selectedPhotoIds;
  if (folder) {
    photos = photos.filter(photo =>
      String(photo.folderId?._id || photo.folderId) === String(folder._id)
    );
  }
  if (photos.length === 0) {
    return res.status(404).json({ message: "No selected photos in this folder" });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("warning", error => console.error("ZIP warning:", error.message));
  archive.on("error", error => {
    console.error("ZIP error:", error.message);
    if (!res.headersSent) res.status(500).json({ message: "Could not create ZIP file" });
    else res.destroy(error);
  });

  const zipName = `${safeZipPart(client.username)}_Selected_Photos.zip`;
  res.status(200);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
  // Stream ZIP output to the response rather than building a potentially large archive in memory.
  archive.pipe(res);

  try {
    // Stream each trusted remote image into the archive instead of buffering the ZIP in memory.
    const usedNames = new Set();

    for (const photo of photos) {
      const imageUrl = new URL(photo.imageUrl);
      // Fetch only direct HTTPS Cloudinary URLs; redirects are disabled on the request below.
      if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "res.cloudinary.com") {
        throw new Error("Photo URL is not a trusted Cloudinary URL");
      }

      const response = await axios.get(photo.imageUrl, {
        responseType: "stream",
        timeout: 30000,
        maxRedirects: 0
      });

      const folderName = safeZipPath(photo.folderId?.name || "Unsorted");
      const originalName = safeZipPart(photo.fileName || "photo.jpg");
      let entryName = `${folderName}/${originalName}`;
      let number = 2;

      // Keep filenames unique within the archive even when uploads reused a source filename.
      while (usedNames.has(entryName.toLowerCase())) {
        const dot = originalName.lastIndexOf(".");
        const renamed = dot > 0
          ? `${originalName.slice(0, dot)}_${number}${originalName.slice(dot)}`
          : `${originalName}_${number}`;
        entryName = `${folderName}/${renamed}`;
        number += 1;
      }

      usedNames.add(entryName.toLowerCase());
      archive.append(response.data, { name: entryName });
    }

    await archive.finalize();
  } catch (error) {
    archive.abort();
    console.error("ZIP download failed:", error.message);
    if (!res.headersSent) res.status(502).json({ message: "Could not retrieve one or more original photos" });
    else res.destroy(error);
  }
}

module.exports = {
  saveSelection,
  submitSelection,
  getMySelection,
  getGallerySelection,
  downloadSelectionZip
};
