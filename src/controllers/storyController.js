const storyModel = require("../models/storyModel");
const { uploadBufferToUploadsBucket } = require("../services/storageService");


async function create(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const { text, mediaUrl } = req.validatedBody || req.body || {};
  const t = typeof text === "string" ? text.trim() : "";
  const m = typeof mediaUrl === "string" ? mediaUrl.trim() : "";
  if (!t && !m) return res.status(400).json({ error: "text or mediaUrl required" });
  if (t && t.length > 300) return res.status(400).json({ error: "text too long" });
  try {
    req.logger?.info("Creating story for %s", req.session.email);
    const result = await storyModel.createStory({
      userId: req.session.userId,
      text: t,
      mediaUrl: m,
    });
    return res.status(201).json({ id: result.insertedId, expiresAt: result.expiresAt });
  } catch (e) {
    req.logger?.error("Create story error: %o", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function uploadMedia(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const safeName = (req.file.originalname || "file").replace(/\s+/g, "_");
    const path = `stories/${req.session.userId}/${Date.now()}-${safeName}`;

    const publicUrl = await uploadBufferToUploadsBucket({
      path,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    return res.status(201).json({ url: publicUrl });
  } catch (e) {
    req.logger?.error("Story upload error: %o", e);
    return res.status(500).json({ error: "upload failed" });
  }
}


async function feed(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  try {
    const groups = await storyModel.feedActiveByUser();
    return res.json({ users: groups });
  } catch (e) {
    req.logger?.error("Stories feed error: %o", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function markView(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  try {
    await storyModel.markViewed({ storyId: id, viewerUserId: req.session.userId });
    return res.json({ message: "ok" });
  } catch (e) {
    req.logger?.error("Mark story view error: %o", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { create, uploadMedia, feed, markView };
