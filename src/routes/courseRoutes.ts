const express = require("express");
const courses = require("../controllers/courseController");
const uploads = require("../controllers/uploadController");
const { requireAuth, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { imageUpload } = require("../middleware/upload");
const { courseSchema, courseUpdateSchema, mongoIdParams, courseListSchema, lessonIdParams, lessonVideoLinkSchema } = require("../middleware/schemas");
const asyncHandler = require("../utils/asyncHandler");
const router = express.Router();

router.get("/", validate(courseListSchema), courses.listCourses);
router.get("/instructor/mine", requireAuth, authorize("instructor", "admin"), courses.listMyCourses);
router.get("/admin/all", requireAuth, authorize("admin"), courses.listAllCourses);
router.get("/:id/preview", requireAuth, authorize("instructor", "admin"), validate(mongoIdParams), courses.previewCourse);
router.post("/", requireAuth, authorize("instructor", "admin"), validate(courseSchema), courses.createCourse);
router.get("/:courseId/content", requireAuth, courses.getCourseContent);
router.get("/:courseId/lessons/:lessonId/video", requireAuth, validate(lessonIdParams), courses.getLessonVideo);
router.get("/:courseId/lessons/:lessonId/video-stream", validate(lessonIdParams), courses.streamLessonVideo);
router.patch("/:id/lessons/video-link", requireAuth, authorize("instructor", "admin"), validate(lessonVideoLinkSchema), asyncHandler(uploads.saveCourseLessonVideoLink));
router.get("/:courseId", courses.getCourse);
router.patch("/:id", requireAuth, authorize("instructor", "admin"), validate(courseUpdateSchema), courses.updateCourse);
router.patch("/:id/publish", requireAuth, authorize("instructor", "admin"), validate(mongoIdParams), courses.togglePublish);
router.delete("/:id", requireAuth, authorize("instructor", "admin"), validate(mongoIdParams), courses.deleteCourse);
router.post(
  "/:id/image",
  requireAuth,
  authorize("instructor", "admin"),
  validate(mongoIdParams),
  imageUpload.single("image"),
  asyncHandler(uploads.uploadCourseImage)
);

module.exports = router;

export {};
