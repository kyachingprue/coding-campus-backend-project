const User = require("../models/User");
const Course = require("../models/Course");
const Payment = require("../models/Payment");
const Enrollment = require("../models/Enrollment");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import { requireUser } from "../utils/request";

exports.listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json({ users });
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!["student", "instructor", "admin"].includes(role)) {
    throw new HttpError(400, "Role must be student, instructor, or admin.");
  }
  if (String(requireUser(req).id) === req.params.id && role !== "admin") {
    throw new HttpError(400, "You cannot remove your own admin role.");
  }
  if (role !== "admin") {
    const target = await User.findById(req.params.id).select("role");
    if (target?.role === "admin" && await User.countDocuments({ role: "admin" }) <= 1) {
      throw new HttpError(400, "You cannot remove the last administrator.");
    }
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, "User not found.");
  res.json({ user });
});

exports.getAnalytics = asyncHandler(async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const [userCounts, courseCounts, paymentSummary, monthlyRows, topCourses, topInstructors] = await Promise.all([
    User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    Course.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          published: { $sum: { $cond: ["$isPublished", 1, 0] } },
        },
      },
    ]),
    Payment.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: "paid", paidAt: { $gte: monthStart } } },
      {
        $group: {
          _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
          revenue: { $sum: "$amount" },
          payments: { $sum: 1 },
        },
      },
    ]),
    Enrollment.aggregate([
      { $group: { _id: "$course", enrollments: { $sum: 1 } } },
      { $sort: { enrollments: -1 } },
      { $limit: 8 },
      { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
      { $unwind: "$course" },
      { $project: { _id: 0, courseId: "$course.courseId", name: "$course.name", enrollments: 1 } },
    ]),
    Course.aggregate([
      { $group: { _id: "$instructor", courses: { $sum: 1 } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "instructor" } },
      { $unwind: "$instructor" },
      { $match: { "instructor.role": "instructor" } },
      {
        $lookup: {
          from: "payments",
          let: { instructorId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$status", "paid"] } } },
            { $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "course" } },
            { $unwind: "$course" },
            { $match: { $expr: { $eq: ["$course.instructor", "$$instructorId"] } } },
            { $group: { _id: null, income: { $sum: "$amount" }, sales: { $sum: 1 } } },
          ],
          as: "sales",
        },
      },
      { $unwind: { path: "$sales", preserveNullAndEmptyArrays: true } },
      { $sort: { "sales.income": -1 } },
      { $limit: 8 },
      {
        $project: {
          _id: "$instructor._id",
          name: "$instructor.name",
          email: "$instructor.email",
          courses: 1,
          income: { $ifNull: ["$sales.income", 0] },
          sales: { $ifNull: ["$sales.sales", 0] },
        },
      },
    ]),
  ]);

  const users = { student: 0, instructor: 0, admin: 0 };
  for (const entry of userCounts) {
    if (entry._id in users) users[entry._id as keyof typeof users] = entry.count;
  }
  const monthly = Array.from({ length: 12 }, (_value, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const item = monthlyRows.find((row: { _id: { year: number; month: number }; revenue: number; payments: number }) =>
      row._id.year === year && row._id.month === month);
    return {
      year,
      month,
      label: date.toLocaleString("en", { month: "short" }),
      revenue: item?.revenue || 0,
      payments: item?.payments || 0,
    };
  });
  res.json({
    users,
    courses: courseCounts[0] || { total: 0, published: 0 },
    payments: paymentSummary[0] || { total: 0, paid: 0, revenue: 0 },
    monthly,
    topCourses,
    topInstructors,
  });
});

exports.listStudents = asyncHandler(async (_req, res) => {
  const students = await User.aggregate([
    { $match: { role: "student" } },
    {
      $lookup: {
        from: "enrollments",
        let: { studentId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$student", "$$studentId"] } } },
          { $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "course" } },
          { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
          { $project: { courseId: "$course.courseId", courseName: "$course.name", enrolledAt: 1 } },
        ],
        as: "enrollments",
      },
    },
    {
      $lookup: {
        from: "payments",
        let: { studentId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$student", "$$studentId"] }, { $eq: ["$status", "paid"] }] } } },
          { $group: { _id: null, paidCount: { $sum: 1 }, spent: { $sum: "$amount" } } },
        ],
        as: "paymentSummary",
      },
    },
    { $unwind: { path: "$paymentSummary", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: { $toString: "$_id" },
        name: 1,
        email: 1,
        isActive: 1,
        createdAt: 1,
        enrollments: 1,
        paidCount: { $ifNull: ["$paymentSummary.paidCount", 0] },
        spent: { $ifNull: ["$paymentSummary.spent", 0] },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 500 },
  ]);
  res.json({ students });
});

exports.listInstructors = asyncHandler(async (_req, res) => {
  const instructors = await User.aggregate([
    { $match: { role: "instructor" } },
    {
      $lookup: {
        from: "courses",
        let: { instructorId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$instructor", "$$instructorId"] } } },
          {
            $lookup: {
              from: "enrollments",
              localField: "_id",
              foreignField: "course",
              as: "enrollments",
            },
          },
          {
            $project: {
              courseId: 1,
              name: 1,
              price: 1,
              isPublished: 1,
              enrollmentCount: { $size: "$enrollments" },
            },
          },
        ],
        as: "courses",
      },
    },
    {
      $lookup: {
        from: "payments",
        let: { instructorId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$status", "paid"] } } },
          { $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "course" } },
          { $unwind: "$course" },
          { $match: { $expr: { $eq: ["$course.instructor", "$$instructorId"] } } },
          { $group: { _id: null, income: { $sum: "$amount" }, sales: { $sum: 1 } } },
        ],
        as: "paymentSummary",
      },
    },
    { $unwind: { path: "$paymentSummary", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: { $toString: "$_id" },
        name: 1,
        email: 1,
        isActive: 1,
        createdAt: 1,
        courses: 1,
        income: { $ifNull: ["$paymentSummary.income", 0] },
        sales: { $ifNull: ["$paymentSummary.sales", 0] },
      },
    },
    { $sort: { income: -1, createdAt: -1 } },
    { $limit: 500 },
  ]);
  res.json({ instructors });
});

exports.getAdminSettings = asyncHandler(async (_req, res) => {
  const [userCount, courseCount] = await Promise.all([
    User.countDocuments(),
    Course.countDocuments(),
  ]);
  res.json({
    environment: process.env.NODE_ENV || "development",
    totals: { users: userCount, courses: courseCount },
    capabilities: {
      roleManagement: true,
      courseModeration: true,
      paymentReporting: true,
      emailVerification: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      imageUploads: Boolean(process.env.IMGBB_API_KEY),
      videoLinks: true,
    },
  });
});

exports.listPayments = asyncHandler(async (_req, res) => {
  const payments = await Payment.find()
    .populate("student", "name email")
    .populate("course", "courseId name")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ payments });
});

module.exports = {
  listUsers: exports.listUsers,
  updateUserRole: exports.updateUserRole,
  getAnalytics: exports.getAnalytics,
  listStudents: exports.listStudents,
  listInstructors: exports.listInstructors,
  getAdminSettings: exports.getAdminSettings,
  listPayments: exports.listPayments,
};

export {};
