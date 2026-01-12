const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");

/**
 * Expects userModel.findByEmail(email) to return:
 * { id, email, name, password_hash, role, ... }
 *
 * Expects userModel.createUser(...) to return:
 * { id, email, name, role, ... }
 */

async function registerUser({ name, email, password }) {
  const existing = await userModel.findByEmail(email);
  if (existing) throw new Error("UserExists");

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  const created = await userModel.createUser({
    name,
    email,
    passwordHash: hash,
    role: "user",
  });

  return { id: created.id, email: created.email, role: created.role };
}

async function authenticateUser({ email, password }) {
  const user = await userModel.findByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  // return user object (controller uses id + role)
  return user;
}

async function getUserByEmail(email) {
  return userModel.findByEmail(email);
}

module.exports = { registerUser, authenticateUser, getUserByEmail };
