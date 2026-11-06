const crypto = require("crypto");

// The raw token is shared with the user; only its digest is saved in MongoDB.
function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  };
}

function getPasswordResetUrl(token) {
  const port = process.env.PORT || 5000;
  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }
  if (!["http:", "https:"].includes(url.protocol) ||
      (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_BASE_URL must use HTTPS except for localhost");
  }

  return new URL(
    `/admin/reset-password?token=${encodeURIComponent(token)}`,
    url.origin
  ).toString();
}

module.exports = { createPasswordResetToken, getPasswordResetUrl };
