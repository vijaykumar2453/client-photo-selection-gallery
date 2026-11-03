const mongoose = require("mongoose");
const Gallery = require("../models/gallery.model");
const Folder = require("../models/folder.model");
const Photo = require("../models/photo.model");

async function createFolder(req, res) {
  const { galleryId } = req.params;
  const { name, description = "" } = req.body;

  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Folder name is required" });
  }

  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Active gallery not found" });

  const folder = await Folder.create({ galleryId, name: name.trim(), description });
  res.status(201).json({ message: "Folder created", folder });
}

async function getGalleryFolders(req, res) {
  const { galleryId } = req.params;
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  if (req.client && String(galleryId) !== String(req.client.galleryId)) {
    return res.status(404).json({ message: "Gallery not found" });
  }

  const gallery = await Gallery.findOne({
    _id: galleryId,
    isActive: true,
    ...(req.admin ? { adminId: req.admin._id } : {})
  });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const folders = await Folder.find({ galleryId }).sort({ name: 1 }).lean();
  const counts = await Photo.aggregate([
    { $match: { galleryId: new mongoose.Types.ObjectId(galleryId) } },
    { $group: { _id: "$folderId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map(item => [String(item._id), item.count]));

  res.json(folders.map(folder => ({
    ...folder,
    photoCount: countMap.get(String(folder._id)) || 0
  })));
}

async function updateFolder(req, res) {
  if (!mongoose.isValidObjectId(req.params.folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }
  const folder = await Folder.findById(req.params.folderId);
  if (!folder) return res.status(404).json({ message: "Folder not found" });

  const gallery = await Gallery.findOne({ _id: folder.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Folder not found" });

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

async function deleteFolder(req, res) {
  if (!mongoose.isValidObjectId(req.params.folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }
  const folder = await Folder.findById(req.params.folderId);
  if (!folder) return res.status(404).json({ message: "Folder not found" });

  const gallery = await Gallery.findOne({ _id: folder.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Folder not found" });

  await Photo.updateMany({ folderId: folder._id }, { $set: { folderId: null } });
  await Folder.deleteOne({ _id: folder._id });
  res.json({ message: "Folder deleted; photos were kept in the gallery." });
}

module.exports = { createFolder, getGalleryFolders, updateFolder, deleteFolder };
