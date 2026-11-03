const multer = require("multer");
const mongoose = require("mongoose");
const { cloudinary, checkCloudinaryConfig } = require("../config/cloudinary");
const Gallery = require("../models/gallery.model");
const Folder = require("../models/folder.model");
const Photo = require("../models/photo.model");
const Selection = require("../models/selection.model");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/tiff"];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, WEBP, GIF, HEIC and TIFF images are allowed"));
    }
    callback(null, true);
  }
});

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "client-photo-gallery", resource_type: "image" },
      (error, result) => error ? reject(error) : resolve(result)
    );
    stream.end(file.buffer);
  });
}

async function uploadPhotos(req, res) {
  const { galleryId, folderId } = req.params;
  if (!mongoose.isValidObjectId(galleryId) || !mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({ message: "Invalid gallery or folder ID" });
  }

  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Active gallery not found" });

  const folder = await Folder.findOne({ _id: folderId, galleryId });
  if (!folder) return res.status(404).json({ message: "Folder not found in this gallery" });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "Choose at least one image" });
  }

  checkCloudinaryConfig();
  const uploadedPhotos = [];
  const uploadedPublicIds = [];

  try {
    for (const file of req.files) {
      const result = await uploadToCloudinary(file);
      uploadedPublicIds.push(result.public_id);
      const photo = await Photo.create({
        galleryId: gallery._id,
        folderId: folder._id,
        fileName: file.originalname,
        imageUrl: result.secure_url,
        thumbnailUrl: cloudinary.url(result.public_id, {
          secure: true,
          transformation: [{ width: 600, height: 600, crop: "limit" }, { quality: "auto", fetch_format: "auto" }]
        }),
        cloudinaryPublicId: result.public_id
      });
      uploadedPhotos.push(photo);
    }
  } catch (error) {
    await Photo.deleteMany({ _id: { $in: uploadedPhotos.map(photo => photo._id) } });
    for (const publicId of uploadedPublicIds) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (cleanupError) {
        console.error("Cloudinary cleanup failed:", cleanupError.message);
      }
    }
    throw error;
  }

  res.status(201).json({ message: "Photos uploaded to folder", count: uploadedPhotos.length, photos: uploadedPhotos });
}

async function getGalleryPhotos(req, res) {
  const { galleryId } = req.params;
  const { folderId } = req.query;
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  if (folderId && !mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }

  if (req.client && String(galleryId) !== String(req.client.galleryId)) {
    return res.status(404).json({ message: "Gallery not found" });
  }

  const gallery = await Gallery.findOne({
    _id: galleryId,
    isActive: true,
    ...(req.admin ? { adminId: req.admin._id } : {})
  });
  if (!gallery) return res.status(404).json({ message: "Gallery not found" });

  const filter = { galleryId: gallery._id };
  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, galleryId: gallery._id });
    if (!folder) return res.status(404).json({ message: "Folder not found" });
    filter.folderId = folder._id;
  }

  const photos = await Photo.find(filter).sort({ createdAt: 1 });
  res.json(photos);
}

async function deletePhoto(req, res) {
  if (!mongoose.isValidObjectId(req.params.photoId)) {
    return res.status(400).json({ message: "Invalid photo ID" });
  }
  const photo = await Photo.findById(req.params.photoId);
  if (!photo) return res.status(404).json({ message: "Photo not found" });

  const gallery = await Gallery.findOne({ _id: photo.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Photo not found" });

  const result = await cloudinary.uploader.destroy(photo.cloudinaryPublicId, { resource_type: "image" });
  if (result.result !== "ok" && result.result !== "not found") {
    return res.status(502).json({ message: "Cloudinary could not delete the image. Database record was kept." });
  }

  await Photo.deleteOne({ _id: photo._id });
  await Selection.updateMany({ galleryId: gallery._id }, { $pull: { selectedPhotoIds: photo._id } });
  res.json({ message: "Photo deleted" });
}

module.exports = { upload, uploadPhotos, getGalleryPhotos, deletePhoto };
