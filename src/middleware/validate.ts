import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import HttpError = require("../utils/httpError");

interface ValidatedData {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
}

const validate = (schema: ZodType<ValidatedData>): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body || {},
    params: req.params || {},
    query: req.query || {},
  });
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.slice(1).join(".")}: ${issue.message}`).join("; ");
    return next(new HttpError(400, message));
  }
  req.validated = result.data;
  next();
};

module.exports = validate;
