const express = require("express");
const { listMyEnrollments, updateLessonProgress } = require("../controllers/enrollmentController");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { lessonProgressSchema } = require("../middleware/schemas");
const router = express.Router();
router.get("/mine", requireAuth, listMyEnrollments);
router.post("/:courseId/progress", requireAuth, validate(lessonProgressSchema), updateLessonProgress);
module.exports = router;

export {};
