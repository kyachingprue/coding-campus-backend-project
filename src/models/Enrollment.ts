const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    enrolledAt: { type: Date, default: Date.now },
    lessonProgress: {
      type: [{
        lessonId: { type: String, required: true },
        watchedSeconds: { type: Number, default: 0, min: 0 },
        lastPositionSeconds: { type: Number, default: 0, min: 0 },
        completedAt: { type: Date, default: null },
      }],
      default: [],
    },
    activeLessonId: { type: String, default: "" },
    lastProgressAt: { type: Date, default: null },
  },
  { timestamps: true }
);
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);

export {};
