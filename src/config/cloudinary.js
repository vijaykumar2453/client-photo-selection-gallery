const cloudinary = require("cloudinary").v2;

// Image bytes live in Cloudinary; MongoDB stores their URLs and public IDs.
// Cloudinary reads credentials from the environment, keeping secrets out of source control.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function checkCloudinaryConfig() {
  // Fail at the point of use with a clear message if image storage is not configured.
  if (!process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary settings are missing from your .env file");
  }
}

module.exports = { cloudinary, checkCloudinaryConfig };
