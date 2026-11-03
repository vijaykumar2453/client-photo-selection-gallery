const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/photo.controller");

router.post(
  "/galleries/:galleryId/folders/:folderId/photos",
  requireAdmin,
  controller.upload.array("photos", 30),
  asyncHandler(controller.uploadPhotos)
);
router.get("/galleries/:galleryId/photos", requireClient, asyncHandler(controller.getGalleryPhotos));
router.get("/admin/galleries/:galleryId/photos", requireAdmin, asyncHandler(controller.getGalleryPhotos));
router.delete("/galleries/:galleryId/photos/:photoId", requireAdmin, asyncHandler(controller.deletePhoto));

module.exports = router;
