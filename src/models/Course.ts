const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    subcategory: { type: String, trim: true, maxlength: 80, default: "" },
    level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" },
    learningObjectives: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: "usd", lowercase: true, enum: ["usd"] },
    imageUrl: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    videoDriveFileId: { type: String, default: "" },
    videoDurationSeconds: { type: Number, default: 0, min: 0 },
    videoLessons: {
      type: [{
        title: { type: String, required: true, trim: true, maxlength: 120 },
        videoUrl: { type: String, required: true },
        videoDriveFileId: { type: String, default: "" },
        durationSeconds: { type: Number, default: 0, min: 0 },
        freePreview: { type: Boolean, default: false },
        resources: { type: [{ title: { type: String, required: true }, url: { type: String, required: true } }], default: [] },
        order: { type: Number, required: true, min: 0 },
      }],
      default: [],
    },
    sections: {
      type: [{
        title: { type: String, required: true, trim: true, maxlength: 120 },
        order: { type: Number, required: true, min: 0 },
        lessons: {
          type: [{
            title: { type: String, required: true, trim: true, maxlength: 120 },
            videoUrl: { type: String, default: "" },
            videoDriveFileId: { type: String, default: "" },
            durationSeconds: { type: Number, default: 0, min: 0 },
            freePreview: { type: Boolean, default: false },
            resources: { type: [{ title: { type: String, required: true }, url: { type: String, required: true } }], default: [] },
            order: { type: Number, required: true, min: 0 },
          }],
          default: [],
        },
      }],
      default: [],
    },
    lessons: { type: Number, default: 0, min: 0 },
    duration: { type: String, default: "" },
    completionThreshold: { type: Number, default: 90, min: 50, max: 100 },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);

export {};
