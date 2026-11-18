const mongoose = require("mongoose");

const supportCallSchema = new mongoose.Schema(
  {
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roomName: { type: String, required: true, unique: true },
    topic: { type: String, trim: true, maxlength: 120, default: "" },
    status: { type: String, enum: ["ringing", "accepted", "declined", "ended"], default: "ringing", index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
supportCallSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SupportCall", supportCallSchema);

export {};
