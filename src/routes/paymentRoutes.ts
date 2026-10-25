const express = require("express");
const payment = require("../controllers/paymentController");
const { requireAuth, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { checkoutSessionParams, checkoutSessionSchema } = require("../middleware/schemas");
const router = express.Router();
router.post("/checkout-session", requireAuth, validate(checkoutSessionSchema), payment.createCheckoutSession);
router.get("/mine", requireAuth, payment.listMyPayments);
router.get("/instructor", requireAuth, authorize("instructor", "admin"), payment.listInstructorPayments);
router.get("/session/:sessionId", requireAuth, validate(checkoutSessionParams), payment.getCheckoutSession);
module.exports = router;

export {};
