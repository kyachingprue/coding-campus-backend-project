import { z } from "zod";
import { strongPasswordPattern } from "../utils/password";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Must be a valid ID");
const courseIdPattern = /^[a-zA-Z0-9_-]+$/;
const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().regex(strongPasswordPattern, "Use 8–128 characters with an uppercase letter, a lowercase letter, and a number."),
  }),
  params: z.object({}),
  query: z.object({}),
});
const loginSchema = z.object({
  body: z.object({ email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) }),
  params: z.object({}),
  query: z.object({}),
});
const emailSchema = z.object({
  body: z.object({ email: z.email().transform((value) => value.toLowerCase()) }),
  params: z.object({}),
  query: z.object({}),
});
const verifyEmailSchema = z.object({
  body: z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
  }),
  params: z.object({}),
  query: z.object({}),
});
const mongoIdParams = z.object({
  body: z.object({}),
  params: z.object({ id: objectId }),
  query: z.object({}),
});
const lessonVideoLinkSchema = z.object({
  body: z.object({
    lessonId: objectId,
    videoUrl: z.union([z.url().max(2000), z.literal("")]),
  }),
  params: z.object({ id: objectId }),
  query: z.object({}),
});
const courseListSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({ category: z.string().trim().max(80).optional() }),
});
const checkoutSessionParams = z.object({
  body: z.object({}),
  params: z.object({ sessionId: z.string().regex(/^cs_(test|live)_[a-zA-Z0-9]+$/) }),
  query: z.object({}),
});
const checkoutSessionSchema = z.object({
  body: z.object({ courseId: z.string().trim().min(1).max(80).regex(courseIdPattern) }),
  params: z.object({}),
  query: z.object({}),
});
const courseLessonSchema = z.object({
  _id: objectId.optional(),
  title: z.string().trim().min(1).max(120),
  order: z.number().int().nonnegative(),
  freePreview: z.boolean().optional(),
  resources: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    url: z.url().max(1000),
  })).max(20).optional(),
});
const courseSectionSchema = z.object({
  _id: objectId.optional(),
  title: z.string().trim().min(1).max(120),
  order: z.number().int().nonnegative(),
  lessons: z.array(courseLessonSchema).max(100),
});
const courseSchema = z.object({
  body: z.object({
    courseId: z.string().trim().min(1).max(80).regex(courseIdPattern),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10).max(5000),
    category: z.string().trim().min(2).max(80),
    subcategory: z.string().trim().max(80).optional(),
    level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
    learningObjectives: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    prerequisites: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    sections: z.array(courseSectionSchema).max(50).optional(),
    price: z.number().positive(),
    currency: z.literal("usd").optional(),
    imageUrl: z.url().optional().or(z.literal("")),
    lessons: z.number().int().nonnegative().optional(),
    duration: z.string().max(80).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});
const courseUpdateSchema = z.object({
  body: courseSchema.shape.body.omit({ courseId: true }).partial().refine((value) => Object.keys(value).length > 0),
  params: z.object({ id: objectId }),
  query: z.object({}),
});
const lessonProgressSchema = z.object({
  body: z.object({
    lessonId: z.string().min(1).max(100),
    currentTime: z.number().finite().nonnegative().optional(),
    durationSeconds: z.number().finite().positive().max(86_400).optional(),
  }),
  params: z.object({ courseId: z.string().trim().min(1).max(80).regex(courseIdPattern) }),
  query: z.object({}),
});
const lessonIdParams = z.object({
  body: z.object({}),
  params: z.object({
    courseId: z.string().trim().min(1).max(80).regex(courseIdPattern),
    lessonId: z.string().min(1).max(100),
  }),
  query: z.object({}),
});
const profileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    bio: z.string().max(500).optional(),
    headline: z.string().max(120).optional(),
    location: z.string().max(120).optional(),
    education: z.string().max(160).optional(),
    currentFocus: z.string().max(160).optional(),
    learningGoal: z.string().max(500).optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
    github: z.string().max(300).optional(),
    linkedin: z.string().max(300).optional(),
    website: z.string().max(300).optional(),
    projectName: z.string().max(160).optional(),
    projectDescription: z.string().max(1000).optional(),
    availability: z.string().max(100).optional(),
  })
    .refine((value) => Object.keys(value).length > 0),
  params: z.object({}),
  query: z.object({}),
});

module.exports = {
  objectId,
  registerSchema,
  loginSchema,
  emailSchema,
  verifyEmailSchema,
  mongoIdParams,
  lessonVideoLinkSchema,
  courseListSchema,
  checkoutSessionParams,
  checkoutSessionSchema,
  courseSchema,
  courseUpdateSchema,
  lessonProgressSchema,
  lessonIdParams,
  profileSchema,
};

export {};
