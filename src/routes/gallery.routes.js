const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin } = require("../middleware/auth.middleware");
const controller = require("../controllers/gallery.controller");

// Authentication and ownership checks are applied before each gallery operation.
// Every gallery-management endpoint is scoped to the authenticated admin.
router.post("/", requireAdmin, asyncHandler(controller.createGallery));
router.get("/", requireAdmin, asyncHandler(controller.getGalleries));
router.get("/:id", requireAdmin, asyncHandler(controller.getGallery));
router.put("/:id", requireAdmin, asyncHandler(controller.updateGallery));
router.patch("/:id/archive", requireAdmin, asyncHandler(controller.archiveGallery));
router.delete("/:id", requireAdmin, asyncHandler(controller.deleteGallery));

module.exports = router;
