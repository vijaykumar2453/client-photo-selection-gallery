require("dotenv").config();

const readline = require("readline/promises");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/user.model");

// Read the first admin password without echoing it to the terminal or passing it on the command line.
function readHiddenPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal to enter the password securely");
  }

  return new Promise((resolve, reject) => {
    process.stdout.write("Password (8-72 bytes): ");
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let password = "";
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = chunk => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Admin setup cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else if (character >= " ") {
          password += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function createAdmin() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run `npm run create-admin` in an interactive terminal");
  }

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const name = (await prompt.question("Admin name: ")).trim();
    const username = (await prompt.question("Username (3-32 letters, numbers, dots, underscores or hyphens): "))
      .trim()
      .toLowerCase();
    const email = (await prompt.question("Admin email: ")).trim().toLowerCase();
    prompt.close();

    if (!name || name.length > 100) throw new Error("Name must contain 1-100 characters");
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Username format is invalid");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }

    const password = await readHiddenPassword();
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("Password must be between 8 and 72 bytes");
    }

    await connectDB();
    // The database's unique admin-role index is the final guard against multiple accounts.
    if (await User.exists({ role: "admin" })) {
      throw new Error("An admin account already exists; this app supports one admin");
    }

    await User.create({
      name,
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin"
    });
    console.log("Admin account created. You can now sign in.");
  } finally {
    prompt.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

createAdmin().catch(error => {
  console.error("Could not create admin account:", error.message);
  process.exitCode = 1;
});
