const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const {
  adminLogin,
  updateAdminDetails,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
  clientLogin
} = require("../controllers/auth.controller");
const { requireAdmin } = require("../middleware/auth.middleware");

// These routes map auth URLs to controller functions; only profile updates require a login.
// Login endpoints are public; successful handlers issue the tokens used by protected routes.
router.post("/admin/login", asyncHandler(adminLogin));
router.put("/admin/me", requireAdmin, asyncHandler(updateAdminDetails));
router.post("/admin/password-reset/request", asyncHandler(requestAdminPasswordReset));
router.post("/admin/password-reset/confirm", asyncHandler(confirmAdminPasswordReset));
router.post("/client/login", asyncHandler(clientLogin));

module.exports = router;
