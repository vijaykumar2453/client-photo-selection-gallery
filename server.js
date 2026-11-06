require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/database");

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Wait for the database before accepting requests that depend on it.
    await connectDB();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Server could not start:", error.message);
    process.exit(1);
  }
}

startServer();
