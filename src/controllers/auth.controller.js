const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const Gallery = require("../models/gallery.model");
const ClientAccess = require("../models/clientAccess.model");
const email = require("../helperfunction/email");
const { createPasswordResetToken } = require("../helperfunction/passwordResetToken");

const resetRequestMessage = "Password reset link has been sent.";
// Keep validation consistent with the browser; bcrypt only uses the first 72 password bytes.
const isValidEmail = value =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isValidPassword = password =>
  typeof password === "string" &&
  password.length >= 8 &&
  Buffer.byteLength(password, "utf8") <= 72;

function getAdminUsername(admin) {
  const emailPrefix = admin.email.split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
  if (admin.username && admin.username !== emailPrefix) return admin.username;

  // Older accounts may not have a username, so derive one from the saved name.
  const username = admin.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
  return username.length >= 3
    ? username
    : `admin${String(admin._id).replace(/[^a-f0-9]/gi, "").slice(-8)}`;
}

async function adminLogin(req, res) {
  const { email, password } = req.body;
  // Check credentials against the normalized admin email and compare the stored hash.
  if (!isValidEmail(email) || typeof password !== "string" || !password) {
    return res.status(400).json({ message: "Enter a valid email address and password" });
  }

  const admin = await User.findOne({ email: email.trim().toLowerCase(), role: "admin" });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const username = getAdminUsername(admin);
  const accountUpdates = { $unset: { recoveryCodeHash: "" } };
  if (admin.username !== username) accountUpdates.$set = { username };
  await User.updateOne({ _id: admin._id }, accountUpdates);

  const token = jwt.sign(
    // The role and record ID let middleware reload and authorize this account per request.
    { id: admin._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

  res.json({
    message: "Admin login successful",
    token,
    admin: {
      id: admin._id,
      name: admin.name,
      username,
      email: admin.email
    }
  });
}

async function updateAdminDetails(req, res) {
  const { name, username, email, currentPassword, newPassword, confirmPassword } = req.body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
      typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim()) ||
      !isValidEmail(email) || typeof currentPassword !== "string" || !currentPassword) {
    return res.status(400).json({
      message: "Enter your name, a valid username, email address, and current password"
    });
  }
  if (newPassword !== undefined && newPassword !== "" && !isValidPassword(newPassword)) {
    return res.status(400).json({ message: "New password must be between 8 and 72 bytes" });
  }
  if (newPassword && newPassword !== confirmPassword) {
    return res.status(400).json({ message: "New passwords do not match" });
  }
  if (!newPassword && confirmPassword) {
    return res.status(400).json({ message: "Enter a new password to use password confirmation" });
  }
  if (!(await bcrypt.compare(currentPassword, req.admin.passwordHash))) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  const updates = {
    name: name.trim(),
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase()
  };
  if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 10);

  let admin;
  try {
    admin = await User.findOneAndUpdate(
      { _id: req.admin._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That email address or username is already in use" });
    }
    throw error;
  }
  if (!admin) return res.status(404).json({ message: "Admin account not found" });

  res.json({
    message: "Admin details updated successfully.",
    admin: {
      id: admin._id,
      name: admin.name,
      username: getAdminUsername(admin),
      email: admin.email
    }
  });
}

async function requestAdminPasswordReset(req, res) {
  const { email: submittedEmail } = req.body;
  if (!isValidEmail(submittedEmail)) {
    return res.status(400).json({ message: "Enter a valid email address" });
  }

  const admin = await User.findOne({
    email: submittedEmail.trim().toLowerCase(),
    role: "admin"
  });
  if (admin) {
    // Store only the token hash; the raw one-time token is sent to the admin by email.
    const { token: resetToken, tokenHash: resetTokenHash, expiresAt: resetExpires } =
      createPasswordResetToken();
    await User.updateOne(
      { _id: admin._id },
      { $set: { passwordResetTokenHash: resetTokenHash, passwordResetExpires: resetExpires } }
    );
    try {
      await email.sendPasswordResetEmail(admin, resetToken);
    } catch (error) {
      // Invalidate a token that was never delivered, while keeping the response generic.
      await User.updateOne(
        { _id: admin._id, passwordResetTokenHash: resetTokenHash },
        { $unset: { passwordResetTokenHash: "", passwordResetExpires: "" } }
      );
      console.error("Password reset email delivery failed:", error.message);
    }
  }

  res.json({ message: resetRequestMessage });
}

async function confirmAdminPasswordReset(req, res) {
  const { token, password, confirmPassword } = req.body;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token) ||
      !isValidPassword(password) || typeof confirmPassword !== "string") {
    return res.status(400).json({
      message: "Enter a valid reset link and passwords between 8 and 72 bytes"
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  // Matching and removing the unexpired token in one update makes it single-use.
  const admin = await User.findOneAndUpdate(
    { passwordResetTokenHash: tokenHash, passwordResetExpires: { $gt: new Date() } },
    {
      $set: { passwordHash },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetExpires: "",
        recoveryCodeHash: ""
      }
    },
    { new: true }
  );
  if (!admin) return res.status(400).json({ message: "This password reset link is invalid or expired." });

  res.json({ message: "Password reset successfully. You can now sign in." });
}

async function clientLogin(req, res) {
  const { token: folderToken, username, password } = req.body;
  // Validate types before trimming so malformed JSON values cannot cause runtime errors.
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
    // Bind the token to this client and gallery; protected handlers also verify gallery scope.
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

module.exports = {
  adminLogin,
  updateAdminDetails,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
  clientLogin
};
