const crypto = require("node:crypto");
const User = require("../models/User");
const RegistrationVerification = require("../models/RegistrationVerification");
const bcrypt = require("bcryptjs");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
const { signToken, setAuthCookie, clearAuthCookie, hashToken } = require("../utils/tokens");
const { sendPasswordResetEmail, sendRegistrationVerificationEmail } = require("../services/email");
const { clientUrl } = require("../config/env");
import { strongPasswordPattern } from "../utils/password";
import type { Request, Response } from "express";
import { requireUser, requireValidated } from "../utils/request";

function sendSession(res: import("express").Response, user: { id: string }, status = 200) {
  setAuthCookie(res, signToken(user.id));
  res.status(status).json({ user });
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = requireValidated<{ name: string; email: string; password: string }>(req).body;
  if (await User.exists({ email })) throw new HttpError(409, "An account with this email already exists.");
  const code = crypto.randomInt(100000, 1000000).toString();
  const [passwordHash, codeHash] = await Promise.all([
    bcrypt.hash(password, 12),
    bcrypt.hash(code, 10),
  ]);
  await RegistrationVerification.findOneAndUpdate(
    { email },
    {
      name,
      email,
      passwordHash,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await sendRegistrationVerificationEmail(email, code);
  res.status(200).json({ verificationRequired: true, email });
});

exports.resendRegistrationCode = asyncHandler(async (req, res) => {
  const { email } = requireValidated<{ email: string }>(req).body;
  const pending = await RegistrationVerification.findOne({ email });
  if (pending && pending.expiresAt > new Date()) {
    const code = crypto.randomInt(100000, 1000000).toString();
    pending.codeHash = await bcrypt.hash(code, 10);
    pending.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    pending.attempts = 0;
    await pending.save();
    await sendRegistrationVerificationEmail(email, code);
  }
  res.json({ message: "If a registration is pending, a new verification code has been sent." });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = requireValidated<{ email: string; code: string }>(req).body;
  const pending = await RegistrationVerification.findOne({ email }).select("+passwordHash +codeHash");
  if (!pending || pending.expiresAt <= new Date()) {
    if (pending) await pending.deleteOne();
    throw new HttpError(400, "This verification code has expired. Request a new one.");
  }
  if (pending.attempts >= 5) {
    await pending.deleteOne();
    throw new HttpError(429, "Too many incorrect attempts. Start registration again.");
  }
  if (!(await bcrypt.compare(code, pending.codeHash))) {
    pending.attempts += 1;
    await pending.save();
    throw new HttpError(400, "That verification code is incorrect.");
  }
  if (await User.exists({ email })) {
    await pending.deleteOne();
    throw new HttpError(409, "An account with this email already exists.");
  }
  const user = new User({
    name: pending.name,
    email: pending.email,
    password: pending.passwordHash,
    role: "student",
  });
  user.$locals.passwordIsHashed = true;
  await user.save();
  await pending.deleteOne();
  sendSession(res, user, 201);
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = requireValidated<{ email: string; password: string }>(req).body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !user.isActive || !(await user.comparePassword(password))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  user.lastLoginAt = new Date();
  await user.save();
  sendSession(res, user);
});

exports.logout = (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.status(200).json({ message: "Signed out." });
};

exports.me = (req: Request, res: Response) => res.json({ user: requireUser(req) });

exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(requireUser(req).id, requireValidated(req).body, {
    new: true,
    runValidators: true,
  });
  res.json({ user });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !strongPasswordPattern.test(newPassword)) {
    throw new HttpError(400, "Use 8–128 characters with an uppercase letter, a lowercase letter, and a number.");
  }
  const user = await User.findById(requireUser(req).id).select("+password");
  if (!user) throw new HttpError(404, "User not found.");
  if (!(await user.comparePassword(currentPassword))) throw new HttpError(400, "Current password is incorrect.");
  user.password = newPassword;
  await user.save();
  setAuthCookie(res, signToken(user.id));
  res.json({ message: "Password updated." });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email) throw new HttpError(400, "Email is required.");
  const user = await User.findOne({ email });
  if (user && user.isActive) {
    const token = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    const resetUrl = `${clientUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }
  res.json({ message: "If an account exists for that email, a reset link has been sent." });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== "string" || typeof password !== "string" || !strongPasswordPattern.test(password)) {
    throw new HttpError(400, "A valid reset token and a password with 8–128 characters, uppercase and lowercase letters, and a number are required.");
  }
  const resetTokenHash = hashToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: resetTokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt +password");
  if (!user) throw new HttpError(400, "The password reset link is invalid or expired.");

  const legacyName = typeof user.name === "string" && user.name.trim()
    ? user.name
    : user.email.split("@")[0]?.replace(/[._+-]+/g, " ").trim() || "Learner";
  const updates: Record<string, string> = {
    password: await bcrypt.hash(password, 12),
    name: legacyName.length >= 2 ? legacyName.slice(0, 80) : "Learner",
  };
  if (user.role === "user") updates.role = "student";

  const result = await User.updateOne(
    {
      _id: user.id,
      passwordResetTokenHash: resetTokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    },
    {
      $set: updates,
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
    },
    { runValidators: true }
  );
  if (result.modifiedCount !== 1) throw new HttpError(400, "The password reset link is invalid or expired.");

  const updatedUser = await User.findById(user.id);
  if (!updatedUser) throw new HttpError(404, "User not found.");
  sendSession(res, updatedUser);
});

module.exports = {
  register: exports.register,
  resendRegistrationCode: exports.resendRegistrationCode,
  verifyEmail: exports.verifyEmail,
  login: exports.login,
  logout: exports.logout,
  me: exports.me,
  updateProfile: exports.updateProfile,
  changePassword: exports.changePassword,
  forgotPassword: exports.forgotPassword,
  resetPassword: exports.resetPassword,
};

export {};
