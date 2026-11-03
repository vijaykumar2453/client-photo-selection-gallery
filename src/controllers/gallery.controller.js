const crypto = require("crypto");
const mongoose = require("mongoose");
const Gallery = require("../models/gallery.model");
const ClientAccess = require("../models/clientAccess.model");

async function createGallery(req, res) {
  const { title, clientName, description, selectionLimit } = req.body;
  if (typeof title !== "string" || !title.trim() ||
      typeof clientName !== "string" || !clientName.trim()) {
    return res.status(400).json({ message: "Title and client name are required" });
  }
  if (description !== undefined && typeof description !== "string") {
    return res.status(400).json({ message: "Description must be text" });
  }
  if (selectionLimit !== undefined && (!Number.isInteger(selectionLimit) || selectionLimit < 1)) {
    return res.status(400).json({ message: "selectionLimit must be a positive whole number" });
  }

  const gallery = await Gallery.create({
    adminId: req.admin._id,
    title: title.trim(),
    clientName: clientName.trim(),
    description: description || "",
    selectionLimit: selectionLimit || 300,
    folderToken: crypto.randomBytes(24).toString("hex")
  });

  res.status(201).json({
    message: "Gallery created",
    gallery,
    privateLink: `${req.protocol}://${req.get("host")}/client/login/${gallery.folderToken}`
  });
}

async function getGalleries(req, res) {
  const galleries = await Gallery.find({ adminId: req.admin._id }).sort({ createdAt: -1 });
  res.json(galleries);
}

async function getGallery(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  const gallery = await Gallery.findOne({ _id: req.params.id, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });
  res.json(gallery);
}

async function updateGallery(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }

  const updates = {};
  if (req.body.title !== undefined) {
    if (typeof req.body.title !== "string" || !req.body.title.trim()) {
      return res.status(400).json({ message: "Title must be non-empty text" });
    }
    updates.title = req.body.title.trim();
  }
  if (req.body.clientName !== undefined) {
    if (typeof req.body.clientName !== "string" || !req.body.clientName.trim()) {
      return res.status(400).json({ message: "Client name must be non-empty text" });
    }
    updates.clientName = req.body.clientName.trim();
  }
  if (req.body.description !== undefined) {
    if (typeof req.body.description !== "string") {
      return res.status(400).json({ message: "Description must be text" });
    }
    updates.description = req.body.description;
  }
  if (req.body.selectionLimit !== undefined) {
    if (!Number.isInteger(req.body.selectionLimit) || req.body.selectionLimit < 1) {
      return res.status(400).json({ message: "selectionLimit must be a positive whole number" });
    }
    updates.selectionLimit = req.body.selectionLimit;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "Provide at least one field to update" });
  }

  const gallery = await Gallery.findOneAndUpdate(
    { _id: req.params.id, adminId: req.admin._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });
  res.json({ message: "Gallery updated", gallery });
}

async function deleteGallery(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }

  const gallery = await Gallery.findOne({ _id: req.params.id, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  // Archive the gallery instead of deleting originals or selection history.
  gallery.isActive = false;
  await gallery.save();
  await ClientAccess.updateMany({ galleryId: gallery._id }, { isActive: false });

  res.json({ message: "Gallery archived. Photos and selections were retained." });
}

module.exports = { createGallery, getGalleries, getGallery, updateGallery, deleteGallery };
