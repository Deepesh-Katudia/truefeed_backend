const userModel = require("../models/userModel");

// Update current user's profile fields: picture_url, description, phone, name
async function updateMe(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { picture, picture_url, description, phone, name } =
    req.validatedBody || req.body || {};

  const updates = {};
  // accept either key but store into picture_url
  const pic = typeof picture_url === "string" ? picture_url : picture;
  if (typeof pic === "string") updates.picture_url = pic;

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
