const { cloudinary } = require("../config/services");
const User = require("../models/User");
const Course = require("../models/Course");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import { requireUser, requireValidated } from "../utils/request";
import type { UploadApiResponse } from "cloudinary";
import { getGoogleDriveFileId } from "../utils/googleDriveLink";

exports.uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose an image file.");
  if (req.body.type && !["avatar", "cover"].includes(req.body.type)) {
    throw new HttpError(400, "Image type must be avatar or cover.");
  }
  if (!process.env.IMGBB_API_KEY) throw new HttpError(503, "Image hosting is not configured.");
  const form = new FormData();
  form.append("image", req.file.buffer.toString("base64"));
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(process.env.IMGBB_API_KEY)}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.success || !result.data?.url) {
    throw new HttpError(502, "The image hosting service could not upload this image.");
  }
  const field = req.body.type === "cover" ? "coverUrl" : "avatarUrl";
  const user = await User.findByIdAndUpdate(requireUser(req).id, { [field]: result.data.url }, { new: true });
  res.json({ user, imageUrl: result.data.url });
});

exports.saveCourseLessonVideoLink = asyncHandler(async (req, res) => {
  const authenticatedUser = requireUser(req);
  const { lessonId, videoUrl } = requireValidated<{ lessonId: string; videoUrl: string }>(req).body;
  const courseFilter = authenticatedUser.role === "admin"
    ? { _id: req.params.id }
    : { _id: req.params.id, instructor: authenticatedUser.id };
  const course = await Course.findOne(courseFilter);
  if (!course) throw new HttpError(404, "Course not found or you do not manage it.");

  const targetLesson = course.sections
    .flatMap((section: any) => section.lessons)
    .find((item: any) => String(item._id) === lessonId);
  if (!targetLesson) throw new HttpError(404, "Curriculum lesson not found.");

  if (!videoUrl) {
    targetLesson.videoUrl = "";
    targetLesson.videoDriveFileId = "";
  } else {
    const submittedUrl = videoUrl.trim();
    const fileId = getGoogleDriveFileId(submittedUrl);
    targetLesson.videoUrl = submittedUrl;
    targetLesson.videoDriveFileId = fileId;
  }
  await course.save();
  res.json({ lesson: targetLesson });
});

exports.uploadCourseImage = asyncHandler(async (req, res) => {
  const authenticatedUser = requireUser(req);
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose a course image.");
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new HttpError(503, "Image hosting is not configured.");
  }
  const filter = authenticatedUser.role === "admin"
    ? { _id: req.params.id }
    : { _id: req.params.id, instructor: authenticatedUser.id };
  const course = await Course.findOne(filter);
  if (!course) throw new HttpError(404, "Course not found or you do not manage it.");

  const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "code-campus/course-covers" },
      (error: Error | undefined, result: UploadApiResponse | undefined) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary returned no upload result."));
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
  course.imageUrl = uploaded.secure_url;
  await course.save();
  res.status(201).json({ course, imageUrl: uploaded.secure_url });
});

module.exports = {
  uploadProfileImage: exports.uploadProfileImage,
  saveCourseLessonVideoLink: exports.saveCourseLessonVideoLink,
  uploadCourseImage: exports.uploadCourseImage,
};

export {};
