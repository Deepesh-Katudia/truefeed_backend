const userModel = require("../models/userModel");

// Update current user's profile fields: picture, description, phone
async function updateMe(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { picture, description, phone, name } = req.validatedBody || req.body || {};
  const updates = {};
  if (typeof picture === "string") updates.picture = picture;
  if (typeof description === "string") updates.description = description;
  if (typeof phone === "string") updates.phone = phone;
  if (typeof name === "string") updates.name = name;

  try {
    await userModel.updateUserById(req.session.userId, updates);
    return res.json({ message: "Profile updated" });
  } catch (err) {
    req.logger?.error("updateMe error for %s: %o", req.session.email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { updateMe };
