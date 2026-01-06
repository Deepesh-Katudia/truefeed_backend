const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
// session-based authentication (no JWT issuance here)
const { connect } = require("../config/dbConnection");
const logger = require("../utils/logger");

// Register new user
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password) {
    logger.warn("Register attempt with missing credentials from %s", req.ip);
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const { client, db } = await connect("write");
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      await client.close();
      logger.info("Register failed: user already exists: %s", email);
      return res.status(409).json({ error: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const result = await users.insertOne({
      name,
      email,
      password: hash,
      createdAt: new Date(),
    });
    // create session so user is logged in immediately after registering
    req.session.userId = result.insertedId.toString();
    req.session.email = email;

    await client.close();
    logger.info(
      "New user registered: %s (id=%s)",
      email,
      result.insertedId.toString()
    );

    // ensure session is saved before responding so cookie is sent
    req.session.save((err) => {
      if (err) {
        logger.error(
          "Error saving session after register for %s: %o",
          email,
          err
        );
        return res.status(500).json({ error: "could not establish session" });
      }
      return res.status(201).json({ id: result.insertedId, email });
    });
  } catch (err) {
    logger.error("Error during register for %s: %o", email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Login existing user
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    logger.warn("Login attempt with missing credentials from %s", req.ip);
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const { client, db } = await connect("read");
    const users = db.collection("users");

    const user = await users.findOne({ email });
    if (!user) {
      await client.close();
      logger.warn("Login failed - user not found: %s", email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await client.close();
      logger.warn("Login failed - invalid password for %s", email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // create session
    req.session.userId = user._id.toString();
    req.session.email = user.email;

    await client.close();
    logger.info("User logged in: %s (id=%s)", user.email, user._id.toString());

    // ensure session is saved before responding so cookie is sent
    req.session.save((err) => {
      if (err) {
        logger.error(
          "Error saving session after login for %s: %o",
          user.email,
          err
        );
        return res.status(500).json({ error: "could not establish session" });
      }
      return res.json({ message: "Logged in" });
    });
  } catch (err) {
    logger.error("Error during login for %s: %o", email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  const userEmail = req.session?.email;
  req.session.destroy((err) => {
    if (err) {
      logger.error(
        "Error during logout for %s: %o",
        userEmail || "unknown",
        err
      );
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("connect.sid");
    logger.info("User logged out: %s", userEmail || "unknown");
    return res.json({ message: "Logged out" });
  });
});

// Current session user
router.get("/me", async (req, res) => {
  if (!req.session || !req.session.userId) {
    logger.warn("Unauthenticated /me access from %s", req.ip);
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const { client, db } = await connect("read");
    const users = db.collection("users");
    // use email stored in session to avoid ObjectId usage
    const user = await users.findOne(
      { email: req.session.email },
      { projection: { password: 0 } }
    );
    await client.close();
    if (!user) return res.status(404).json({ error: "User not found" });
    logger.info("Fetched /me for %s", req.session?.email || "unknown");
    return res.json({ user });
  } catch (err) {
    logger.error(
      "Error fetching /me for %s: %o",
      req.session?.email || "unknown",
      err
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
