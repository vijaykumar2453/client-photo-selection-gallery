const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/selection.controller");

router.put("/mine", requireClient, asyncHandler(controller.saveSelection));
router.post("/mine/submit", requireClient, asyncHandler(controller.submitSelection));
router.get("/mine", requireClient, asyncHandler(controller.getMySelection));

router.get("/:galleryId/clients/:clientAccessId", requireAdmin, asyncHandler(controller.getGallerySelection));
router.get("/:galleryId/clients/:clientAccessId/download", requireAdmin, asyncHandler(controller.downloadSelectionZip));

module.exports = router;
