import HttpError = require("./httpError");

const fileIdPattern = /^[a-zA-Z0-9_-]{10,200}$/;

export function getGoogleDriveFileId(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpError(400, "Paste a valid Google Drive video sharing link.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com") {
    throw new HttpError(400, "Use a Google Drive video link that starts with https://drive.google.com/.");
  }

  const filePath = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
  const fileId = filePath?.[1] || parsed.searchParams.get("id") || "";
  if (!fileIdPattern.test(fileId)) {
    throw new HttpError(400, "This does not look like a Google Drive video sharing link.");
  }
  return fileId;
}

export function googleDriveVideoUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export function googleDriveShareUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
