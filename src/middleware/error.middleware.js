function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: "A record with this value already exists" });
  }
  if (error instanceof require("multer").MulterError ||
      String(error.message || "").startsWith("Only JPG, PNG, WEBP, GIF, HEIC and TIFF images are allowed")) {
    return res.status(400).json({ message: error.message });
  }

  const status = error.statusCode || 500;
  res.status(status).json({
    message: status === 500 ? "Internal server error" : error.message
  });
}

module.exports = { notFound, errorHandler };
