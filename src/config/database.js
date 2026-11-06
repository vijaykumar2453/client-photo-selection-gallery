const mongoose = require("mongoose");

// Called before the HTTP server starts and by one-off admin/database scripts.
async function connectDB() {
  // Refuse to start without an explicit database target rather than connecting implicitly.
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from your .env file");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
}

module.exports = connectDB;
