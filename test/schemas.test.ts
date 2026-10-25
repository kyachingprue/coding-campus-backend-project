 const test = require("node:test");
const assert = require("node:assert/strict");
const { registerSchema, verifyEmailSchema, courseSchema, courseUpdateSchema, profileSchema, checkoutSessionSchema, lessonVideoLinkSchema, lessonProgressSchema } = require("../src/middleware/schemas");
const { isImageFile } = require("../src/middleware/upload");
const { courseLessons, courseCurriculum } = require("../src/utils/courseLessons");
const { getGoogleDriveFileId, googleDriveVideoUrl } = require("../src/utils/googleDriveLink");

const emptyRequestParts = { params: {}, query: {} };

test("registration validates credentials and never accepts a client-selected role", () => {
  const result = registerSchema.safeParse({
    ...emptyRequestParts,
    body: {
      name: "Ada Lovelace",
      email: "ADA@example.com",
      password: "StrongPass1",
      role: "admin",
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.body.email, "ada@example.com");
  assert.equal(result.data.body.role, undefined);
  assert.equal(registerSchema.safeParse({
    ...emptyRequestParts,
    body: { name: "Ada Lovelace", email: "ada@example.com", password: "weakpassword" },
  }).success, false);
});

test("email verification accepts only a six-digit code and a valid email", () => {
  assert.equal(verifyEmailSchema.safeParse({
    ...emptyRequestParts,
    body: { email: "ADA@example.com", code: "123456" },
  }).success, true);
  assert.equal(verifyEmailSchema.safeParse({
    ...emptyRequestParts,
    body: { email: "ada@example.com", code: "12345x" },
  }).success, false);
});

test("profile uploads accept image MIME types and common extensions, but reject non-images", () => {
  assert.equal(isImageFile("image/avif", "avatar.avif"), true);
  assert.equal(isImageFile("image/heic", "photo.heic"), true);
  assert.equal(isImageFile("application/octet-stream", "scan.tiff"), true);
  assert.equal(isImageFile("application/pdf", "document.png"), false);
  assert.equal(isImageFile("application/octet-stream", "document.pdf"), false);
});

test("Google Drive share links are validated and converted to a direct video URL", () => {
  const fileId = "1AbCdEfGhIjKlMnOpQrStUv";
  assert.equal(getGoogleDriveFileId(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`), fileId);
  assert.equal(getGoogleDriveFileId(`https://drive.google.com/open?id=${fileId}`), fileId);
  assert.equal(googleDriveVideoUrl(fileId), `https://drive.google.com/uc?export=download&id=${fileId}`);
  assert.throws(() => getGoogleDriveFileId("https://example.com/video.mp4"), /Google Drive video link/);
  assert.throws(() => getGoogleDriveFileId("https://drive.google.com/file/d/short/view"), /does not look like/);
});

test("lesson video link endpoint validates a lesson ID and accepts an empty link to remove it", () => {
  const request = {
    ...emptyRequestParts,
    params: { id: "507f1f77bcf86cd799439011" },
    body: { lessonId: "507f1f77bcf86cd799439012", videoUrl: "" },
  };
  assert.equal(lessonVideoLinkSchema.safeParse(request).success, true);
  assert.equal(lessonVideoLinkSchema.safeParse({
    ...request,
    body: { ...request.body, videoUrl: "not a URL" },
  }).success, false);
  assert.equal(lessonVideoLinkSchema.safeParse({
    ...request,
    body: { ...request.body, lessonId: "invalid-id" },
  }).success, false);
});

test("lesson progress accepts a bounded media duration for lessons without saved duration metadata", () => {
  const request = {
    params: { courseId: "react" },
    query: {},
    body: { lessonId: "s:section:lesson", currentTime: 8, durationSeconds: 10 },
  };
  assert.equal(lessonProgressSchema.safeParse(request).success, true);
  assert.equal(lessonProgressSchema.safeParse({
    ...request,
    body: { ...request.body, durationSeconds: 0 },
  }).success, false);
  assert.equal(lessonProgressSchema.safeParse({
    ...request,
    body: { ...request.body, durationSeconds: 86_401 },
  }).success, false);
});

test("course prices must be positive and course ids are restricted", () => {
  const base = {
    ...emptyRequestParts,
    body: {
      courseId: "react",
      name: "React",
      description: "A sufficiently long course description.",
      category: "Framework",
      price: 49,
    },
  };
  assert.equal(courseSchema.safeParse(base).success, true);
  assert.equal(courseSchema.safeParse({
    ...base,
    body: { ...base.body, price: 0 },
  }).success, false);
  assert.equal(courseSchema.safeParse({
    ...base,
    body: { ...base.body, courseId: "../admin" },
  }).success, false);
  const update = courseUpdateSchema.safeParse({
    ...emptyRequestParts,
    params: { id: "507f1f77bcf86cd799439011" },
    body: { courseId: "new-id", price: 60 },
  });
  assert.equal(update.success, true);
  assert.equal(update.data.body.courseId, undefined);
  assert.equal(courseUpdateSchema.safeParse({
    ...emptyRequestParts,
    params: { id: "../../users" },
    body: { price: 60 },
  }).success, false);
  assert.equal(checkoutSessionSchema.safeParse({
    ...emptyRequestParts,
    body: { courseId: "react-course" },
  }).success, true);
  assert.equal(checkoutSessionSchema.safeParse({
    ...emptyRequestParts,
    body: { courseId: "../admin" },
  }).success, false);
});

test("profile updates accept only bounded profile data and reject empty updates", () => {
  assert.equal(profileSchema.safeParse({
    ...emptyRequestParts,
    body: { bio: "Learning JavaScript" },
  }).success, true);
  assert.equal(profileSchema.safeParse({
    ...emptyRequestParts,
    body: {},
  }).success, false);
});

test("course curriculum preserves ordered lesson IDs but never exposes video URLs in previews", () => {
  const course = {
    sections: [
      {
        _id: "507f1f77bcf86cd799439011",
        title: "Foundations",
        order: 0,
        lessons: [
          {
            _id: "507f1f77bcf86cd799439012",
            title: "First lesson",
            order: 0,
            videoUrl: "https://media.example/private.mp4",
            durationSeconds: 120,
          },
        ],
      },
    ],
  };
  const lessons = courseLessons(course);
  assert.equal(lessons[0]?.id, "s:507f1f77bcf86cd799439011:507f1f77bcf86cd799439012");
  assert.equal(lessons[0]?.videoUrl, "https://media.example/private.mp4");
  const preview = courseCurriculum(course);
  assert.equal(preview[0]?.lessons[0]?.title, "First lesson");
  assert.equal("videoUrl" in (preview[0]?.lessons[0] || {}), false);
});

export {};
