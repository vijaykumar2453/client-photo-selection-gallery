require("dotenv").config();

const bcrypt = require("bcryptjs");
const connectDB = require("../config/database");
const User = require("../models/user.model");

async function createAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in your .env file");
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error("Admin password must contain at least 8 characters");
  }

  await connectDB();
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    console.log("Admin account already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    passwordHash,
    role: "admin"
  });

  console.log("Admin account created successfully");
}

createAdmin()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Admin setup failed:", error.message);
    process.exit(1);
  });
