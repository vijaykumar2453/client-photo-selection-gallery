const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin } = require("../middleware/auth.middleware");
const controller = require("../controllers/gallery.controller");

router.post("/", requireAdmin, asyncHandler(controller.createGallery));
router.get("/", requireAdmin, asyncHandler(controller.getGalleries));
router.get("/:id", requireAdmin, asyncHandler(controller.getGallery));
router.put("/:id", requireAdmin, asyncHandler(controller.updateGallery));
router.delete("/:id", requireAdmin, asyncHandler(controller.deleteGallery));

module.exports = router;
