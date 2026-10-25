import type { ErrorRequestHandler } from "express";
const { nodeEnv } = require("../config/env");

const errorHandler: ErrorRequestHandler = (error: Error & { status?: number; code?: number | string; name?: string }, _req, res, _next) => {
  if (error.name === "MulterError") {
    return res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? "Image is larger than the 5 MB upload limit. Choose a smaller image and try again."
        : error.message,
    });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: "A record with that value already exists." });
  }
  const status = error.status || (error.name === "ValidationError" ? 400 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 && nodeEnv === "production" ? "An unexpected server error occurred." : error.message,
  });
};

module.exports = errorHandler;

export {};
