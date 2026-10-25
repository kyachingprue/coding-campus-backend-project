const express = require("express");
const { rateLimit } = require("express-rate-limit");
const auth = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { registerSchema, loginSchema, emailSchema, verifyEmailSchema, profileSchema } = require("../middleware/schemas");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
router.post("/register", authLimiter, validate(registerSchema), auth.register);
router.post("/register/resend-code", authLimiter, validate(emailSchema), auth.resendRegistrationCode);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), auth.verifyEmail);
router.post("/login", authLimiter, validate(loginSchema), auth.login);
router.post("/logout", auth.logout);
router.get("/me", requireAuth, auth.me);
router.patch("/me", requireAuth, validate(profileSchema), auth.updateProfile);
router.patch("/password", requireAuth, auth.changePassword);
router.post("/forgot-password", authLimiter, auth.forgotPassword);
router.post("/reset-password", authLimiter, auth.resetPassword);

module.exports = router;

export {};
