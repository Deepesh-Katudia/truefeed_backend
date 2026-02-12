const authService = require("../services/authService");
const logger = require("../utils/logger");

async function register(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }

  try {
    const result = await authService.registerUser({ name, email, password });

    // Ensure session uses the same ID format everywhere
    req.session.userId = String(result.id);
    req.session.email = result.email;
    req.session.role = result.role || "user";

    logger.info("New user registered (controller): %s", email);

    req.session.save((err) => {
      if (err) {
        logger.error("Error saving session after register %s: %o", email, err);
        return res.status(500).json({ error: "could not establish session" });
      }

      // Return same shape your frontend expects
      return res.status(201).json({
        user: {
          _id: result.id,
          name: result.name || "",
          email: result.email,
          role: result.role || "user",
          createdAt: result.created_at || null,
        },
      });
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
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });
  try {
    const user = await authService.authenticateUser({ email, password });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    req.session.userId = user.id.toString();
    req.session.email = user.email;
    req.session.role = user.role || "user";
    logger.info("User logged in (controller): %s", user.email);
    req.session.save((err) => {
      if (err) {
        logger.error(
          "Error saving session after login (controller) %s: %o",
          user.email,
          err
        );
        return res.status(500).json({ error: "could not establish session" });
      }
      return res.json({ message: "Logged in" });
    });
  } catch (err) {
    logger.error("Login controller error for %s: %o", email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function logout(req, res) {
  const userEmail = req.session?.email;
  req.session.destroy((err) => {
    if (err) {
      logger.error(
        "Error during logout (controller) for %s: %o",
        userEmail || "unknown",
        err
      );
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("connect.sid");
    logger.info("User logged out (controller): %s", userEmail || "unknown");
    return res.json({ message: "Logged out" });
  });
}

async function me(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const user = await authService.getUserByEmail(req.session.email);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { password_hash, ...rest } = user;

    // IMPORTANT: normalize field names for frontend
    // Supabase column: picture_url
    // Frontend expects: picture
    const normalized = {
      ...rest,
      picture: rest.picture || rest.picture_url || null,
      _id: rest._id || rest.id || req.session.userId, // optional, keeps frontend consistent
    };

    return res.json({ user: normalized });
  } catch (err) {
    logger.error(
      "Me controller error for %s: %o",
      req.session?.email || "unknown",
      err
    );
    return res.status(500).json({ error: "Internal server error" });
  }
}


module.exports = { register, login, logout, me };
