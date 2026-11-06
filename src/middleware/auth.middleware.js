const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const ClientAccess = require("../models/clientAccess.model");

// Tokens identify a role and record; this middleware reloads the record for each protected request.
// Read bearer tokens consistently for both roles; other authorization schemes are not accepted.
function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

async function requireAdmin(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "Admin login required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin" || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    // Reload the account so deleted admins lose access even while an old token is unexpired.
    const admin = await User.findById(decoded.id);
    if (!admin) return res.status(401).json({ message: "Admin account not found" });
    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

async function requireClient(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "Client login required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "client" || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(403).json({ message: "Client access only" });
    }

    // Reload account status on each request so a disabled client cannot keep using its token.
    const client = await ClientAccess.findById(decoded.id);
    if (!client || !client.isActive) {
      return res.status(401).json({ message: "Client account is disabled or missing" });
    }
    req.clientAccess = client;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin, requireClient };
