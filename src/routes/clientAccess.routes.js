const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/clientAccess.controller");

router.post("/", requireAdmin, asyncHandler(controller.createClientAccess));
router.get("/gallery", requireClient, asyncHandler(controller.getMyGallery));
router.get("/gallery/:galleryId", requireAdmin, asyncHandler(controller.getGalleryClients));
router.patch("/:id/status", requireAdmin, asyncHandler(controller.updateClientStatus));

module.exports = router;
