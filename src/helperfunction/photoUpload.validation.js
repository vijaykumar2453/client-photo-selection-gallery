const { createHash } = require("crypto");

// Shared upload checks keep file type, folder paths, retries, and paging rules in one place.
function invalidRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function hasValidImageSignature(file) {
  // MIME types come from the browser; signatures verify the actual uploaded bytes too.
  const buffer = file.buffer;
  if (!buffer || buffer.length < 4) return false;

  switch (file.mimetype) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6));
    case "image/webp":
      return buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP";
    case "image/tiff":
      return buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    case "image/heic": {
      if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
      const brand = buffer.toString("ascii", 8, 12);
      return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
    }
    default:
      return false;
  }
}

function getRelativeFolderPath(relativePath, originalName) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw invalidRequest("Each folder upload must include a relative file path");
  }

  const normalizedPath = relativePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  if (
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalizedPath) ||
    parts.length < 2 ||
    parts.length > 11 ||
    parts.some(part =>
      !part ||
      part === "." ||
      part === ".." ||
      part.length > 120 ||
      /[\u0000-\u001f]/.test(part)
    ) ||
    parts[parts.length - 1] !== originalName ||
    normalizedPath.length > 500
  ) {
    throw invalidRequest("A folder upload contains an invalid relative path");
  }

  return parts.slice(0, -1).join("/");
}

function getUploadKeys(body, files, galleryId) {
  const { uploadId } = body;
  const fileKeys = body.fileKeys === undefined
    ? []
    : Array.isArray(body.fileKeys) ? body.fileKeys : [body.fileKeys];

  if (uploadId === undefined && fileKeys.length === 0) return null;
  if (typeof uploadId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId) ||
      fileKeys.length !== files.length) {
    throw invalidRequest("Upload retry information is invalid");
  }
  if (fileKeys.some(key => typeof key !== "string" || !key || key.length > 1024) ||
      new Set(fileKeys).size !== fileKeys.length) {
    throw invalidRequest("Upload file keys must be unique non-empty strings");
  }

  // Bind retry keys to file bytes and destination so a retry cannot stand in for another upload.
  return fileKeys.map((fileKey, index) =>
    createHash("sha256")
      .update(`${galleryId}:${uploadId}:${fileKey}:`)
      .update(files[index].buffer)
      .digest("hex")
  );
}

function parsePhotoPagination(query) {
  const limitValue = query.limit === undefined ? "48" : query.limit;
  if (typeof limitValue !== "string" || !/^\d+$/.test(limitValue)) {
    throw invalidRequest("limit must be a whole number between 1 and 100");
  }
  const limit = Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw invalidRequest("limit must be a whole number between 1 and 100");
  }

  let cursor = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== "string" || !/^[a-f\d]{24}$/i.test(query.cursor)) {
      throw invalidRequest("cursor must be a valid photo ID");
    }
    cursor = query.cursor;
  }

  return { limit, cursor };
}

module.exports = {
  getRelativeFolderPath,
  hasValidImageSignature,
  getUploadKeys,
  parsePhotoPagination
};
