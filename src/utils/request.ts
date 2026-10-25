import type { Request } from "express";
import type { AuthenticatedUser } from "../types/express";
import HttpError = require("./httpError");

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new HttpError(401, "Please sign in to continue.");
  return req.user;
}

export function requireValidated<Body extends Record<string, unknown> = Record<string, unknown>>(req: Request): {
  body: Body;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
} {
  if (!req.validated) throw new HttpError(400, "Request data was not validated.");
  return req.validated as { body: Body; params: Record<string, string>; query: Record<string, string | undefined> };
}
