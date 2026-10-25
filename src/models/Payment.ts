const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    stripeCheckoutSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, lowercase: true },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
    paidAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);

export {};
