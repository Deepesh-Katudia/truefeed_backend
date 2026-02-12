const userModel = require("../models/userModel");

// Update current user's profile fields: picture_url, description, phone, name
async function updateMe(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { picture, picture_url, description, phone, name } =
    req.validatedBody || req.body || {};

  const updates = {};

  // Accept either picture or picture_url, but always persist to picture_url
  const pic = typeof picture_url === "string" ? picture_url : picture;
  if (typeof pic === "string" && pic.length > 0) {
    updates.picture_url = pic;
  }

  if (typeof description === "string") updates.description = description;
  if (typeof phone === "string") updates.phone = phone;
  if (typeof name === "string") updates.name = name;

  // Nothing to update
  if (Object.keys(updates).length === 0) {
    return res.json({ message: "No changes" });
  }

  try {
    // IMPORTANT: get updated row back
    const updatedUser = await userModel.updateUserById(
      req.session.userId,
      updates
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Normalize for frontend
    const responseUser = {
      ...updatedUser,
      _id: updatedUser.id,
      picture: updatedUser.picture_url || null,
    };

    return res.json({
      message: "Profile updated",
      user: responseUser,
    });
  } catch (err) {
    req.logger?.error(
      "updateMe error for %s: %o",
      req.session.email,
      err
    );
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { updateMe };
