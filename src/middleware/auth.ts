import jwt from "jsonwebtoken";
const { jwtSecret, cookieName, clientUrl } = require("../config/env");
const User = require("../models/User");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import type { RequestHandler } from "express";
import type { UserRole } from "../types/express";

function getToken(req: import("express").Request): string | undefined {
  const authorization = req.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return req.cookies?.[cookieName];
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, "Please sign in to continue.");
  if (!req.get("authorization") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin && origin !== clientUrl) throw new HttpError(403, "Request origin is not allowed.");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, "Your session is invalid or has expired.");
  }

  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive) throw new HttpError(401, "Your account is unavailable.");
  req.user = user;
  next();
});

function authorize(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}

module.exports = { requireAuth, authorize, getToken };

export {};
