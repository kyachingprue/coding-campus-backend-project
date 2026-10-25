const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import { requireUser, requireValidated } from "../utils/request";
import { courseCurriculum, courseLessons } from "../utils/courseLessons";

exports.listMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ student: requireUser(req).id })
    .populate({ path: "course", populate: { path: "instructor", select: "name avatarUrl" } })
    .sort({ enrolledAt: -1 });
  res.json({
    enrollments: enrollments.map((enrollment: any) => {
      const course = enrollment.course;
      if (!course) return { ...enrollment.toObject(), course: null };
      const curriculum = courseLessons(course);
      const completed = new Set<string>(
        enrollment.lessonProgress.filter((item: any) => item.completedAt).map((item: any) => item.lessonId)
      );
      const currentLessonIds = new Set(curriculum.map((lesson) => lesson.id));
      const completedCount = [...completed].filter((lessonId) => currentLessonIds.has(lessonId)).length;
      const courseData = typeof course.toObject === "function" ? course.toObject() : course;
      return {
        enrolledAt: enrollment.enrolledAt,
        lessonProgress: enrollment.lessonProgress.map((item: any) => ({
          lessonId: item.lessonId,
          watchedSeconds: item.watchedSeconds,
          lastPositionSeconds: item.lastPositionSeconds || 0,
          completed: Boolean(item.completedAt),
        })),
        course: {
          courseId: course.courseId,
          name: course.name,
          description: course.description,
          category: course.category,
          subcategory: course.subcategory || "",
          level: course.level,
          price: course.price,
          lessons: curriculum.length || course.lessons,
          duration: course.duration,
          imageUrl: course.imageUrl || "",
          instructor: courseData.instructor,
          sections: curriculum.length
            ? courseCurriculum(course).map((section: any) => ({
              ...section,
              lessons: section.lessons.map((lesson: any) => ({
                ...lesson,
                completed: completed.has(lesson.id),
              })),
            }))
            : [],
          progressPercent: curriculum.length ? Math.round((completedCount / curriculum.length) * 100) : 0,
        },
      };
    }),
  });
});

exports.updateLessonProgress = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { body: { lessonId, currentTime, durationSeconds }, params: { courseId } } = requireValidated<{
    lessonId: string;
    currentTime?: number;
    durationSeconds?: number;
  }>(req);
  const course = await Course.findOne({ courseId });
  if (!course) throw new HttpError(404, "Course not found.");
  const enrollment = await Enrollment.findOne({ student: user.id, course: course.id });
  if (!enrollment) {
    throw new HttpError(403, "Purchase this course before saving lesson progress.");
  }
  const lessons = courseLessons(course);
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex < 0) throw new HttpError(404, "Lesson not found.");
  const lesson = lessons[lessonIndex];
  if (!lesson) throw new HttpError(404, "Lesson not found.");
  if (enrollment.activeLessonId !== lessonId || !enrollment.lastProgressAt) {
    throw new HttpError(403, "Open the lesson before recording progress.");
  }
  const priorProgress = new Map<string, { completedAt?: Date | null }>(
    enrollment.lessonProgress.map((item: any) => [item.lessonId, item] as [string, { completedAt?: Date | null }])
  );
  if (lessons.slice(0, lessonIndex).some((lesson) => !priorProgress.get(lesson.id)?.completedAt)) {
    throw new HttpError(403, "Complete the previous lesson before recording progress.");
  }

  const now = new Date();
  const elapsed = Math.max(0, Math.min(15, (now.getTime() - enrollment.lastProgressAt.getTime()) / 1000));
  let progress = enrollment.lessonProgress.find((item: any) => item.lessonId === lessonId);
  if (!progress) {
    enrollment.lessonProgress.push({ lessonId, watchedSeconds: 0, completedAt: null });
    progress = enrollment.lessonProgress[enrollment.lessonProgress.length - 1];
  }
  const reportedPosition = Math.max(0, Math.min(currentTime || 0, lesson.durationSeconds || Number.MAX_SAFE_INTEGER));
  const previousPosition = progress.lastPositionSeconds || 0;
  const positionAdvance = reportedPosition - previousPosition;
  if (positionAdvance > 0 && positionAdvance <= elapsed * 1.5 + 2) {
    progress.watchedSeconds += Math.min(positionAdvance, elapsed * 1.5);
    progress.lastPositionSeconds = reportedPosition;
  }
  enrollment.lastProgressAt = now;
  const lessonDuration = lesson.durationSeconds || durationSeconds || 0;
  const requiredSeconds = lessonDuration > 0
    ? lessonDuration * ((course.completionThreshold || 90) / 100)
    : 30;
  if (progress.watchedSeconds >= requiredSeconds && !progress.completedAt) {
    progress.completedAt = now;
  }
  await enrollment.save();
  res.json({
    lessonId,
    watchedSeconds: progress.watchedSeconds,
    completed: Boolean(progress.completedAt),
    completionThreshold: course.completionThreshold || 90,
  });
});

module.exports = {
  listMyEnrollments: exports.listMyEnrollments,
  updateLessonProgress: exports.updateLessonProgress,
};

export {};
