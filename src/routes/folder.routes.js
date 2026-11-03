const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/folder.controller");

router.post("/galleries/:galleryId/folders", requireAdmin, asyncHandler(controller.createFolder));
router.get("/admin/galleries/:galleryId/folders", requireAdmin, asyncHandler(controller.getGalleryFolders));
router.get("/client/galleries/:galleryId/folders", requireClient, asyncHandler(controller.getGalleryFolders));
router.put("/folders/:folderId", requireAdmin, asyncHandler(controller.updateFolder));
router.delete("/folders/:folderId", requireAdmin, asyncHandler(controller.deleteFolder));

module.exports = router;
