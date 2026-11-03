const mongoose = require("mongoose");
const archiver = require("archiver");
const axios = require("axios");
const Gallery = require("../models/gallery.model");
const ClientAccess = require("../models/clientAccess.model");
const Photo = require("../models/photo.model");
const Folder = require("../models/folder.model");
const Selection = require("../models/selection.model");

async function saveSelection(req, res) {
  const { photoIds } = req.body;
  if (!Array.isArray(photoIds)) {
    return res.status(400).json({ message: "photoIds must be an array" });
  }

  const uniqueIds = [...new Set(photoIds.map(String))];
  if (uniqueIds.some(id => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "One or more photo IDs are invalid" });
  }

  const gallery = await Gallery.findOne({ _id: req.client.galleryId, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });
  if (uniqueIds.length > (gallery.selectionLimit || 300)) {
    return res.status(400).json({ message: `You can select a maximum of ${gallery.selectionLimit || 300} photos` });
  }

  const photos = await Photo.find({
    _id: { $in: uniqueIds },
    galleryId: req.client.galleryId
  }).select("_id");

  if (photos.length !== uniqueIds.length) {
    return res.status(400).json({ message: "One or more photos do not belong to your gallery" });
  }

  const selection = await Selection.findOneAndUpdate(
    { galleryId: req.client.galleryId, clientAccessId: req.client._id },
    { selectedPhotoIds: photos.map(photo => photo._id), status: "pending", submittedAt: null },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.json({ message: "Selections saved", count: selection.selectedPhotoIds.length, status: selection.status });
}

async function submitSelection(req, res) {
  const selection = await Selection.findOne({
    galleryId: req.client.galleryId,
    clientAccessId: req.client._id
  });
  if (!selection || selection.selectedPhotoIds.length === 0) {
    return res.status(400).json({ message: "Select and save at least one photo before submitting" });
  }

  selection.status = "submitted";
  selection.submittedAt = new Date();
  await selection.save();

  res.json({
    message: "Selections submitted successfully",
    count: selection.selectedPhotoIds.length,
    submittedAt: selection.submittedAt
  });
}

async function getMySelection(req, res) {
  const selection = await Selection.findOne({
    galleryId: req.client.galleryId,
    clientAccessId: req.client._id
  }).populate({
    path: "selectedPhotoIds",
    populate: { path: "folderId", select: "name" }
  });

  res.json(selection || { selectedPhotoIds: [], status: "pending" });
}

async function getGallerySelection(req, res) {
  const { galleryId, clientAccessId } = req.params;
  if (!mongoose.isValidObjectId(galleryId) || !mongoose.isValidObjectId(clientAccessId)) {
    return res.status(400).json({ message: "Invalid gallery or client ID" });
  }

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
  return String(value || "Photos").replace(/[\\/:*?"<>|]/g, "_").replace(/\.{2,}/g, "_");
}

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
  archive.pipe(res);

  try {
    const usedNames = new Set();

    for (const photo of photos) {
      const imageUrl = new URL(photo.imageUrl);
      if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "res.cloudinary.com") {
        throw new Error("Photo URL is not a trusted Cloudinary URL");
      }

      const response = await axios.get(photo.imageUrl, {
        responseType: "stream",
        timeout: 30000,
        maxRedirects: 0
      });

      const folderName = safeZipPart(photo.folderId?.name || "Unsorted");
      const originalName = safeZipPart(photo.fileName || "photo.jpg");
      let entryName = `${folderName}/${originalName}`;
      let number = 2;

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
