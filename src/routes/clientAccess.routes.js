const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAdmin, requireClient } = require("../middleware/auth.middleware");
const controller = require("../controllers/clientAccess.controller");

// The controller also verifies the admin owns the gallery tied to each client account.
// Admins manage accounts within their own galleries; clients can read only their assigned gallery.
router.post("/", requireAdmin, asyncHandler(controller.createClientAccess));
router.get("/gallery", requireClient, asyncHandler(controller.getMyGallery));
router.get("/gallery/:galleryId", requireAdmin, asyncHandler(controller.getGalleryClients));
router.patch("/:id/status", requireAdmin, asyncHandler(controller.updateClientStatus));
router.patch("/:id/password", requireAdmin, asyncHandler(controller.updateClientPassword));

module.exports = router;
