const { GridFSBucket } = require("mongodb");
const { connect } = require("../config/dbConnection");
const storyModel = require("../models/storyModel");

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
  const { client, db } = await connect("write");
  try {
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const filename = `${req.session.userId}-story-${Date.now()}-${(req.file.originalname || "file").replace(/\s+/g, "_")}`;
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype || "application/octet-stream",
      metadata: { userId: req.session.userId, kind: "story" },
    });
    uploadStream.end(req.file.buffer);
    uploadStream.on("finish", async (file) => {
      await client.close();
      return res.status(201).json({ url: `/api/v1/files/${file._id.toString()}` });
    });
    uploadStream.on("error", async () => {
      await client.close();
      req.logger?.error("Story upload failed");
      return res.status(500).json({ error: "upload failed" });
    });
  } catch (e) {
    await client.close();
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
