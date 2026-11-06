const multer = require("multer");
const mongoose = require("mongoose");
const { cloudinary, checkCloudinaryConfig } = require("../config/cloudinary");
const Gallery = require("../models/gallery.model");
const Folder = require("../models/folder.model");
const Photo = require("../models/photo.model");
const Selection = require("../models/selection.model");
const {
  getRelativeFolderPath,
  hasValidImageSignature,
  getUploadKeys,
  parsePhotoPagination
} = require("../helperfunction/photoUpload.validation");

// Buffer uploads in memory, but cap file size/count and accept only known image MIME types.
const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/tiff"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE, files: MAX_UPLOAD_FILES, fields: MAX_UPLOAD_FILES * 2 + 1 },
  fileFilter: (req, file, callback) => {
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, WEBP, GIF, HEIC and TIFF images are allowed"));
    }
    callback(null, true);
  }
});

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    // Stream the buffered file directly to remote storage instead of writing it to disk.
    const stream = cloudinary.uploader.upload_stream(
      { folder: "client-photo-gallery", resource_type: "image" },
      (error, result) => error ? reject(error) : resolve(result)
    );
    stream.end(file.buffer);
  });
}

async function findOrCreateFolder(galleryId, name) {
  let folder = await Folder.findOne({ galleryId, name });
  if (folder) return folder;

  try {
    return await Folder.create({ galleryId, name });
  } catch (error) {
    // Another upload may have created the same path after the initial lookup.
    if (error.code !== 11000) throw error;
    folder = await Folder.findOne({ galleryId, name });
    if (!folder) throw error;
    return folder;
  }
}

