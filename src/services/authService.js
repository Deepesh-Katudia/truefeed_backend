const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");

async function registerUser({ name, email, password }) {
  const existing = await userModel.findByEmail(email);
  if (existing) throw new Error("UserExists");
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  // new users default to role 'user'
  const result = await userModel.createUser({
    name,
    email,
    password: hash,
    role: "user",
    createdAt: new Date(),
  });
  return { id: result.insertedId, email };
}

async function authenticateUser({ email, password }) {
  const user = await userModel.findByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  return user;
}

async function getUserByEmail(email) {
  return userModel.findByEmail(email);
}

module.exports = { registerUser, authenticateUser, getUserByEmail };
