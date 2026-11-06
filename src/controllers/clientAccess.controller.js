const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const ClientAccess = require("../models/clientAccess.model");
const Gallery = require("../models/gallery.model");

// Client accounts are scoped to a single gallery and managed by its admin.
async function createClientAccess(req, res) {
  const { galleryId, username, password } = req.body;
  // Validate IDs and credentials before querying or hashing user-provided data.
  if (!galleryId || !username || !password) {
    return res.status(400).json({ message: "Gallery ID, username and password are required" });
  }
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ message: "Username must contain at least 3 characters" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }

  // The authenticated admin may create accounts only in their own gallery.
  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const existing = await ClientAccess.findOne({ username: username.trim().toLowerCase() });
  if (existing) return res.status(409).json({ message: "Username is already taken" });

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await ClientAccess.create({
    galleryId,
    username: username.trim().toLowerCase(),
    passwordHash
  });

  res.status(201).json({
    message: "Client access created",
    client: { id: client._id, username: client.username, galleryId: client.galleryId }
  });
}


async function getGalleryClients(req, res) {
  if (!mongoose.isValidObjectId(req.params.galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }

  // Confirm ownership before listing account details for a gallery.
  const gallery = await Gallery.findOne({
    _id: req.params.galleryId,
    adminId: req.admin._id
  });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const clients = await ClientAccess.find({ galleryId: gallery._id })
    .select("_id username isActive createdAt")
    .sort({ createdAt: -1 });

  res.json(clients);
}

async function getMyGallery(req, res) {
  // The client ID comes from authentication middleware, not from caller-controlled input.
  const gallery = await Gallery.findOne({ _id: req.clientAccess.galleryId, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });
  res.json(gallery);
}

async function updateClientStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid client ID" });
  }
  if (typeof req.body.isActive !== "boolean") {
    return res.status(400).json({ message: "isActive must be true or false" });
  }

  const client = await ClientAccess.findById(req.params.id);
  if (!client) return res.status(404).json({ message: "Client access not found" });

  // Hide accounts outside this admin's galleries with the same not-found response.
  const gallery = await Gallery.findOne({ _id: client.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Client access not found" });

  client.isActive = req.body.isActive;
  await client.save();
  res.json({ message: "Client access updated", isActive: client.isActive });
}

async function updateClientPassword(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid client ID" });
  }
  if (typeof req.body.password !== "string" || req.body.password.length < 8) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }

  const client = await ClientAccess.findById(req.params.id);
  if (!client) return res.status(404).json({ message: "Client access not found" });

  // Verify gallery ownership before allowing the password to be changed.
  const gallery = await Gallery.findOne({ _id: client.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Client access not found" });

  client.passwordHash = await bcrypt.hash(req.body.password, 10);
  await client.save();
  res.json({ message: "Client password updated", username: client.username });
}

module.exports = {
  createClientAccess,
  getGalleryClients,
  getMyGallery,
  updateClientStatus,
  updateClientPassword
};
