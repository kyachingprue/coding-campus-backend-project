import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import type { Request } from "express";
import { requireUser, requireValidated } from "../utils/request";
import { courseCurriculum, courseLessons } from "../utils/courseLessons";
import { getGoogleDriveFileId, googleDriveVideoUrl } from "../utils/googleDriveLink";
const { jwtSecret } = require("../config/env");

exports.listCourses = asyncHandler(async (req, res) => {
  const filter: { isPublished: boolean; category?: string } = { isPublished: true };
  if (req.validated?.query.category) filter.category = req.validated.query.category;
  const records = await Course.find(filter)
    .populate("instructor", "name avatarUrl").sort({ createdAt: -1 });
  const courses = records.map((record: any) => publicCourse(record));
  res.json({ courses });
});

exports.getCourse = asyncHandler(async (req, res) => {
  const record = await Course.findOne({ courseId: req.params.courseId, isPublished: true })
    .populate("instructor", "name avatarUrl");
  if (!record) throw new HttpError(404, "Course not found.");
  res.json({ course: publicCourse(record) });
});

exports.previewCourse = asyncHandler(async (req, res) => {
  const course = await ownedCourse(req);
  res.json({ course: publicCourse(course) });
});

exports.getCourseContent = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const course = await Course.findOne({ courseId: req.params.courseId })
    .populate("instructor", "name avatarUrl");
  if (!course) throw new HttpError(404, "Course not found.");
  const isInstructor = String(course.instructor?._id || course.instructor) === String(user.id);
  const enrollment = await Enrollment.findOne({ student: user.id, course: course.id });
  const isEnrolled = Boolean(enrollment);
  if (!isInstructor && !isEnrolled && user.role !== "admin") {
    throw new HttpError(403, "Enroll in this course to access its learning content.");
  }
  const lessons = courseLessons(course);
  const progress = new Map((enrollment?.lessonProgress || []).map((item: any) => [item.lessonId, item]));
  const lessonDetails = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  let nextAvailable = true;
  const learningSections = courseCurriculum(course).map((section) => ({
    ...section,
    lessons: section.lessons.map((lesson: any) => {
      const saved = progress.get(lesson.id) as any;
      const details = lessonDetails.get(lesson.id);
      const unlocked = isInstructor || user.role === "admin" || Boolean(saved?.completedAt) || nextAvailable;
      if (!saved?.completedAt && !isInstructor && user.role !== "admin") nextAvailable = false;
      return {
        ...lesson,
        watchedSeconds: saved?.watchedSeconds || 0,
        lastPositionSeconds: saved?.lastPositionSeconds || 0,
        completed: Boolean(saved?.completedAt),
        unlocked,
        resources: details?.resources || [],
      };
    }),
  }));
  res.json({
    course: {
      ...publicCourse(course),
      sections: learningSections,
      completionThreshold: course.completionThreshold || 90,
    },
    enrolled: isEnrolled,
  });
});

exports.createCourse = asyncHandler(async (req, res) => {
  const body = requireValidated(req).body;
  const course = await Course.create({ ...body, isPublished: false, instructor: requireUser(req).id });
  res.status(201).json({ course });
});

async function ownedCourse(req: Request) {
  const user = requireUser(req);
  const filter = user.role === "admin"
    ? { _id: req.params.id }
    : { _id: req.params.id, instructor: user.id };
  const course = await Course.findOne(filter);
  if (!course) throw new HttpError(404, "Course not found or you do not manage it.");
  return course;
}

exports.updateCourse = asyncHandler(async (req, res) => {
  const course = await ownedCourse(req);
  const changes = requireValidated(req).body;
  if (Array.isArray(changes.sections)) {
    changes.sections = changes.sections.map((section: any) => {
      const previousSection = course.sections.find((item: any) => String(item._id) === String(section._id));
      if (!previousSection) return section;
      return {
        ...section,
        lessons: section.lessons.map((lesson: any) => {
          const previousLesson = previousSection.lessons.find((item: any) => String(item._id) === String(lesson._id));
          return previousLesson
            ? { ...lesson, videoUrl: previousLesson.videoUrl, videoDriveFileId: previousLesson.videoDriveFileId, durationSeconds: previousLesson.durationSeconds }
            : lesson;
        }),
      };
    });
  }
  Object.assign(course, changes);
  await course.save();
  res.json({ course });
});

exports.togglePublish = asyncHandler(async (req, res) => {
  const course = await ownedCourse(req);
  if (!course.isPublished) {
    const lessons = courseLessons(course);
    if (!course.name?.trim() || !course.description?.trim() || !course.category?.trim() || lessons.length === 0) {
      throw new HttpError(400, "Add the required course details and at least one curriculum lesson before publishing.");
    }
    if (lessons.some((lesson) => !lesson.videoUrl)) {
      throw new HttpError(400, "Add a Google Drive video link for every lesson before publishing.");
    }
    course.isPublished = true;
  } else {
    course.isPublished = false;
  }
  await course.save();
  res.json({ course });
});

