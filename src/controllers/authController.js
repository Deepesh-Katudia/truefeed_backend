const authService = require("../services/authService");
const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, NODE_ENV } = require("../config/envPath");

function signToken(payload) {
  // keep it simple: 7 days
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim();
}

async function register(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }

  try {
    const result = await authService.registerUser({ name, email, password });

    const token = signToken({
      userId: String(result.id),
      email: result.email,
      role: result.role || "user",
    });

    logger.info("New user registered (controller): %s", email);

    return res.status(201).json({
      user: {
        _id: result.id,
        name: result.name || "",
        email: result.email,
        role: result.role || "user",
        createdAt: result.created_at || null,
      },
      token,
    });
  } catch (err) {
    if (err.message === "UserExists") {
      return res.status(409).json({ error: "User already exists" });
    }
    logger.error("Register controller error for %s: %o", email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const user = await authService.authenticateUser({ email, password });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({
      userId: String(user.id),
      email: user.email,
      role: user.role || "user",
    });

    logger.info("User logged in (controller): %s", user.email);

    // keep response small
    return res.json({ token });
  } catch (err) {
    logger.error("Login controller error for %s: %o", email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function logout(req, res) {
  // Stateless JWT: frontend deletes token.
  return res.json({ message: "Logged out" });
}

async function me(req, res) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    // you already have getUserByEmail; keep using it
    const user = await authService.getUserByEmail(decoded.email);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { password_hash, ...rest } = user;

    const normalized = {
      ...rest,
      picture: rest.picture || rest.picture_url || null,
      _id: rest._id || rest.id || decoded.userId,
    };

    return res.json({ user: normalized });
  } catch (err) {
    logger.error("Me controller error for %s: %o", decoded?.email || "unknown", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { register, login, logout, me };