async function uploadPhotos(req, res) {
  const { galleryId, folderId } = req.params;
  if (!mongoose.isValidObjectId(galleryId) || (folderId && !mongoose.isValidObjectId(folderId))) {
    return res.status(400).json({ message: "Invalid gallery or folder ID" });
  }

  // Both the gallery and optional destination folder must belong to this request's gallery.
  const gallery = await Gallery.findOne({ _id: galleryId, adminId: req.admin._id, isActive: true });
  if (!gallery) return res.status(404).json({ message: "Active gallery not found" });

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "Choose at least one image" });
  }

  let defaultFolder = null;
  if (folderId) {
    defaultFolder = await Folder.findOne({ _id: folderId, galleryId });
    if (!defaultFolder) return res.status(404).json({ message: "Folder not found in this gallery" });
  }

  const relativePaths = req.body.relativePaths === undefined
    ? []
    : Array.isArray(req.body.relativePaths) ? req.body.relativePaths : [req.body.relativePaths];
  if (!defaultFolder && relativePaths.length !== req.files.length) {
    return res.status(400).json({ message: "Folder uploads must include a relative path for every photo" });
  }

  const folderNames = req.files.map((file, index) =>
    defaultFolder ? null : getRelativeFolderPath(relativePaths[index], file.originalname)
  );
  if (req.files.some(file => !hasValidImageSignature(file))) {
    return res.status(400).json({ message: "One or more files do not contain valid image data" });
  }
  const uploadKeys = getUploadKeys(req.body, req.files, gallery._id);

  checkCloudinaryConfig();
  const uploadedPhotos = [];
  const responsePhotos = [];
  const uploadedPublicIds = [];
  const foldersByName = new Map();
  let skippedCount = 0;

  try {
    // Upload sequentially so each completed cloud/database operation can be tracked for cleanup.
    // Track successful uploads so a later failure can remove partial database and cloud records.
    for (let index = 0; index < req.files.length; index += 1) {
      const file = req.files[index];
      const uploadKey = uploadKeys?.[index];
      const existingPhoto = uploadKey ? await Photo.findOne({ uploadKey }) : null;
      if (existingPhoto) {
        skippedCount += 1;
        responsePhotos.push(existingPhoto);
        continue;
      }

      let folder = defaultFolder;
      if (!folder) {
        const folderName = folderNames[index];
        folder = foldersByName.get(folderName);
        if (!folder) {
          folder = await findOrCreateFolder(gallery._id, folderName);
          foldersByName.set(folderName, folder);
        }
      }

      const result = await uploadToCloudinary(file);
      uploadedPublicIds.push(result.public_id);
      let photo;
      try {
        photo = await Photo.create({
          galleryId: gallery._id,
          folderId: folder._id,
          fileName: file.originalname,
          imageUrl: result.secure_url,
          thumbnailUrl: cloudinary.url(result.public_id, {
            secure: true,
            transformation: [{ width: 600, height: 600, crop: "limit" }, { quality: "auto", fetch_format: "auto" }]
          }),
          cloudinaryPublicId: result.public_id,
          ...(uploadKey ? { uploadKey } : {})
        });
      } catch (error) {
        if (error.code !== 11000 || !uploadKey) throw error;

        const existing = await Photo.findOne({ uploadKey });
        if (!existing) throw error;
        try {
          const cleanupResult = await cloudinary.uploader.destroy(
            result.public_id,
            { resource_type: "image" }
          );
          if (cleanupResult.result !== "ok" && cleanupResult.result !== "not found") {
            console.error("Duplicate upload cleanup failed:", cleanupResult.result);
          }
        } catch (cleanupError) {
          console.error("Duplicate upload cleanup failed:", cleanupError.message);
        }
        uploadedPublicIds.pop();
        skippedCount += 1;
        responsePhotos.push(existing);
        continue;
      }

      uploadedPhotos.push(photo);
      responsePhotos.push(photo);
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

  res.status(201).json({
    message: defaultFolder ? "Photos uploaded to folder" : "Folder photos uploaded",
    count: uploadedPhotos.length,
    skippedCount,
    photos: responsePhotos
  });
}

async function getGalleryPhotos(req, res) {
  const { galleryId } = req.params;
  const { folderId } = req.query;
  if (!mongoose.isValidObjectId(galleryId)) {
    return res.status(400).json({ message: "Invalid gallery ID" });
  }
  let pagination;
  try {
    pagination = parsePhotoPagination(req.query);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
  if (folderId && !mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }

  // Client credentials are limited to their assigned gallery; admin ownership is checked below.
  if (req.clientAccess && String(galleryId) !== String(req.clientAccess.galleryId)) {
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

  if (pagination.cursor) {
    // IDs are monotonic within the result order, so the cursor avoids large page offsets.
    filter._id = { $gt: new mongoose.Types.ObjectId(pagination.cursor) };
  }

  const results = await Photo.find(filter)
    .sort({ _id: 1 })
    .limit(pagination.limit + 1);
  const hasMore = results.length > pagination.limit;
  const photos = hasMore ? results.slice(0, pagination.limit) : results;
  res.json({
    photos,
    pagination: {
      limit: pagination.limit,
      nextCursor: hasMore ? String(photos[photos.length - 1]._id) : null,
      hasMore
    }
  });
}

async function deletePhoto(req, res) {
  if (!mongoose.isValidObjectId(req.params.photoId)) {
    return res.status(400).json({ message: "Invalid photo ID" });
  }
  const photo = await Photo.findById(req.params.photoId);
  if (!photo) return res.status(404).json({ message: "Photo not found" });

  const gallery = await Gallery.findOne({ _id: photo.galleryId, adminId: req.admin._id });
  if (!gallery) return res.status(404).json({ message: "Photo not found" });

  // Delete the remote original first; keep its database record if Cloudinary reports failure.
  const result = await cloudinary.uploader.destroy(photo.cloudinaryPublicId, { resource_type: "image" });
  if (result.result !== "ok" && result.result !== "not found") {
    return res.status(502).json({ message: "Cloudinary could not delete the image. Database record was kept." });
  }

  await Photo.deleteOne({ _id: photo._id });
  // Remove deleted IDs from saved selections so they cannot appear in later reviews/downloads.
  await Selection.updateMany({ galleryId: gallery._id }, { $pull: { selectedPhotoIds: photo._id } });
  res.json({ message: "Photo deleted" });
}

module.exports = {
  upload,
  uploadPhotos,
  getGalleryPhotos,
  deletePhoto,
  MAX_UPLOAD_FILES
};
