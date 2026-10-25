import multer from "multer";
import path from "node:path";
import HttpError = require("../utils/httpError");

const imageExtensions = new Set([
  ".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jfif",
  ".jpe", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp",
]);
function isImageFile(mimetype: string, originalname: string): boolean {
  const normalizedType = (mimetype || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  if (normalizedType && normalizedType !== "application/octet-stream") return false;
  const extension = path.extname(originalname).toLowerCase();
  return imageExtensions.has(extension);
}

const imageFileFilter: NonNullable<Parameters<typeof multer>[0]>["fileFilter"] = (_req, file, callback) => {
  if (!isImageFile(file.mimetype, file.originalname)) {
    return callback(new HttpError(415, "Choose a supported image file."));
  }
  callback(null, true);
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter,
});

module.exports = { imageUpload, isImageFile };

export {};
