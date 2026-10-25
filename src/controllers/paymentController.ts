const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const Payment = require("../models/Payment");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import { requireUser } from "../utils/request";
const { getStripe } = require("../config/services");
const { clientUrl } = require("../config/env");

exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { courseId } = req.body;
  if (typeof courseId !== "string" || !courseId) throw new HttpError(400, "courseId is required.");
  const course = await Course.findOne({ courseId, isPublished: true });
  if (!course) throw new HttpError(404, "Course not found.");
  if (await Enrollment.exists({ student: user.id, course: course.id })) {
    throw new HttpError(409, "You are already enrolled in this course.");
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: course.currency,
        unit_amount: Math.round(course.price * 100),
        product_data: { name: course.name, description: course.description.slice(0, 500) },
      },
    }],
    metadata: { studentId: user.id, courseId: course.id },
    success_url: `${clientUrl}/dashboard/learning?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/dashboard/checkout/${encodeURIComponent(course.courseId)}?checkout=cancelled`,
  });

  await Payment.create({
    student: user.id,
    course: course.id,
    stripeCheckoutSessionId: session.id,
    amount: course.price,
    currency: course.currency,
  });
  res.status(201).json({ checkoutUrl: session.url, sessionId: session.id });
});

exports.listMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ student: requireUser(req).id })
    .populate("course", "courseId name")
    .sort({ createdAt: -1 });
  res.json({ payments });
});

exports.listInstructorPayments = asyncHandler(async (req, res) => {
  const instructorId = requireUser(req).id;
  const courses = await Course.find({ instructor: instructorId }).select("_id name courseId");
  const courseIds = courses.map((course: { _id: unknown }) => course._id);
  if (!courseIds.length) {
    return res.json({
      payments: [],
      summary: { totalPayments: 0, paidPayments: 0, revenue: 0, studentCount: 0, packageCount: 0 },
      monthly: [],
      topCourses: [],
    });
  }

  const since = new Date();
  since.setDate(1);
  since.setMonth(since.getMonth() - 11);
  since.setHours(0, 0, 0, 0);

  const [payments, totals, monthlyRows, topCourses] = await Promise.all([
    Payment.find({ course: { $in: courseIds } })
      .populate("student", "name email avatarUrl")
      .populate("course", "name courseId")
      .sort({ createdAt: -1 })
      .limit(250),
    Payment.aggregate([
      { $match: { course: { $in: courseIds } } },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          paidPayments: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
          students: { $addToSet: { $cond: [{ $eq: ["$status", "paid"] }, "$student", null] } },
        },
      },
      { $project: { totalPayments: 1, paidPayments: 1, revenue: 1, studentCount: { $size: { $setDifference: ["$students", [null]] } } } },
    ]),
    Payment.aggregate([
      { $match: { course: { $in: courseIds }, status: "paid", paidAt: { $gte: since } } },
      {
        $group: {
          _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
          revenue: { $sum: "$amount" },
          sales: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { course: { $in: courseIds }, status: "paid" } },
      { $group: { _id: "$course", sales: { $sum: 1 }, revenue: { $sum: "$amount" } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
      { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
      { $unwind: "$course" },
      { $project: { _id: 0, courseId: "$course.courseId", name: "$course.name", sales: 1, revenue: 1 } },
    ]),
  ]);

  const now = new Date();
  const monthly = Array.from({ length: 12 }, (_value, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const row = monthlyRows.find((item: { _id: { year: number; month: number } }) =>
      item._id.year === year && item._id.month === month);
    return {
      year,
      month,
      label: date.toLocaleString("en", { month: "short" }),
      revenue: row?.revenue || 0,
      sales: row?.sales || 0,
    };
  });

  res.json({
    payments,
    summary: {
      totalPayments: totals[0]?.totalPayments || 0,
      paidPayments: totals[0]?.paidPayments || 0,
      revenue: totals[0]?.revenue || 0,
      studentCount: totals[0]?.studentCount || 0,
      packageCount: courses.length,
    },
    monthly,
    topCourses,
  });
});

exports.getCheckoutSession = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const payment = await Payment.findOne({
    stripeCheckoutSessionId: req.params.sessionId,
    student: user.id,
  }).populate("course", "courseId name");
  if (!payment) throw new HttpError(404, "Checkout session not found.");
  const session = await getStripe().checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
  if (session.payment_status !== "paid") {
    return res.json({ status: payment.status, paid: false });
  }

  const course = await Course.findById(payment.course._id);
  if (
    !course ||
    session.metadata?.studentId !== String(payment.student) ||
    session.metadata?.courseId !== String(course.id) ||
    session.amount_total !== Math.round(payment.amount * 100) ||
    session.currency !== payment.currency
  ) {
    throw new HttpError(400, "Payment metadata does not match its order.");
  }
  const wasPaid = payment.status === "paid";
  payment.status = "paid";
  payment.stripePaymentIntentId = session.payment_intent || "";
  payment.paidAt = payment.paidAt || new Date();
  await payment.save();
  const enrollment = await Enrollment.findOneAndUpdate(
    { student: payment.student, course: payment.course._id },
    { $setOnInsert: { student: payment.student, course: payment.course._id, payment: payment.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!wasPaid && req.io) {
    const notification = {
      courseId: course.courseId,
      courseName: course.name,
      enrolledAt: enrollment.enrolledAt,
    };
    req.io.to(`user:${payment.student}`).emit("enrollment:created", notification);
    req.io.to("role:admin").emit("payment:completed", {
      ...notification,
      amount: payment.amount,
      currency: payment.currency,
    });
  }
  res.json({ status: "paid", paid: true, courseId: course.courseId, courseName: course.name });
});

export const handleStripeWebhook = async (req: import("express").Request, res: import("express").Response): Promise<void> => {
  const signature = req.get("stripe-signature");
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Stripe webhook is not configured.");
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error: unknown) {
    throw new HttpError(400, `Invalid Stripe webhook signature: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const payment = await Payment.findOne({ stripeCheckoutSessionId: session.id });
      if (!payment) throw new HttpError(404, "Payment record not found.");
      const course = await Course.findById(payment.course);
      if (
        !course ||
        session.metadata?.studentId !== String(payment.student) ||
        session.metadata?.courseId !== String(course.id) ||
        session.amount_total !== Math.round(payment.amount * 100) ||
        session.currency !== payment.currency
      ) {
        throw new HttpError(400, "Payment metadata does not match its order.");
      }

      const wasPaid = payment.status === "paid";
      payment.status = "paid";
      payment.stripePaymentIntentId = session.payment_intent || "";
      payment.paidAt = payment.paidAt || new Date();
      await payment.save();
      const enrollment = await Enrollment.findOneAndUpdate(
        { student: payment.student, course: payment.course },
        { $setOnInsert: { student: payment.student, course: payment.course, payment: payment.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (!wasPaid && req.io) {
        req.io.to(`user:${payment.student}`).emit("enrollment:created", {
          courseId: course.courseId,
          courseName: course.name,
          enrolledAt: enrollment.enrolledAt,
        });
      }
    }
  } else if (event.type === "checkout.session.expired") {
    await Payment.findOneAndUpdate(
      { stripeCheckoutSessionId: event.data.object.id, status: "pending" },
      { status: "failed" }
    );
  }
  res.json({ received: true });
};

module.exports = {
  createCheckoutSession: exports.createCheckoutSession,
  listMyPayments: exports.listMyPayments,
  listInstructorPayments: exports.listInstructorPayments,
  getCheckoutSession: exports.getCheckoutSession,
  handleStripeWebhook,
};

export {};
