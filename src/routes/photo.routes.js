const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/photo.controller");
const MAX_UPLOAD_FILES = controller.MAX_UPLOAD_FILES;

// Multer parses image uploads before the controller validates and stores them.
// Uploads and deletes are admin-only; clients may list photos only in their assigned gallery.
router.post(
  "/galleries/:galleryId/folders/:folderId/photos",
  requireAdmin,
  controller.upload.array("photos", MAX_UPLOAD_FILES),
  asyncHandler(controller.uploadPhotos)
);
router.post(
  "/galleries/:galleryId/photos",
  requireAdmin,
  controller.upload.array("photos", MAX_UPLOAD_FILES),
  asyncHandler(controller.uploadPhotos)
);
router.get("/galleries/:galleryId/photos", requireClient, asyncHandler(controller.getGalleryPhotos));
router.get("/admin/galleries/:galleryId/photos", requireAdmin, asyncHandler(controller.getGalleryPhotos));
router.delete("/galleries/:galleryId/photos/:photoId", requireAdmin, asyncHandler(controller.deletePhoto));

module.exports = router;
