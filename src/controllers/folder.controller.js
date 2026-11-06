const mongoose = require("mongoose");
const Gallery = require("../models/gallery.model");
const Folder = require("../models/folder.model");
const Photo = require("../models/photo.model");

// Folder endpoints check gallery ownership before reading or changing folder records.
// Create a folder inside one of the signed-in admin's active galleries.
async function createFolder(req, res) {
  // Route parameters come from the URL; form fields come from the request body.
  const { galleryId } = req.params;
  const { name, description = "" } = req.body;

  // Reject malformed IDs and empty names before querying MongoDB.
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Folder name is required" });
  }

  // Match the gallery to its owner so an admin cannot add folders to someone else's gallery.
  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Active gallery not found" });

  // Save the folder and return it so the page can select the new folder.
  const folder = await Folder.create({ galleryId, name: name.trim(), description });
  res.status(201).json({ message: "Folder created", folder });
}

// Return the folders in a gallery, along with the number of photos in each.
async function getGalleryFolders(req, res) {
  const { galleryId } = req.params;
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }

  // A client token is limited to that client's own gallery.
  if (req.clientAccess && String(galleryId) !== String(req.clientAccess.galleryId)) {
    return res.status(404).json({ message: "Gallery not found" });
  }

  // Admin requests are also restricted to galleries owned by that admin.
  const gallery = await Gallery.findOne({
    _id: galleryId,
    isActive: true,
    ...(req.admin ? { adminId: req.admin._id } : {})
  });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  // lean() returns plain objects because these folders are only being displayed.
  const folders = await Folder.find({ galleryId }).sort({ name: 1 }).lean();

  // Count photos in MongoDB in one aggregation instead of querying once per folder.
  const counts = await Photo.aggregate([
    { $match: { galleryId: new mongoose.Types.ObjectId(galleryId) } },
    { $group: { _id: "$folderId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map(item => [String(item._id), item.count]));

  // Include a zero count for folders that do not contain any photos yet.
  res.json(folders.map(folder => ({
    ...folder,
    photoCount: countMap.get(String(folder._id)) || 0
  })));
}

// Update a folder's name or description after confirming its owner.
async function updateFolder(req, res) {
  if (!mongoose.isValidObjectId(req.params.folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }

  const folder = await Folder.findById(req.params.folderId);
  if (!folder) return res.status(404).json({ message: "Folder not found" });

  // Do not reveal whether a folder exists if it belongs to another admin.
  const gallery = await Gallery.findOne({ _id: folder.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Folder not found" });

  // Only change fields included in the request; validate names before saving.
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== "string" || !req.body.name.trim()) {
      return res.status(400).json({ message: "Folder name is required" });
    }
    folder.name = req.body.name.trim();
  }
  if (req.body.description !== undefined) folder.description = req.body.description;
  await folder.save();
  res.json({ message: "Folder updated", folder });
}

// Remove a folder but keep its photos in the gallery as unassigned photos.
async function deleteFolder(req, res) {
  if (!mongoose.isValidObjectId(req.params.folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }
  const folder = await Folder.findById(req.params.folderId);
  if (!folder) return res.status(404).json({ message: "Folder not found" });

  const gallery = await Gallery.findOne({ _id: folder.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Folder not found" });

  // Clear the folder reference first so deleting a folder does not delete its photos.
  await Photo.updateMany({ folderId: folder._id }, { $set: { folderId: null } });
  await Folder.deleteOne({ _id: folder._id });
  res.json({ message: "Folder deleted; photos were kept in the gallery." });
}

// Export controller functions for the folder routes to call.
module.exports = { createFolder, getGalleryFolders, updateFolder, deleteFolder };
