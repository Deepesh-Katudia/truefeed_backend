const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { JWT_SECRET } = require("../config/envPath");

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // normalize payload shape for rest of app
    req.user = {
      userId: String(payload.userId || payload.id || payload._id || ""),
      email: payload.email || "",
      role: payload.role || "user",
    };

    if (!req.user.userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    return next();
  } catch (err) {
    logger.warn("JWT verify failed: %s", err?.message || err);
    return res.status(401).json({ error: "unauthorized" });
  }
}

module.exports = requireAuth;