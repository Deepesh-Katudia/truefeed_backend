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
  // 1. Fetch user from Supabase
  const user = await userModel.findByEmail(email);

  // 2. If no user found
  if (!user) return null;

  // 3. Ensure password hash exists
  const hash = user.password_hash || user.passwordHash;

  if (!hash) {
    throw new Error("Password hash missing in database");
  }

  // 4. Compare password safely
  const valid = await bcrypt.compare(password, hash);

  if (!valid) return null;

  // 5. Return full user object
  return user;
}
async function getUserByEmail(email) {
  return userModel.findByEmail(email);
}

module.exports = { registerUser, authenticateUser, getUserByEmail };
