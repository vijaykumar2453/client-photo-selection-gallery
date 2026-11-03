const router = require("express").Router();
const asyncHandler = require("../middleware/asyncHandler");
const { adminLogin, clientLogin } = require("../controllers/auth.controller");

router.post("/admin/login", asyncHandler(adminLogin));
router.post("/client/login", asyncHandler(clientLogin));

module.exports = router;
