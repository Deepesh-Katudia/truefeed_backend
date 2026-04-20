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

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    role: created.role,
    created_at: created.created_at,
  };
}

async function authenticateUser({ email, password }) {

  const user = await userModel.findByEmail(email);

  if (!user) return null;

  const hash = user.password_hash || user.passwordHash;

  if (!hash) {
    throw new Error("Password hash missing in database");
  }

  const valid = await bcrypt.compare(password, hash);

  if (!valid) return null;
  return user;
}
async function getUserByEmail(email) {
  return userModel.findByEmail(email);
}

module.exports = { registerUser, authenticateUser, getUserByEmail };
