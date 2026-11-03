const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const Gallery = require("../models/gallery.model");
const ClientAccess = require("../models/clientAccess.model");

async function adminLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const admin = await User.findOne({ email: email.trim().toLowerCase(), role: "admin" });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const token = jwt.sign(
    { id: admin._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

  res.json({
    message: "Admin login successful",
    token,
    admin: { id: admin._id, name: admin.name, email: admin.email }
  });
}

async function clientLogin(req, res) {
  const { token: folderToken, username, password } = req.body;
  if (typeof folderToken !== "string" || typeof username !== "string" ||
      typeof password !== "string" || !folderToken || !username.trim() || !password) {
    return res.status(400).json({ message: "Private link token, username and password are required" });
  }

  const gallery = await Gallery.findOne({ folderToken, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Private gallery not found" });

  const client = await ClientAccess.findOne({
    galleryId: gallery._id,
    username: username.trim().toLowerCase(),
    isActive: true
  });
  if (!client || !(await bcrypt.compare(password, client.passwordHash))) {
    return res.status(401).json({ message: "Invalid login details" });
  }

  const token = jwt.sign(
    { id: client._id, role: "client", galleryId: gallery._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

  res.json({
    message: "Client login successful",
    token,
    gallery: { id: gallery._id, title: gallery.title, clientName: gallery.clientName }
  });
}

module.exports = { adminLogin, clientLogin };