exports.getLessonVideo = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { courseId, lessonId } = requireValidated(req).params;
  if (!courseId || !lessonId) throw new HttpError(400, "Invalid lesson video request.");
  const course = await Course.findOne({ courseId });
  if (!course) throw new HttpError(404, "Course not found.");
  const lessons = courseLessons(course);
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex < 0) throw new HttpError(404, "Lesson not found.");
  const lesson = lessons[lessonIndex];
  if (!lesson) throw new HttpError(404, "Lesson not found.");
  const isInstructor = String(course.instructor) === String(user.id);
  const enrollment = await Enrollment.findOne({ student: user.id, course: course.id });
  const hasAccess = Boolean(enrollment) || isInstructor || user.role === "admin";
  if (!hasAccess && !(course.isPublished && lesson.freePreview)) {
    throw new HttpError(403, "Purchase this course to access its lessons.");
  }
  if (!isInstructor && user.role !== "admin" && enrollment) {
    const priorLessons = lessons.slice(0, lessonIndex);
    const progress = new Map<string, { completedAt?: Date | null }>(
      enrollment.lessonProgress.map((item: any) => [item.lessonId, item] as [string, { completedAt?: Date | null }])
    );
    if (priorLessons.some((prior) => !progress.get(prior.id)?.completedAt)) {
      throw new HttpError(403, "Complete the previous lesson before opening this lesson.");
    }
    enrollment.activeLessonId = lesson.id;
    enrollment.lastProgressAt = new Date();
    await enrollment.save();
  }
  if (!lesson.videoUrl && !lesson.videoDriveFileId) throw new HttpError(404, "This lesson video is not available yet.");
  const driveFileId = lesson.videoDriveFileId || getDriveFileIdFromLessonUrl(lesson.videoUrl);
  if (driveFileId) {
    const token = jwt.sign({
      purpose: "lesson-video",
      courseId,
      lessonId: lesson.id,
    }, jwtSecret, { expiresIn: "24h" });
    return res.json({
      videoUrl: `${req.baseUrl}/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}/video-stream?token=${encodeURIComponent(token)}`,
      durationSeconds: lesson.durationSeconds,
    });
  }
  res.json({ videoUrl: lesson.videoUrl, durationSeconds: lesson.durationSeconds });
});

exports.streamLessonVideo = asyncHandler(async (req, res) => {
  const { courseId, lessonId } = requireValidated(req).params;
  if (!courseId || !lessonId) throw new HttpError(400, "Invalid lesson video request.");
  const token = req.query.token;
  if (typeof token !== "string") throw new HttpError(401, "The video playback link is invalid or expired.");

  let claims: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, jwtSecret);
    if (typeof verified === "string") throw new HttpError(401, "The video playback link is invalid or expired.");
    claims = verified;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "The video playback link is invalid or expired.");
  }

  if (
    claims.purpose !== "lesson-video" ||
    claims.courseId !== courseId ||
    claims.lessonId !== lessonId
  ) {
    throw new HttpError(401, "The video playback link is invalid or expired.");
  }

  const course = await Course.findOne({ courseId });
  if (!course) throw new HttpError(404, "Course not found.");
  const lesson = courseLessons(course).find((item) => item.id === lessonId);
  if (!lesson) throw new HttpError(404, "This lesson video is not available yet.");
  const driveFileId = lesson.videoDriveFileId || getDriveFileIdFromLessonUrl(lesson.videoUrl);
  if (!driveFileId) throw new HttpError(404, "This lesson video is not available yet.");

  const headers: Record<string, string> = {};
  if (req.headers.range) headers.Range = req.headers.range;
  let upstream: Response;
  try {
    upstream = await fetch(googleDriveVideoUrl(driveFileId), { headers });
  } catch (error) {
    if (error instanceof Error) throw new HttpError(502, "Google Drive could not provide this lesson video. Try again later.");
    throw error;
  }

  if (upstream.status === 416) {
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);
    return res.status(416).end();
  }
  if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
    throw new HttpError(502, "Google Drive could not provide this lesson video. Check that it is shared with anyone who has the link.");
  }

  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const header of ["content-length", "content-range", "content-type"]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.status(upstream.status);
  await pipeline(Readable.from(upstream.body), res);
});

function getDriveFileIdFromLessonUrl(videoUrl: string): string {
  if (!videoUrl.startsWith("https://drive.google.com/")) return "";
  return getGoogleDriveFileId(videoUrl);
}

exports.deleteCourse = asyncHandler(async (req, res) => {
  const course = await ownedCourse(req);
  if (await Enrollment.exists({ course: course.id })) {
    course.isPublished = false;
    await course.save();
    return res.json({ message: "Course archived because learners are enrolled." });
  }
  await course.deleteOne();
  res.json({ message: "Course deleted." });
});

exports.listMyCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ instructor: requireUser(req).id }).sort({ createdAt: -1 });
  res.json({ courses });
});

exports.listAllCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find().populate("instructor", "name email").sort({ createdAt: -1 });
  res.json({ courses });
});

module.exports = {
  listCourses: exports.listCourses,
  getCourse: exports.getCourse,
  previewCourse: exports.previewCourse,
  getCourseContent: exports.getCourseContent,
  createCourse: exports.createCourse,
  updateCourse: exports.updateCourse,
  togglePublish: exports.togglePublish,
  getLessonVideo: exports.getLessonVideo,
  streamLessonVideo: exports.streamLessonVideo,
  deleteCourse: exports.deleteCourse,
  listMyCourses: exports.listMyCourses,
  listAllCourses: exports.listAllCourses,
};

function publicCourse(course: any) {
  const data = typeof course.toObject === "function" ? course.toObject() : course;
  const sections = courseCurriculum(course);
  const totalLessons = sections.reduce((total, section) => total + section.lessons.length, 0);
  return {
    _id: String(course._id),
    courseId: course.courseId,
    name: course.name,
    description: course.description,
    category: course.category,
    subcategory: course.subcategory || "",
    level: course.level,
    learningObjectives: course.learningObjectives || [],
    prerequisites: course.prerequisites || [],
    price: course.price,
    currency: course.currency,
    imageUrl: course.imageUrl || "",
    lessons: course.lessons || totalLessons,
    duration: course.duration || "",
    instructor: data.instructor,
    isPublished: course.isPublished,
    sections,
  };
}

export {};
