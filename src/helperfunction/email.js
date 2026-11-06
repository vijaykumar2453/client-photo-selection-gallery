function getEmailConfiguration() {
  const { RESEND_API_KEY, RESEND_FROM, APP_BASE_URL } = process.env;
  const missingSettings = [
    ["RESEND_API_KEY", RESEND_API_KEY],
    ["RESEND_FROM", RESEND_FROM],
    ["APP_BASE_URL", APP_BASE_URL]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missingSettings.length > 0) {
    const error = new Error(
      `Password reset email is not configured. Add ${missingSettings.join(", ")} to .env.`
    );
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  let baseUrl;
  try {
    baseUrl = new URL(APP_BASE_URL);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }
  if (!["http:", "https:"].includes(baseUrl.protocol) ||
      (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname))) {
    throw new Error("APP_BASE_URL must use HTTPS except for localhost");
  }

  return {
    apiKey: RESEND_API_KEY,
    from: RESEND_FROM,
    baseUrl: baseUrl.origin
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

async function sendPasswordResetEmail(admin, token) {
  const config = getEmailConfiguration();
  const resetUrl = new URL(
    `/admin/reset-password?token=${encodeURIComponent(token)}`,
    config.baseUrl
  ).toString();
  const name = escapeHtml(admin.name);
  let response;
  try {
    // Use Resend's HTTP API so email delivery does not require an SMTP client package.
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: config.from,
        to: [admin.email],
        subject: "Reset your PhotoSelection admin password",
        text: `Hello ${admin.name},\n\nUse this link to reset your admin password. It expires in one hour and can only be used once:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Hello ${name},</p><p>Use the link below to reset your admin password. It expires in one hour and can only be used once.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`
      })
    });
  } catch (error) {
    const deliveryError = new Error("Could not connect to Resend to send the reset email.");
    deliveryError.cause = error;
    throw deliveryError;
  }

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const detail = typeof result.message === "string" ? ` ${result.message}` : "";
    throw new Error(`Resend could not send the reset email (HTTP ${response.status}).${detail}`);
  }
}

module.exports = { sendPasswordResetEmail };
