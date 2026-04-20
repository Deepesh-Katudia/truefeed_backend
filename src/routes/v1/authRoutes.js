const express = require("express");
const router = express.Router();

const controller = require("../../controllers/authController");

// Register new user
router.post("/register", controller.register);

// Login existing user
router.post("/login", controller.login);

// Logout
router.post("/logout", controller.logout);

// Current session user info
router.get("/me", controller.me);

module.exports = router;
