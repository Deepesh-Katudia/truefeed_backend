const logger = require("../utils/logger");

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === "admin") {
    return next();
  }
  logger.warn(
    "Forbidden admin access attempt to %s from %s",
    req.originalUrl,
    req.ip
  );
  return res.status(403).json({ error: "forbidden" });
}

module.exports = requireAdmin;
