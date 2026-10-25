const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { jwtSecret, jwtExpiresIn, cookieName, nodeEnv } = require("../config/env");
import type { Response } from "express";

function signToken(userId: string) {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  });
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, hashToken };

export {};
