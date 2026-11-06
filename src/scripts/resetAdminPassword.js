require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/user.model");
const {
  createPasswordResetToken,
  getPasswordResetUrl
} = require("../helperfunction/passwordResetToken");

// Create a short-lived reset link for installations that cannot send email.
async function resetAdminPassword() {
  const email = process.argv[2];
  if (typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.trim().length > 254) {
    throw new Error("Usage: npm run reset-admin-password -- <admin-email>");
  }

  await connectDB();
  try {
    const admin = await User.findOne({
      email: email.trim().toLowerCase(),
      role: "admin"
    });
    if (!admin) throw new Error("No admin account exists for that email");

    const { token, tokenHash, expiresAt } = createPasswordResetToken();
    await User.updateOne(
      { _id: admin._id },
      { $set: { passwordResetTokenHash: tokenHash, passwordResetExpires: expiresAt } }
    );

    console.log("One-time password reset link (expires in 1 hour):");
    console.log(getPasswordResetUrl(token));
  } finally {
    await mongoose.disconnect();
  }
}

resetAdminPassword().catch(error => {
  console.error("Could not create password reset link:", error.message);
  process.exitCode = 1;
});
