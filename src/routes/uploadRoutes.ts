const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { imageUpload } = require("../middleware/upload");
const { uploadProfileImage } = require("../controllers/uploadController");
const asyncHandler = require("../utils/asyncHandler");
const router = express.Router();
router.post("/profile-image", requireAuth, imageUpload.single("image"), asyncHandler(uploadProfileImage));
module.exports = router;

export {};
